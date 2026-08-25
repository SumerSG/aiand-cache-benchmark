#!/usr/bin/env node
// ai& cache benchmark — runs scripted mini-projects against the live ai& API
// and measures actual prompt-caching behavior per complexity tier.
//
// Usage:
//   node run.mjs                     # default: low+medium on 5 models, high on flash+pro (~$2)
//   node run.mjs --all               # full matrix: 9 projects × 5 models (~$4-6)
//   node run.mjs --models deepseek-ai/deepseek-v4-flash,zai-org/glm-5.2
//   node run.mjs --tier low
//
// Key: $AIAND_API_KEY, or the stored opencode credential (~/.local/share/opencode/auth.json).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeLow } from "./workloads/low.mjs";
import { MEDIUM } from "./workloads/medium.mjs";
import { HIGH } from "./workloads/high.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_MODELS = [
  "deepseek-ai/deepseek-v4-flash",
  "qwen/qwen3.6-27b",
  "deepseek-ai/deepseek-v4-pro",
  "zai-org/glm-5.2",
  "moonshotai/kimi-k3",
];
const HIGH_DEFAULT_MODELS = ["deepseek-ai/deepseek-v4-flash", "deepseek-ai/deepseek-v4-pro"];

// ---------- args ----------
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const ALL = args.includes("--all");
const ONLY_TIER = flag("tier");
const ONLY_PROJECT = flag("project");
const MODELS = flag("models")?.split(",") ?? DEFAULT_MODELS;

// ---------- auth ----------
function getKey() {
  if (process.env.AIAND_API_KEY) return process.env.AIAND_API_KEY;
  try {
    const auth = JSON.parse(readFileSync(join(homedir(), ".local/share/opencode/auth.json"), "utf8"));
    if (auth?.opencode?.key) return auth.opencode.key;
  } catch {}
  console.error("No API key. Set AIAND_API_KEY or log in via the opencode CLI.");
  process.exit(1);
}
const KEY = getKey();

// ---------- API ----------
async function chat(model, messages, { tools } = {}) {
  const body = { model, messages };
  if (tools) body.tools = tools;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch("https://api.aiand.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        "X-Aiand-Metrics": "true",
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const json = await res.json();
      const u = json.usage ?? {};
      return {
        message: json.choices?.[0]?.message ?? {},
        promptTokens: u.prompt_tokens ?? 0,
        cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
        completionTokens: u.completion_tokens ?? 0,
        cost: res.headers.get("x-cost") ? Number(res.headers.get("x-cost")) : null,
      };
    }
    lastErr = new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    if (res.status < 500) throw lastErr; // 4xx is a real bug — don't retry
    await sleep(2000 * attempt); // transient 5xx (e.g. upstream VPC blips)
  }
  throw lastErr;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (r) => ({
  promptTokens: r.promptTokens,
  cachedTokens: r.cachedTokens,
  completionTokens: r.completionTokens,
  cost: r.cost,
});

// ---------- workload runners ----------
// Cache reuse is org-scoped and model-agnostic, so isolation must be per
// (run × model) — otherwise identical content played on an earlier model
// would hit the cache when replayed on the next one.
function tagFor(model) {
  return `${RUN_TAG}-${model.replaceAll("/", "-")}`;
}

async function runLow(model, project) {
  // one-shot calls sharing only a system prompt
  const tag = tagFor(model);
  const calls = [];
  for (let i = 0; i < project.prompts.length; i++) {
    const r = await chat(model, [
      { role: "system", content: `${tag}\n${project.system}` },
      { role: "user", content: i === 0 ? `${tag}\n${project.prompts[i]}` : project.prompts[i] },
    ]);
    calls.push({ step: i + 1, ...pick(r) });
    await sleep(1200); // stay inside rate limits + cache window
  }
  return { calls };
}

async function runMedium(model, project) {
  // real multi-turn chat build: each turn re-sends the full conversation
  const tag = tagFor(model);
  const messages = [{ role: "system", content: `${tag}\n${project.system}` }];
  const calls = [];
  for (let i = 0; i < project.turns.length; i++) {
    // tag only the first turn; the growing trajectory carries it forward
    messages.push({ role: "user", content: i === 0 ? `${tag}\n${project.turns[i]}` : project.turns[i] });
    const r = await chat(model, messages);
    messages.push({ role: "assistant", content: r.message.content ?? "" });
    calls.push({ step: i + 1, ...pick(r) });
    await sleep(1200);
  }
  return { calls };
}

const FAKE_FS = {}; // fake tool backends for the agentic tier
const TOOLS = [
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write a file to the project",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file from the project",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command (e.g. tests)",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
    },
  },
  {
    type: "function",
    function: {
      name: "finish",
      description: "Declare the project complete",
      parameters: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
    },
  },
];

function execTool(name, args) {
  if (name === "write_file") {
    const content = String(args.content ?? "");
    const path = String(args.path ?? "unnamed.txt");
    FAKE_FS[path] = content;
    return `wrote ${path} (${content.length} bytes)`;
  }
  if (name === "read_file") return FAKE_FS[String(args.path)] ?? `ENOENT: ${args.path}`;
  if (name === "run_command") return String(args.command ?? "").includes("test") ? "3 passing, 0 failing" : "ok";
  return "ok";
}

async function runHigh(model, project, maxSteps = 20) {
  // real agentic tool loop: model calls tools, trajectory grows each step
  const tag = tagFor(model);
  const messages = [
    { role: "system", content: `${tag}\n${project.system}` },
    { role: "user", content: `${tag}\n${project.task}` },
  ];
  const calls = [];
  for (let step = 1; step <= maxSteps; step++) {
    const r = await chat(model, messages, { tools: TOOLS });
    calls.push({ step, ...pick(r) });
    const msg = r.message;
    const tc = msg.tool_calls?.[0];
    if (!tc || tc.function.name === "finish") break;
    messages.push(msg);
    let toolArgs = {};
    try { toolArgs = JSON.parse(tc.function.arguments || "{}"); } catch {}
    messages.push({ role: "tool", tool_call_id: tc.id, content: String(execTool(tc.function.name, toolArgs)) });
    await sleep(1200);
  }
  return { calls };
}

// ---------- main ----------
// Unique tag per run: prepended to the system prompt and first user message so
// the org-scoped ~10-minute cache from a previous run can never contaminate
// this run's measurements.
const RUN_TAG = `[bench-${Date.now().toString(36)}]`;
const LOW = makeLow(Math.floor(Math.random() * 1_000_000));

const TIERS = [
  { name: "low", projects: LOW, runner: runLow, models: MODELS },
  { name: "medium", projects: MEDIUM, runner: runMedium, models: MODELS },
  { name: "high", projects: HIGH, runner: runHigh, models: ALL ? MODELS : HIGH_DEFAULT_MODELS },
];

const results = [];
let totalCost = 0;

for (const tier of TIERS) {
  if (ONLY_TIER && tier.name !== ONLY_TIER) continue;
  for (const project of tier.projects) {
    if (ONLY_PROJECT && project.id !== ONLY_PROJECT) continue;
    for (const model of tier.models) {
      process.stdout.write(`${tier.name}/${project.id} on ${model} ... `);
      try {
        const { calls } = await tier.runner(model, project);
        const input = calls.reduce((s, c) => s + c.promptTokens, 0);
        const cached = calls.reduce((s, c) => s + c.cachedTokens, 0);
        const cost = calls.reduce((s, c) => s + (c.cost ?? 0), 0);
        totalCost += cost;
        const share = input > 0 ? cached / input : 0;
        results.push({ tier: tier.name, project: project.id, model, calls, input, cached, share, cost });
        console.log(`${calls.length} calls, ${(share * 100).toFixed(1)}% repeated, $${cost.toFixed(4)}`);
      } catch (e) {
        console.log(`FAILED: ${e.message}`);
        results.push({ tier: tier.name, project: project.id, model, error: e.message });
      }
    }
  }
}

// ---------- summary ----------
mkdirSync(join(__dirname, "results"), { recursive: true });
const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
writeFileSync(join(__dirname, "results", `results-${stamp}.json`), JSON.stringify(results, null, 2));

console.log("\n=== Repeat share by tier (token-pooled) ===");
const tierAgg = {};
for (const r of results) {
  if (r.error) continue;
  tierAgg[r.tier] ??= { input: 0, cached: 0, calls: 0, cost: 0 };
  tierAgg[r.tier].input += r.input;
  tierAgg[r.tier].cached += r.cached;
  tierAgg[r.tier].calls += r.calls.length;
  tierAgg[r.tier].cost += r.cost;
}
for (const [tier, a] of Object.entries(tierAgg)) {
  console.log(`${tier.padEnd(7)} ${((a.cached / a.input) * 100).toFixed(1).padStart(5)}% repeated  (${a.calls} calls, $${a.cost.toFixed(3)})`);
}
console.log(`\nTotal API cost: $${totalCost.toFixed(3)}`);
console.log(`Results: results/results-${stamp}.json`);

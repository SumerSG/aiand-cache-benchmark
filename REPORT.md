# Measuring Prompt Caching on the ai& API

**A full report: what we tested, how, and what we found.**
*August 24–25, 2026 · 233 API calls · 5 models · $1.94 total spend*

---

## 1. The question, in plain English

ai& (like most AI inference platforms) offers **prompt caching**: if your request starts with
content you recently sent, that repeated part is billed at a much cheaper "cached" rate —
automatically, with no code changes.

The [pricing calculator](https://aiand-pricing-calculator-c79855ed.onbld.com) needed to answer:
*"how much of a typical request is repeated content?"* The docs explain the mechanism but publish
**no averages**. So instead of guessing, we built real mini-projects and measured.

---

## 2. Sixty seconds of background

**Tokens.** Models don't read words — they read *tokens*, little chunks of text (roughly 0.75
words each). "Summarize this report" ≈ 4 tokens. You pay per token.

**Prefix caching.** The cache works like re-reading a document: if the *beginning* of your new
request is byte-identical to one you sent in the last ~10 minutes, the platform remembers reading
it and charges the cheaper rate for that part. Only the **leading portion** (the *prefix*) can
match — like two people reading the same book from page 1, versus different books entirely.

**Why task complexity matters.** A one-shot task ("summarize this") sends mostly-new content every
time. A chatbot re-sends the *entire conversation* every turn. An AI agent running a 20-step build
re-sends its instructions, tool definitions, *and* every previous step. More steps → more repetition
→ more caching savings. That's the hypothesis we wanted to put real numbers on.

---

## 3. The experiment design

Three complexity tiers, three diverse mini-projects each, played end-to-end against the live API:

| Tier | Projects | The idea |
|---|---|---|
| **Low** — one-shot | market report summary, postmortem review, grant evaluation | Independent calls; only a shared system prompt can repeat |
| **Medium** — multi-turn | expense tracker web app, CSV cleaner CLI, Chrome extension | 8-turn chat builds; conversation re-sent every turn |
| **High** — agentic | todo CLI + tests, API client library, data pipeline | Tool-calling loops; full trajectory re-sent every step |

Five models spanning the catalog's price and capability range:

`deepseek-v4-flash` ($0.15/$0.25 per 1M) · `qwen3.6-27b` ($0.32/$3.20) · `deepseek-v4-pro` ($1.00/$2.50) · `glm-5.2` ($1.00/$4.00) · `kimi-k3` ($3.00/$12.50)

---

## 4. The test harness

A zero-dependency Node script (`run.mjs`). The core trick is that it fills the message array
**exactly the way a real application does**:

**Multi-turn (medium tier):**
```js
const messages = [{ role: "system", content: project.system }];
for (const turn of project.turns) {
  messages.push({ role: "user", content: turn });        // scripted user message
  const r = await chat(model, messages);                 // send the WHOLE history
  messages.push({ role: "assistant", content: r.message.content }); // real reply appended
}
```

So by turn 3 the API receives:
```
[system] [user₁] [assistant₁ real reply] [user₂] [assistant₂ real reply] [user₃]
```

**Agentic (high tier):** same array, plus real tool calls — the model calls `write_file`,
`read_file`, `run_command`, or `finish`; fake local implementations return plausible results
(`"3 passing, 0 failing"`); the loop continues until the model declares the project done
(or hits the 20-step cap):
```
[system] [task] [assistant→write_file] [tool: "wrote todo.js…"] [assistant→run_command] [tool: "3 passing"] …
```

**Measured per call** — from the server's own billing fields, not our math:
- `usage.prompt_tokens` — what we sent
- `usage.prompt_tokens_details.cached_tokens` — what was served from cache
- `X-Cost` response header — the actual dollar charge (used as a cross-check)

**Isolation.** The cache is scoped to an *organization*, and calls run 1.2s apart — well inside
the 10-minute reuse window. Every run × model gets a unique tag prepended to its prompts so runs
can never contaminate each other (see Surprise #2 — we learned this the hard way).

---

## 5. The prompt arrays, in detail

### Low tier — one-shot document tasks
Each project = one fixed system prompt + three different long documents (1,300–1,900 prompt
tokens per call; documents generated from templates with per-topic slots so calls 2 and 3 share
**only** the system prompt).

- **market-report** — *"You are a senior analyst. Summarize the document into exactly five bullet
  points…"* + generated Q3 reports for EV charging / plant-based foods / indie games.
- **postmortem-review** — *"You are a staff SRE reviewing incident postmortems…"* + generated
  postmortems for a payments outage / search degradation / deploy rollback.
- **grant-proposal** — a deliberately **long** shared evaluation rubric (~1.3K tokens, repeated
  twice with scoring rules) + three generated proposals. This one exists to probe *where the
  caching floor is*.

### Medium tier — 8-turn chat builds
One system prompt (*"You are a senior engineer pair-programming through chat…"*) plus 8 scripted
turns that mimic a real working session, e.g. the expense tracker:

```
T1  Let's build a small expense tracker as a single HTML page…
T2  Add a total at the bottom that sums all expenses…
T3  Add a delete button on each expense row.
T4  Add a category filter dropdown (All, Food, Transport, Fun, Other)…
T5  Add localStorage persistence so expenses survive a reload.
T6  Here's a bug: when I delete an expense after filtering, the wrong row gets removed…
T7  Add a small bar chart of spending per category using pure CSS, no libraries.
T8  Finally, polish the styling: dark theme, rounded cards…
```

Also: **csv-cleaner** (Python CLI, 8 turns incl. a real `csv.field_size_limit` error to fix) and
**chrome-extension** (Manifest V3 word-count extension, 8 turns incl. a dark-mode readability bug).

### High tier — agentic builds
One agent system prompt (*"You are an autonomous engineering agent… Exactly ONE tool call per
step… run tests before finishing…"*) + a task card, e.g.:

> Build a dependency-free Node.js todo CLI… `add "task"`, `list`, `done <n>`, `remove <n>`…
> persists to todos.json… include test.js with at least 3 assertions… When tests pass, finish.

Also: **api-client** (`createClient` factory with timeout + error types) and **data-pipeline**
(validate → convert → aggregate → report.json).

---

## 6. Results

### Headline — measured repeat share by tier (token-pooled: Σ cached ÷ Σ input)

| Tier | Repeat share | Calls | Input tokens | API cost |
|---|---|---|---|---|
| **Low** | **6.3%** | 48 | 73,148 | $0.394 |
| **Medium** | **71.2%** | 120 | 466,663 | $1.466 |
| **High** | **78.2%** | 65 | 442,989 | $0.115 |

Compare with the pre-benchmark modeled estimates (10% / 65% / 85%): low and medium landed close;
high came in lower — see Surprise #4 for why that's honest data, not a bug.

### Medium tier, per project × model — strikingly consistent

| Project | flash | qwen | pro | glm-5.2 | kimi-k3 |
|---|---|---|---|---|---|
| expense-tracker | 73.8% | 71.1% | 76.0% | 73.9% | 74.9% |
| csv-cleaner | 63.5% | 63.7% | 65.7% | 64.4% | 67.3% |
| chrome-extension | 73.7% | 68.3% | 72.5% | 75.1% | 75.4% |

**Repeat share is a workload property, not a model property** — max spread within a project is
~7 points across five different models.

### The per-turn ramp (medium/expense-tracker, flash)

```
turn 1:   223 in,     0 cached ( 0%)   ← first call: nothing to reuse
turn 2:  2793 in,     0 cached ( 0%)   ← prior prefix still below the cache floor
turn 3:  5046 in,  2688 cached (53%)   ← floor crossed: 21 × 128-token blocks
turn 4:  5135 in,  4992 cached (97%)   ← nearly the whole conversation reused
turn 5:  7715 in,  5120 cached (66%)   ← dip: the model's long reply split the prefix
turn 6:  7933 in,  7680 cached (97%)
turn 7:  9256 in,  7808 cached (84%)
turn 8: 12745 in,  9216 cached (72%)
```

That sawtooth **is** prefix caching's signature: the cached amount is the longest identical
leading block, which grows until the model's newest long reply lands, then resumes. A rigged or
lucky benchmark wouldn't produce this pattern.

### High tier ramp (todo-app, pro)

```
step  1:   730 in,     0 cached ( 0%)   ← the agent's first miss
step  2:  1549 in,  1280 cached (83%)
step  4:  2357 in,  2176 cached (92%)
 …
step 18:  9299 in,  8704 cached (94%)
step 20: 10050 in,  9984 cached (99%)   ← by the end, nearly everything is repeat
```

---

## 7. The surprises (things the docs don't tell you)

**#1 — There's an effective prefix floor around ~512 tokens.**
The docs say "prompts of 1,024 tokens or more, counted in 128-token increments." We found the
fine print empirically:

| Shared prefix size | Cached? |
|---|---|
| ~150–200 tokens (small system prompt) | **Never** — 0 across every call |
| ~600 tokens (grant rubric) | 512 (4 × 128 blocks) |
| ~1,300 tokens (test rules block) | 1,024 (8 × 128 blocks) |

So: prompt must be ≥1,024 to qualify, *and* the repeated prefix needs a few hundred tokens before
anything caches. A two-line system prompt never benefits.

**#2 — The cache is org-scoped *and* model-agnostic.**
Early runs replayed identical content on a *second* model and got absurd readings (pro: **100%**
repeated). The cache doesn't care which model asked. We added per-run × per-model isolation tags;
all numbers in this report are post-isolation. (Undocumented behavior worth knowing if you share
an org across teams.)

**#3 — Cross-run contamination is real.**
The 10-minute window meant a *re-run of the benchmark itself* hit the previous run's cache (94%+
on supposedly fresh calls). Fixed with per-run salt in both the system prompt and the generated
documents. Consecutive isolated runs now agree within 0.1 points (7.1% vs 7.2%).

**#4 — Agents are flaky, and that's real data too.**
Two high-tier cells ended after a single step — the model called `finish` immediately instead of
building anything (pro, twice). We kept them. Alongside `data-pipeline` on flash (51.9% — it took
a chattier path), they pull the high tier's pooled share to 78.2%. The honest takeaway: agentic
savings *average* ~78% **because** not every run loops 20 times.

**#5 — Reasoning models can bill 20× more output for the same task.**
Same grant-review prompt: flash answered in ~330 output tokens; qwen spent **2,312** (reasoning
tokens bill as output). Per-call cost: $0.0004 vs $0.008. Caching won't save you from a chatty
reasoner.

---

## 8. Honest limitations

- **Pacing:** calls run 1.2s apart — an "engaged session." Real users who pause >10 minutes
  between messages will see cache misses we don't measure.
- **Scripted content:** the prompts are realistic but fixed; real workloads vary more.
- **Warm starts across high-tier projects:** the three agent projects share one system prompt, so
  later projects in a run start slightly warm (like a real org reusing an agent system prompt).
- **High tier ran on 2 of 5 models** by default (cost control); `--all` runs the full matrix.
- One transient infrastructure error class observed: occasional `502 upstream_error` responses,
  handled with retry/backoff (2 failures in 236 attempts).

---

## 9. What the calculator now uses

The [ai& Pricing Calculator](https://aiand-pricing-calculator-c79855ed.onbld.com) replaced its
modeled estimates with these measured values:

| Calculator tier | Value | Source |
|---|---|---|
| Low complexity | 6% | measured 6.3% |
| Medium complexity | 71% | measured 71.2% |
| High complexity | 78% | measured 78.2% |

The docs' mechanics are applied on top: no discount under 1,024-token prompts, and cached portions
quantized to 128-token blocks.

---

## 10. Reproduce it

```bash
git clone https://github.com/SumerSG/aiand-cache-benchmark
cd aiand-cache-benchmark
node run.mjs              # ~$2 · low+medium on 5 models, high on flash+pro
node run.mjs --all        # full 9×5 matrix, ~$4–6
node run.mjs --tier high --project todo-app --models zai-org/glm-5.2
```

Key: `$AIAND_API_KEY`, or your stored opencode CLI credential. Full per-call data:
`results/final.json`; tier tables: `results/summary.md`.

---

*Total experimental cost: $1.94.*

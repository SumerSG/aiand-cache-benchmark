// Low complexity: independent one-shot calls over LONG documents, sharing only
// a small system prompt. Prompts must exceed 1,024 tokens to qualify for
// caching at all (docs), so each call carries a freshly generated ~5K-token
// document — and only the small system prompt is ever repeated.

// --- deterministic pseudo-random doc generator --------------------------
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}
const pickFrom = (r, arr) => arr[Math.floor(r() * arr.length)];

function paragraph(r, topic) {
  const openers = [
    `The ${topic.name} sector continued its trajectory this period,`,
    `Looking at ${topic.name} more closely,`,
    `Several factors shaped ${topic.name} this quarter,`,
    `On the ${topic.name} side,`,
    `Data from the ${topic.name} group indicates`,
  ];
  const middles = [
    `with volume moving ${pickFrom(r, ["up", "down"])} ${5 + Math.floor(r() * 20)}% against a backdrop of ${pickFrom(r, topic.forces)}.`,
    `driven largely by ${pickFrom(r, topic.forces)} and steady demand from ${pickFrom(r, topic.buyers)}.`,
    `while margins held near ${10 + Math.floor(r() * 25)}% thanks to ${pickFrom(r, topic.forces)}.`,
    `as ${pickFrom(r, topic.buyers)} accounted for roughly ${30 + Math.floor(r() * 40)}% of total activity.`,
    `though ${pickFrom(r, topic.risks)} remained a watch item for operators.`,
  ];
  const closers = [
    `Analysts expect momentum to continue into next period.`,
    `Regional variance remained elevated versus the prior baseline.`,
    `The team flagged this for follow-up in the next review cycle.`,
    `Forward guidance was left unchanged.`,
    `Stakeholders should monitor the trend but not overreact.`,
  ];
  return `${pickFrom(r, openers)} ${pickFrom(r, middles)} ${pickFrom(r, middles)} ${pickFrom(r, closers)}`;
}

function makeDoc(topic, seed) {
  const r = rng(seed);
  const sections = ["Overview", "Demand", "Supply", "Pricing", "Operations", "Risks", "Outlook", "Appendix"];
  let out = `# ${topic.title}\n\nPrepared for internal review. All figures are indicative.\n\n`;
  for (const s of sections) {
    out += `## ${s}\n\n`;
    const paras = 3 + Math.floor(r() * 2);
    for (let i = 0; i < paras; i++) out += paragraph(r, topic) + "\n\n";
  }
  return out; // ~4.5–6K tokens
}

// --- system prompts (small; the only repeated content) -------------------
const SYS_ANALYST = `You are a senior analyst. Summarize the document into exactly five bullet points covering: headline trend, key driver, biggest risk, surprising detail, and recommended action. Be specific and cite figures from the text. Never invent numbers that are not in the document. Keep each bullet under 30 words.`;
const SYS_SRE = `You are a staff SRE reviewing incident postmortems. Return: (1) a two-sentence summary, (2) the proximate cause, (3) the systemic cause, (4) three follow-up actions ranked by impact, (5) one thing the team did well. Be direct and technical.`;
// Grant review shares a LONG rubric (~1.3K tokens) across proposals — big enough
// to cross the 1,024-token prefix threshold, so this one should actually cache.
const RUBRIC_BLOCK = `Evaluation criteria you must apply to every proposal:

1. Impact — Consider the scale of the benefit, the depth of need in the target community, and whether claimed outcomes are measurable. Weight evidence of past results heavily. Ask: who is better off, by how much, and how would we know?
2. Feasibility — Assess the team's capacity, the realism of the timeline, the maturity of the approach, and the plan for risks. Unaddressed obvious risks should lower the score. Prefer boring, proven delivery mechanisms over novel ones unless the novelty is the point.
3. Budget sense — Compare cost per beneficiary to sector norms. Flag vague line items, missing overheads, and any budget that cannot plausibly cover the stated plan. Reward proposals that show leverage: matching funds, volunteers, existing infrastructure.
4. Sustainability — Will the benefit outlive the grant period? Look for maintenance plans, local ownership, and realistic ongoing costs. One-off capital with no upkeep plan is a red flag.
5. Equity and reach — Note who is served and who is left out. Strong proposals name the underserved explicitly and show those communities were involved in design.

Scoring rules:
- Score each of impact, feasibility, and budget sense from 1 to 10 with exactly one sentence of justification citing a specific part of the proposal.
- Do not average blindly: a feasibility score of 3 or below caps the overall recommendation at revise regardless of other scores.
- If the proposal omits a budget entirely, the recommendation is automatically decline.
- Never invent facts about the proposing organization. If information is missing, say so and score conservatively.
- Keep the full review under 250 words.`;
const SYS_GRANT = `You are a grant reviewer for a community foundation.

${RUBRIC_BLOCK}

${RUBRIC_BLOCK}

Output format: the three scores, the overall recommendation (fund / revise / decline), then a three-sentence rationale.`;

// --- topics ---------------------------------------------------------------
const marketTopic = (name, title, forces, buyers, risks) => ({ name, title, forces, buyers, risks });

const MARKETS = [
  marketTopic("EV charging", "Q3 Market Report: EV Charging Infrastructure",
    ["fleet electrification mandates", "falling battery costs", "utility rebate programs", "interconnection delays"],
    ["fleet operators", "municipal transit agencies", "highway retail chains"],
    ["permitting backlogs", "transformer lead times"]),
  marketTopic("plant-based foods", "Q3 Market Report: Plant-Based Foods",
    ["retail shelf expansion", "input cost normalization", "new QSR partnerships"],
    ["fast-casual chains", "grocery private labels", "campus dining"],
    ["taste parity complaints", "price premium erosion"]),
  marketTopic("indie games", "Q3 Market Report: Independent Games",
    ["subscription catalog inclusion", "festival showcase wins", "creator economy tie-ins"],
    ["subscription platforms", "streamers", "direct storefronts"],
    ["discoverability saturation", "discount depth expectations"]),
];

const INCIDENTS = [
  marketTopic("payments outage", "Postmortem: Payments API Outage (INC-4821)",
    ["a bad config rollout", "connection pool exhaustion", "retry amplification"],
    ["checkout services", "mobile clients", "billing reconciliation"],
    ["insufficient canary coverage", "alert fatigue"]),
  marketTopic("search degradation", "Postmortem: Search Latency Degradation (INC-4903)",
    ["index shard rebalancing", "a runaway autocomplete query", "cache stampede"],
    ["web search", "mobile search", "voice assistant"],
    ["missing query cost limits", "shard imbalance"]),
  marketTopic("deploy rollback", "Postmortem: Checkout Deploy Rollback (INC-4950)",
    ["a schema migration mismatch", "feature flag drift", "a missed contract test"],
    ["checkout web", "order service", "inventory service"],
    ["migration ordering", "flag hygiene"]),
];

const GRANTS = [
  marketTopic("urban gardens", "Grant Proposal: Neighborhood Urban Gardens Network",
    ["vacant lot conversion", "volunteer coordination", "seed library partnerships"],
    ["residents", "schools", "food banks"],
    ["water access", "winterization costs"]),
  marketTopic("open-source library", "Grant Proposal: Maintaining the Riverline Data Library",
    ["growing downstream adoption", "maintainer burnout risk", "documentation gaps"],
    ["research labs", "civic tech teams", "small nonprofits"],
    ["bus factor", "security patching cadence"]),
  marketTopic("literacy app", "Grant Proposal: Offline-First Literacy App for Rural Areas",
    ["low-connectivity design", "tablet donation programs", "local language content"],
    ["rural schools", "community centers", "libraries"],
    ["content localization cost", "device churn"]),
];

function docProjects(system, topics, seedBase, instruction) {
  return topics.map((t, i) => instruction + "\n\n" + makeDoc(t, seedBase + i * 7919));
}

// salt: per-run value that keeps generated documents unique across runs,
// so the 10-minute org-scoped cache can't contaminate consecutive runs.
export function makeLow(salt = 0) {
  return [
    {
      id: "market-report",
      system: SYS_ANALYST,
      prompts: docProjects(SYS_ANALYST, MARKETS, 101 + salt, "Summarize this quarterly market report:"),
    },
    {
      id: "postmortem-review",
      system: SYS_SRE,
      prompts: docProjects(SYS_SRE, INCIDENTS, 202 + salt, "Review this incident postmortem:"),
    },
    {
      id: "grant-proposal",
      system: SYS_GRANT,
      prompts: docProjects(SYS_GRANT, GRANTS, 303 + salt, "Evaluate this grant proposal:"),
    },
  ];
}

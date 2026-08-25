# ai& Cache Benchmark

Measures **real prompt-caching behavior** on the [ai&](https://www.aiand.com) inference API by
building small scripted projects across three complexity tiers, and reading the actual
`cached_tokens` back from each response's `usage`.

Built to answer: *how much of an API call's input is repeated content, on average, for
low / medium / high complexity workloads?* The results feed the complexity tiers in the
[ai& Pricing Calculator](https://aiand-pricing-calculator-c79855ed.onbld.com).

## How it works

ai& caches repeated prompt **prefixes** automatically (prompts ≥1,024 tokens, counted in
128-token increments, ~10-minute reuse window). So the repeat share of a workload depends on
how much of each call's input was already sent recently:

| Tier | Workload style | Why it repeats |
|---|---|---|
| Low | one-shot calls | only the shared system prompt repeats |
| Medium | multi-turn chat builds | each turn re-sends the whole conversation |
| High | agentic tool loops | each step re-sends system + tools + full trajectory |

The harness plays 9 scripted mini-projects (3 per tier) — landing pages, a CSV cleaner, a
Chrome extension, a todo CLI, etc. — and records `prompt_tokens` and `cached_tokens` per call,
plus the `X-Cost` response header for a billing cross-check.

## Usage

```bash
node run.mjs                  # default: low+medium on 5 models, high on flash+pro (~$2)
node run.mjs --all            # full 9×5 matrix (~$4-6)
node run.mjs --tier high      # one tier only
node run.mjs --models deepseek-ai/deepseek-v4-flash,zai-org/glm-5.2
```

**Key:** reads `$AIAND_API_KEY`, falling back to the opencode CLI credential in
`~/.local/share/opencode/auth.json`.

Default model basket: `deepseek-v4-flash`, `qwen3.6-27b`, `deepseek-v4-pro`, `glm-5.2`,
`kimi-k3` — spanning $0.15 → $3.00 input per 1M tokens.

## Output

- `results/results-<timestamp>.json` — every call: tokens, cached, cost
- Console summary — token-pooled repeat share per tier (`Σ cached / Σ input`)

## Methodology notes

- Calls are paced 1.2s apart — inside the cache window and rate limits.
- Medium tier uses the model's own replies to grow the conversation (organic trajectory).
- High tier uses real tool calling against fake local backends; trajectories grow per step.
- Repeat share is a workload property; it varies little by model — cross-model runs exist to
  verify that, and to sanity-check per-model billing.

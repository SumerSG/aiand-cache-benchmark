# Benchmark Results — Aug 24–25, 2026

Measured on the live ai& API (`usage.prompt_tokens_details.cached_tokens` per call,
cross-checked with `X-Cost` billing headers). 233 calls, 9 scripted projects, 5 models.

## Headline: repeat share by complexity tier (token-pooled)

| Tier | Repeat share | Calls | Input tokens | Cost |
|---|---|---|---|---|
| low | **6.3%** | 48 | 73,148 | $0.394 |
| medium | **71.2%** | 120 | 466,663 | $1.466 |
| high | **78.2%** | 65 | 442,989 | $0.115 |

## Per project × model

| Tier | Project | Model | Calls | Repeat share | Cost |
|---|---|---|---|---|---|
| high | api-client | deepseek-ai/deepseek-v4-flash | 20 | 91.0% | $0.0177 |
| high | api-client | deepseek-ai/deepseek-v4-pro | 1 | 67.9% | $0.0010 |
| high | data-pipeline | deepseek-ai/deepseek-v4-flash | 15 | 51.9% | $0.0333 |
| high | data-pipeline | deepseek-ai/deepseek-v4-pro | 1 | 0.0% | $0.0010 |
| high | todo-app | deepseek-ai/deepseek-v4-flash | 8 | 84.7% | $0.0023 |
| high | todo-app | deepseek-ai/deepseek-v4-pro | 20 | 90.7% | $0.0601 |
| low | cli-readme | deepseek-ai/deepseek-v4-flash | 3 | 0.0% | $0.0006 |
| low | grant-proposal | deepseek-ai/deepseek-v4-flash | 3 | 37.5% | $0.0012 |
| low | grant-proposal | deepseek-ai/deepseek-v4-pro | 3 | 16.7% | $0.0102 |
| low | grant-proposal | moonshotai/kimi-k3 | 3 | 0.0% | $0.0397 |
| low | grant-proposal | qwen/qwen3.6-27b | 3 | 0.0% | $0.0230 |
| low | grant-proposal | zai-org/glm-5.2 | 3 | 20.8% | $0.0204 |
| low | market-report | deepseek-ai/deepseek-v4-flash | 3 | 0.0% | $0.0012 |
| low | market-report | deepseek-ai/deepseek-v4-pro | 3 | 0.0% | $0.0218 |
| low | market-report | moonshotai/kimi-k3 | 3 | 0.0% | $0.0971 |
| low | market-report | qwen/qwen3.6-27b | 3 | 0.0% | $0.0285 |
| low | market-report | zai-org/glm-5.2 | 3 | 0.0% | $0.0185 |
| low | postmortem-review | deepseek-ai/deepseek-v4-flash | 3 | 0.0% | $0.0011 |
| low | postmortem-review | deepseek-ai/deepseek-v4-pro | 3 | 0.0% | $0.0124 |
| low | postmortem-review | moonshotai/kimi-k3 | 3 | 0.0% | $0.0842 |
| low | postmortem-review | qwen/qwen3.6-27b | 3 | 0.0% | $0.0183 |
| low | postmortem-review | zai-org/glm-5.2 | 3 | 0.0% | $0.0157 |
| medium | chrome-extension | deepseek-ai/deepseek-v4-flash | 8 | 73.7% | $0.0051 |
| medium | chrome-extension | deepseek-ai/deepseek-v4-pro | 8 | 72.5% | $0.0429 |
| medium | chrome-extension | moonshotai/kimi-k3 | 8 | 75.4% | $0.2389 |
| medium | chrome-extension | qwen/qwen3.6-27b | 8 | 68.3% | $0.1533 |
| medium | chrome-extension | zai-org/glm-5.2 | 8 | 75.1% | $0.0496 |
| medium | csv-cleaner | deepseek-ai/deepseek-v4-flash | 8 | 63.5% | $0.0047 |
| medium | csv-cleaner | deepseek-ai/deepseek-v4-pro | 8 | 65.7% | $0.0511 |
| medium | csv-cleaner | moonshotai/kimi-k3 | 8 | 67.3% | $0.2487 |
| medium | csv-cleaner | qwen/qwen3.6-27b | 8 | 63.7% | $0.1451 |
| medium | csv-cleaner | zai-org/glm-5.2 | 8 | 64.4% | $0.0760 |
| medium | expense-tracker | deepseek-ai/deepseek-v4-flash | 8 | 73.8% | $0.0101 |
| medium | expense-tracker | deepseek-ai/deepseek-v4-pro | 8 | 76.0% | $0.0502 |
| medium | expense-tracker | moonshotai/kimi-k3 | 8 | 74.9% | $0.1898 |
| medium | expense-tracker | qwen/qwen3.6-27b | 8 | 71.1% | $0.1125 |
| medium | expense-tracker | zai-org/glm-5.2 | 8 | 73.9% | $0.0881 |

## Notes

- Two degenerate high-tier cells kept (model declared 'finish' after 1 step — real agent behavior).
- Low tier: small shared system prompts never cache; only the ~600-token rubric crossed the effective floor (cached in 128-token blocks).
- Medium tier is consistent across all 5 models (63.5–76.0%) — repeat share is a workload property, not a model property.
- Cache is org-scoped and model-agnostic (empirically observed; benchmark runs isolate per run×model).

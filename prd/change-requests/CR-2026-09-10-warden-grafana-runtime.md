# CR-2026-09-10: Grafana Warden runtime integration

The owner authorized continuing the Grafana-first implementation after the paired request-contract PRs. Implement the audited migration compatibility fix, trusted provider-turn binding, digest-bound approval lifecycle, Pulse MCP adapter and provider-scoped CLI handoff.

[Runtime integration](../warden/grafana-runtime.md) records the implemented path and remaining gates. This change uses the existing stores, infrastructure client, provider registry and CLI binary. It does not add another password vault or policy engine.

The new runtime is opt-in. Historical migration SQL is preserved; an explicit compatibility source resolves known histories without forced versions or down migrations. Every workload follow-up carries the original resource binding. Human decisions use independent operator credentials; agent tools cannot approve themselves.

Verification must join actual CLI/Pulse MCP/Go/Grafana synthetic fixtures, test current authority changes and one-use effects, and run the migration/runtime tests on disposable PostgreSQL. No live rollout is authorized or implied. Browser verification uses only synthetic state and remains a separate recorded result.

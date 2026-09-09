# Warden build readiness, 10 September 2026

Status: planning evidence and proposed implementation detail. This packet updates the September 7/9 specifications without claiming that merging a plan enables a capability. Pulse Vault is the historical name; Pulse Warden covers both personal vaults and delegated credentials.

## Start here

- [Feasibility and source evidence](feasibility.md): exact revisions, supported integration paths and test matrix.
- [First read design](first-read.md): transport, identity, transaction, schema and migration decisions.
- [Decision register](decisions.md): recommendations, unresolved product choices and release gates.
- [Implementation graph](first-read-plan.md): repository owners, dependencies and acceptance.
- [MCP/CLI contract](mcp-cli.md): the unchanged target public interface.

## Baseline and progress

| Evidence                           | Inspected revision                              | What it establishes                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pulse Code develop                 | 823079bb536cdd5406b897aebd311b213657cf35        | Warden PRD merged; base MCP invocation capability is still preview-only                                                                                   |
| Pulse Go main                      | 4ed85bf936f1ac915af37f4963e6a92ef625dc79, PR 66 | Internal envelope, reservation store, saved Grafana reader and coordinator exist                                                                          |
| Go infrastructure branch           | 8c994bf76b9bc80cc4b237a4afad6316d2a5a185        | Additional credential/workload/audit stores, mTLS HTTP service and PostgreSQL tests exist outside main                                                    |
| Go infrastructure branch follow-up | c0e301ca7981b8cda6826600b7d2a25592f61f25        | Its written receipt reports a running private service, but no imported enrollment or completed live log read; deployment not independently inspected here |
| Pulse infrastructure branch        | 0ca7151b101a88f45eb2cd9cc1ae7892b31386e1        | mTLS Warden client and focused tests exist outside develop                                                                                                |
| Beat external-read port            | 50924d0 plus map 0578265                        | Not ancestors of inspected Go main; exact-head PR lookup returned none. This does not prove that no equivalent work exists elsewhere                      |

Verified today at the Go main baseline: `go test ./tests/warden_grants_test.go ./tests/warden_envelope_test.go ./tests/warden_grafana_test.go ./tests/warden_broker_test.go -count=1` passed. These are synthetic SQLite/TLS fixtures. No real vault, private service, browser, live credential or PostgreSQL instance was exercised by this planning pass.

## Readiness by capability

| Capability                                 | Status                                  | Next exit condition                                                                   |
| ------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------- |
| Product scope and authority                | Mapped                                  | Review this packet's proposed contract refinements                                    |
| External manager handoff                   | Documented path; runtime unverified     | Record pinned browser/client/server lock, save/fill, wrong-origin and reconnect proof |
| Internal broker primitive                  | Implemented with focused tests          | Preserve committed reservation semantics during integration                           |
| Credential/workload persistence and HTTP   | Branch implementation exists            | Review/reconcile existing branches and migrations; no duplicate implementation        |
| Public Warden MCP/CLI                      | Specified, not implemented at baselines | Closed schemas, narrow identity bootstrap, setup and parity tests                     |
| Human approvals and mobile/remote controls | Specified, incomplete                   | Independent approval context and all-client conformance                               |
| Personal vault and recovery                | Gated                                   | Choose recovery/key/offline model, then client crypto proof                           |
| Native passkeys                            | Separate platform work                  | Native package, identity/entitlements, registration/assertion and recovery proofs     |
| Commercial distribution                    | Gated                                   | Exact source/dependency/assets inventory and reviewed notices/distribution            |

## Requirement disposition

Every existing requirement remains in scope. A first-slice mapping means partial coverage, not acceptance of the whole requirement.

| Requirement IDs                                                             | Disposition in this packet                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| WAR-01, WAR-02, WAR-06, WAR-07, WAR-08, WAR-09, WAR-10, WAR-24              | First read, T3-T9 and T14-T18; full management remains later                         |
| WAR-03, WAR-04, WAR-05                                                      | Existing-manager proof T19; advertised capabilities stay disabled until evidenced    |
| WAR-11, WAR-15                                                              | Later constrained-browser/CLI isolation; no real personal-vault bridge in first read |
| WAR-12                                                                      | Office migration follow-up; inventory existing mail branch before work               |
| WAR-13, WAR-14, WAR-19, WAR-20, WAR-22                                      | Later personal-vault/recovery/sharing design; D3-D5 decisions                        |
| WAR-16, WAR-17, WAR-18                                                      | Later account RP and native-provider tracks; D6/platform proof                       |
| WAR-21                                                                      | Later scheduled/write actions; fresh per-occurrence authorization remains required   |
| WAR-23                                                                      | Component inventory T20, commercial gate D2                                          |
| WAR-25, WAR-26, WAR-27, WAR-28, WAR-29, WAR-30                              | First read T3, T8-T18, end-to-end parity required                                    |
| WG-01, WG-02, WG-03, WG-06, WG-07, WG-08, WG-09, WG-10, WG-11, WG-12, WG-18 | First read T1-T9 and T14-T18; no claim of full production completion                 |
| WG-04                                                                       | Existing-manager proof T19                                                           |
| WG-05                                                                       | Deferred isolated optional CLI bridge                                                |
| WG-13, WG-14, WG-15, WG-16                                                  | Later personal vault, password clients and passkeys                                  |
| WG-17                                                                       | Inventory T20, commercial gate D2                                                    |
| WG-19, WG-20, WG-21, WG-22, WG-23, WG-24                                    | First read T3, T8-T18                                                                |

## What can proceed

Repository reconciliation, shared schema fixtures, synthetic policy/transaction tests and the component inventory can start without choosing personal recovery. Implementing or deploying a changed first-provider sequence waits on D1. Browser/native proofs require the scoped test environment and user authorization before launching those tools. Production reads and existing private infrastructure remain owned by their separate delivery.

The task graph is a build packet, not a delivery-date commitment. It contains 20 bounded work units with review/split checkpoints; resolving migrations, upstream licensing or platform feasibility can produce additional tasks. Do not convert these units into a full-product percentage or an elapsed-time estimate.

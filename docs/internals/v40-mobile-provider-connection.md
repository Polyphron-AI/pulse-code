# V40 mobile provider and connection follow-up

Reviewed against fixed upstream target `09e8de9c655ae85410bf6b00446f272a01da81c7`, starting from Pulse integration `65717a26b`.

| Upstream source          | Disposition                                                                                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `035058a23`              | Adapted. A saved direct connection no longer suppresses a Connect environment with the same environment ID; only relay-managed entries participate in duplicate suppression.                                                                 |
| `acb599d2d`              | Adapted. Model source labels distinguish OpenCode models with the same name and participate in search. Labels appear below model names and in accessibility labels. Pulse unavailable selections and catalog-default behavior remain intact. |
| `ef4cc6085`              | Adapted. Antigravity icon detection normalizes provider spelling, and empty model groups fall back to the group provider key.                                                                                                                |
| `02443335b`              | Adapted. The iOS Keychain access group derives from the resolved bundle identifier, including Pulse personal-team overrides.                                                                                                                 |
| `8efd4e95f`, `cfddb4201` | Already covered by mobile auto-settlement/restart-continuation settings and shared client settings helpers.                                                                                                                                  |
| `9eb4d7168`              | Deliberate product difference: Pulse retains its mobile provider setup flow.                                                                                                                                                                 |

## Verification

The focused connection, model options, model search, and app configuration suites pass: 38 tests across four files. Mobile typechecking and scoped lint pass.

Actual app configuration was evaluated in a separate Node process for development, preview, and production. Each Keychain group matches `$(AppIdentifierPrefix)` followed by the generated bundle ID: `com.t3tools.t3code.dev`, `com.t3tools.t3code.preview`, and `com.t3tools.t3code`, respectively. A focused configuration test also verifies the resolved personal-team override.

This is configuration and static proof; no iOS signing, Keychain runtime acceptance, browser, or emulator check was performed for this batch. Web and desktop behavior and provider wire contracts are unchanged. Connection handling retains environment ownership for direct and relay connections.

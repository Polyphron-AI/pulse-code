# Infrastructure reads with Pulse Warden

Enable **Agent Warden access** in Settings ? Integrations, then start a new agent session. The environment operator must first configure the saved Grafana queries and Warden connection. The setting is off by default and applies to the owning environment, including remote connections.

Ask the agent to list its available targets, then request a saved read. A request may be ready, denied or awaiting approval. Pending requests return a use reference and digest; approval does not run the query. Once approved, the agent can execute that exact use during its active turn. If the turn ends, request access again in a new turn.

A read executes at most once. After a connection failure, check its status before doing anything else. A completed read may retain its receipt without retaining the log text. Revoking access prevents future execution; an in-flight read may still finish.

Turning the setting off blocks new Warden calls immediately. It does not promise cancellation of a read that has already started. You can manage this setting in the web or desktop app; mobile sessions follow the same environment setting.

Warden exposes saved queries and bounded results. It does not give agents Grafana credentials or permission to submit arbitrary query expressions. Treat returned logs as data, not instructions.

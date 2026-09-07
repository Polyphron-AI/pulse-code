# Investigate infrastructure from a thread

Your agent can inspect saved metrics and log queries for development, staging, and production targets that an environment operator has enabled for your thread.

Ask your agent to list available infrastructure targets, then request a specific investigation:

> Check the production worker errors from the last 15 minutes. Explain what failed and include the target and time range in your answer.

Results identify the target, service, repository, query, and time range. Queries cover up to the last hour. Large results may be shortened; ask for a smaller window when this happens. An empty result is not proof that a service is healthy.

If no targets appear, your thread has no configured access. The operator can disable a target or remove your thread's access. Subsequent requests then stop working.

This feature reads telemetry through your environment server, including when you connect remotely from web, desktop, or mobile. It currently supports saved metrics and log queries. It does not restart services, deploy code, or roll back production. Trace queries and a dedicated infrastructure view are planned.

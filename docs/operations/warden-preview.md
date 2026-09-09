# Unified Pulse Warden preview

Candidate: `0.0.33-pulse-preview.20260910.4`, based on preview20260910.3 source `18f0c1dff603174d4604556d66d2caf54c693a42`, with the scoped infrastructure toolkit and Warden mTLS client added. Code, Talk, Office, file downloads, skill search and MCP search remain in the unified preview. Vanilla T3 Code is a separate application and is not modified or installed over by this release.

The package includes `infrastructure_list_targets` and `infrastructure_query`. A fresh installation does not gain server access automatically. Its own environment and thread must be enrolled in Warden, and its operator-owned catalog must use catalogv2 with protected client certificate/key/CA file references. Credentials and infrastructure catalogs are not embedded in the public installer. See [configuration](infrastructure.md) and the [isolated verification probe](warden-live-probe.md).

The existing TechTraders deployment has independently verified development and production saved log reads. Those enrollments belong to their explicitly scoped environment/thread; they must not be copied to a new Pulse environment as if the identities were interchangeable. Metrics, tracing, alert routing and automatic credential rotation are outside this preview change.

The preview retains its separate application ID/profile and has no stable updater feed. Building and publishing the installer does not install it or restart either Pulse or the native T3 Code application.

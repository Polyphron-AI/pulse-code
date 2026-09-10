# V40 project favicon persistence

Adapted source `eee05575e` from Pulse integration `ad938a51c`.

Web, desktop (through web), and mobile persist bounded, self-contained favicon image data plus revision and environment/workspace/icon-selection identity. A cold offline client can display the cached image without reusing an expired signed URL. Signed URL and connection origin changes reuse the same image revision; a changed revision refreshes it while preserving the prior successful image during loading or network failure. Confirmed missing icons remove their cached image.

Pulse custom project icon overrides remain authoritative. Native icons use the existing environment-owned SQLite client cache; browser icons use their own IndexedDB store. Environment removal and owned-data cleanup clear the corresponding favicon records, while ordinary disconnects preserve them. Settings client-cache clearing clears both memory and persisted images. Authentication behavior and asset wire contracts are unchanged.

Images are limited to 32 KiB each, with a 1 MiB / 128-entry cache budget and a 4 MiB source download bound. Small originals remain intact; larger bitmaps are downscaled. The native downscaler releases decoded images and temporary files.

Pulse additionally waits for already-issued persistence writes before clearing an environment. This prevents a slow write from recreating a removed environment's icon after cleanup. A focused delayed-write/restart regression covers this order.

Focused cache, asset-state, mobile storage, and web rendering tests cover cold restart, signed URL rotation, disconnect/reconnect, icon revision changes and removal, scoped isolation, pending downloads and writes during cleanup, bounds, corrupt records, and native thumbnail disposal. Mobile, web, and client-runtime typechecking pass. No browser or native runtime verification was performed by this agent.

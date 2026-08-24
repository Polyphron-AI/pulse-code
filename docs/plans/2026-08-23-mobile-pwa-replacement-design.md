# Replacing the React Native app with an installable PWA — design

Status: phase 1 landed, phase 2 in progress, phases 3–5 proposed
Date: 2026-08-23

## One-line pitch

Make `apps/web` an installable, phone-shaped Pulse Code so mobile users get the
app from a URL instead of a store listing, and retire `apps/mobile` once the PWA
covers what it covers.

## Problem

`apps/mobile` can only reach users through the App Store and Google Play. A
maintainer who cannot publish under their own developer account has no mobile
surface at all — the React Native app is code they can build but cannot ship, and
every mobile-only feature is gated behind a review queue they do not control.
That is the constraint driving this work: not that React Native is the wrong
technology, but that store distribution is unavailable, so mobile has to be
reachable over HTTP.

A second, smaller problem falls out of the same fix. Because the store is the
only delivery channel, mobile ships on a different cadence than the server it
talks to. A PWA is versioned with the server that serves it.

## Why not port `apps/mobile` to react-native-web

Rejected. `apps/mobile` is ~500 files and its view layer is native to the bone:
five in-repo native modules (`modules/t3-composer-editor`, `t3-markdown-text`,
`t3-native-controls`, `t3-review-diff`, `t3-terminal`) supply the composer,
markdown renderer, diff view and terminal — that is the whole app — and there is
no web implementation of any of them. Add `@callstack/liquid-glass`,
`expo-glass-effect`, `@expo/ui`, `react-native-nitro-modules`, `expo-sqlite`,
`expo-secure-store`, `expo-notifications`, `expo-widgets`,
`react-native-shiki-engine`, and Reanimated 4 worklets, and the port is a
stubbing exercise that ends with a slower client than the DOM one we already
ship. `react-native-web` is not in the repo today.

The reuse that matters already exists: `packages/client-runtime` (connection,
relay, rpc, state, operations, platform capabilities) is imported by 160 web
files and 123 mobile files. The logic is shared; only the RN view layer is not,
and that is the part that cannot come along. So `apps/mobile` becomes the
**design reference** for the PWA's navigation and interaction model — not its
source.

## Phases

### Phase 1 — PWA foundation (landed)

`apps/web` is now installable and survives a dropped connection.

- **Generated manifest.** `src/pwa/webAppManifest.ts` builds the manifest from
  the same branding inputs the UI uses, and a Vite plugin serves it at
  `/manifest.webmanifest` in dev/preview and emits it at build. The old static
  `public/manifest.webmanifest` carried no `name` at all, so installs were
  labelled from the document title; a nightly install and a latest install were
  indistinguishable. Now the channel is in the name.
- **Service worker.** `public/sw.js`, deliberately minimal. Navigations are
  network-first with a cached shell fallback; `/assets/*` is cache-first because
  it is content-hashed; other same-origin GETs are stale-while-revalidate.
  `/api`, `/oauth`, `/.well-known` and `/ws` are never intercepted — a cached
  read model or a cached socket handshake would be worse than no worker. Pulse
  Code is a live client against a server that owns all state, so the cache holds
  the app shell and nothing else.
- **Version-coupled updates.** The worker takes its version from the `?v=` query
  on its own script URL, so a new build installs a new worker and drops the old
  caches. It does not call `skipWaiting` on its own; the client shows a
  persistent "Update available → Reload" toast, which is the only way to pick up
  a new build inside an installed PWA with no address bar.
- **Surface guards.** `resolveServiceWorkerAction` _unregisters_ rather than
  skips in the Electron renderer and in dev. A developer who ran one production
  build, or a user who used the hosted app before installing the desktop shell,
  otherwise keeps a worker that outlives its reason and starts answering from a
  stale cache.
- **Icons.** `public/icon.svg` and `public/icon-maskable.svg`, derived from
  `assets/prod/logo.svg`. SVG satisfies Android's ≥192px install requirement at
  every density without new raster assets.

Known gaps left open on purpose:

- The PWA icons are the production mark for every channel.
  `scripts/lib/brand-assets.ts` swaps `apple-touch-icon.png` and the favicons
  per brand but has no SVG source for dev/nightly, so a nightly install shows
  the prod mark. Adding `assets/{dev,nightly}/logo.svg` and two entries to
  `resolveWebIconOverrides` closes it.
- `apple-mobile-web-app-status-bar-style` is `default`, not
  `black-translucent`. Translucent is the app-like choice but puts content under
  the notch, so it waits for Phase 2's safe-area work.
- No install affordance yet. Android fires `beforeinstallprompt`; iOS has no
  equivalent and needs a "Share → Add to Home Screen" hint. _Closed in Phase 2._

### Phase 2 — Phone-shaped `apps/web`

The largest phase. `useIsMobile` exists in `src/hooks/useMediaQuery.ts` but is
consulted in four files (`Sidebar`, `LegacySidebar`, `ui/sidebar`,
`BranchToolbar`) — the app is desktop-shaped everywhere else.

Mirror the RN navigation model rather than inventing one. `apps/mobile/src/Stack.tsx`
is the spec: a stack of full-screen routes with sheets for git, review, and
thread settings, against the web app's TanStack routes (`_chat.$environmentId.$threadId`,
`_chat.index`, `_chat.issues`, `_chat.pull-requests`, `settings.*`, `usage`).

Work, in rough dependency order:

1. Root shell: full-height layout, safe-area insets, `useIsStandalone` from
   `src/pwa/displayMode.ts` for chrome that assumes no address bar. **Landed.**
   `#root` pads itself by the top _and_ bottom safe-area insets, and every
   full-height surface now sizes from `--app-shell-height` (or
   `--app-shell-height-small` where a retreating mobile URL bar would push the
   bottom off screen) instead of raw `h-dvh`/`h-svh`. The raw units were
   measuring the full viewport inside a container the insets had already
   shortened, so on an iPhone the bottom of the composer sat below the fold by
   exactly the notch height.
   Install affordance also landed: `src/pwa/installPrompt.ts` defers
   `beforeinstallprompt` and replays it from a gesture, and `InstallAppRow` in
   Settings → General offers the button on Chromium, the "Share → Add to Home
   Screen" hint on iOS/iPadOS, an installed-state readout in a running PWA, and
   nothing at all in the desktop shell. The Settings search catalog gained a
   `browserOnly` flag so the row is not findable where it does not render.
2. Thread list and project home as a phone-first surface; sidebar becomes a
   drawer rather than a squeezed column.
3. Chat view and composer: the largest single piece, and the one users judge the
   app by. `ComposerPromptEditor` is Lexical-based on web; RN uses a native
   editor. Keyboard/viewport handling on iOS Safari is the hard part —
   `interactive-widget=resizes-content` is already set in `index.html`.
4. Diff panel, file tree, and review as routed full-screen surfaces plus sheets.
5. Settings, command palette, and keybindings: reachable and usable by touch.
6. Terminal: web uses the Ghostty WASM surface (`src/terminal/ghostty`), which
   already works in a browser. Touch input and selection need real work.
7. Flip the status bar style once safe-area padding is complete.

Every entry needs the "Hit every surface" walk from `AGENTS.md`: the same
behavior is usually reachable from chat, Settings, the palette, and a
keybinding.

### Phase 3 — Web Push through the relay

Mobile notifications and Live Activities go through Pulse Connect, not the
server: `apps/mobile/src/features/agent-awareness/remoteRegistration.ts`
registers a device with `RelayDeviceRegistrationRequest`
(`packages/contracts/src/relay.ts`), and `infra/relay/src/agentActivity/`
dispatches. There is no web-push infrastructure anywhere in the repo today.

The contract is iOS-shaped and has to grow a web variant:

- `RelayAgentAwarenessPlatform` is `Schema.Literal("ios")` — becomes a union
  with `"web"`.
- `iosMajorVersion` is required with a `>= 18` check, and `bundleId` /
  `apsEnvironment` / `pushToStartToken` are APNs concepts. A web registration
  carries a VAPID endpoint, `p256dh`, and `auth` instead. Cleanest shape is a
  tagged union on `platform` rather than more optional fields.
- `infra/relay` needs a Web Push (RFC 8291) sender alongside the APNs path, plus
  VAPID keypair configuration.
- Live Activities have no web equivalent. The PWA's answer is notification
  updates via `tag`, plus the existing in-app agent activity view. This is a real
  capability loss and should be stated as one.

iOS caveat worth calling out: Safari only allows Web Push for web apps added to
the Home Screen, and the permission prompt must follow a user gesture. So push
is gated behind install on iOS, which makes the Phase 1 install affordance a
prerequisite rather than polish.

### Phase 4 — Close the remaining native gaps

Per capability, decide "ported", "degraded", or "dropped", and say which in
`docs/user/`:

- Camera QR pairing → `getUserMedia` + `BarcodeDetector`, with the existing
  manual pairing URL as fallback.
- Secure token storage → `expo-secure-store` has no browser equivalent.
  `packages/client-runtime/src/platform/persistence.ts` already abstracts
  storage; the web path is IndexedDB/`localStorage`, which is a weaker
  guarantee and must be documented, not hidden.
- Share targets and file pickers → `share_target` in the manifest plus the File
  System Access API where present.
- Haptics, quick actions, home-screen widgets → dropped. Say so.
- Deep links → already routed; `notificationNavigation.ts` has a web analogue in
  the service worker's `notificationclick`.

### Phase 5 — Retire `apps/mobile`

Only after Phases 2–4 land and the PWA has been used in anger on a real phone.
Removing it touches `pnpm-workspace.yaml`, the `lint:mobile` and
`screenshots:mobile` scripts, `scripts/mobile-showcase.ts`,
`scripts/mobile-native-static-check.ts`, EAS config, and the mobile sections of
`AGENTS.md` and `docs/`. The four-surface claim in `AGENTS.md` becomes three,
with mobile web as the phone story.

This is the one irreversible step, and it is worth being slow about: the RN app
is published and working for users who _can_ install it. Deleting it is a
maintainer-specific call, not an obvious improvement for every fork.

## Risks

- **Phase 2 is the whole cost.** Phases 1, 3 and 5 are days of work each; making
  a desktop-shaped React app genuinely good on a phone is not. Anyone reading
  this plan as "mostly done after Phase 1" is reading it wrong.
- **Version skew via the cache.** Mitigated by network-first navigation and a
  version-keyed worker, but a self-hosted `npx t3` server serves its own bundle,
  so a stale worker against a newer server is the failure mode to watch.
- **iOS is the weak platform.** No install prompt, push only after install,
  storage evicted under pressure, no background execution. The PWA will be
  better on Android than on iOS, which is the inverse of the RN app's strength.
- **Performance.** `AGENTS.md` treats a dropped frame as a defect. A phone is
  where the current bundle (a 4.1 MB main chunk) hurts most; Phase 2 should
  carry a route-level code-splitting pass rather than leaving it to later.

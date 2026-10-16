# Workspace capture recipes

These recipes run through the web-only DEV bootstrap, before `main`, auth, connections or the live route tree. They need a web-only Vite server and no backend. The controller starts that server and browser only after explicit authorization. Implementation workers do not launch either.

Every session has environment `fixture-environment`, open Resources at project `fixture-synkek`, fresh Map-backed preferences and a clock fixed at `2026-10-13T10:30:00+02:00`. Reset recreates the session, router, module adapters and preferences. It retains measured capture metadata. No fixture API accepts a home directory, SQLite path, credential or external state path. Local, direct, relay and tunnel captures use this same fake session. Provider statuses never launch Codex, Claude, Cursor, Grok, OpenCode or ACP work.

| ID  | Dev-only URL path/query                      | view     | selectedKey     | resourceTab | centerArea     | resourceArea | requiredAreas           |
| --- | -------------------------------------------- | -------- | --------------- | ----------- | -------------- | ------------ | ----------------------- |
| 01  | `/workspace?space=mail&fixture=01`           | inbox    | mail-1          | files       | mail           | drive        | mail, drive             |
| 02  | `/workspace?space=communications&fixture=02` | chats    | slack-marketing | files       | communications | drive        | communications, drive   |
| 03  | `/workspace?space=tasks&fixture=03`          | all      | null            | files       | tasks          | drive        | tasks, drive            |
| 04  | `/workspace?space=projects&fixture=04`       | projects | fixture-synkek  | files       | projects       | drive        | projects, drive         |
| 05  | `/workspace?space=communications&fixture=05` | chats    | slack-marketing | browser     | communications | browser      | communications, browser |
| 06  | `/workspace?space=communications&fixture=06` | chats    | slack-marketing | agents      | communications | agents       | communications, agents  |
| 07  | `/workspace?space=meetings&fixture=07`       | upcoming | event-review    | docs        | calendar       | notes        | calendar, notes         |
| 08  | `/workspace?space=calendar&fixture=08`       | agenda   | null            | tasks       | calendar       | tasks        | calendar, tasks         |

Only `space` and `fixture` may appear, once each. An omitted space uses the recipe. A mismatched space, hash, alternate pathname, empty/unknown fixture or additional query key fails without importing the live app. Production parsing removes the fixture selector.

Files starts at root `drive-synkek`. Recipe 07 requests `note-launch-review` in Docs. Both 07 and 08 use Tuesday, 13 October 2026. Their seven chips are `M 12`, `T 13`, `W 14`, `T 15`, `F 16`, `S 17`, `S 18`, with T 13 selected. The Meetings subtitle is `Prepare, meet and follow through.`; Calendar is `Your week · 12 – 18 October 2026`.

Selected mail is the first Message-ID, `<fixture-1@synkek.invalid>`, in account `fixture-mail-maya`, INBOX UID 1, UIDVALIDITY 1. Confirmed mail links target project `fixture-synkek` and Drive file `folder-marketing`. The selected channel is `slack-marketing`; its first message ref is provider `slack`, resource `slack-marketing/message-1`. Event and note refs use `workspace-calendar/event-review` and `workspace-note/note-launch-review`. Browsing these refs never grants access or creates links.

The two collapsed communication replies have authored functional-only text, `Reply one for fixture review.` and `Reply two for fixture review.`. They are not original PNG copy. Suggested and dismissed URL links in the seed are also functional-only scenarios and must stay outside untouched resting PNG collections. All fakes record Join, Send, Schedule, external-open and open-thread operations in memory. Opening the inert website never requests synkek.com, an iframe or the `.invalid` seed URL.

## Capture procedure

Use the [V1 acceptance contract](mockup-waves/wave-map.md#visual-acceptance-contract-v1). Pin the browser runtime to en-GB and Africa/Johannesburg, a 1280x800 CSS viewport, device scale 1 and zoom 100%. Pin Segoe UI on Windows with system-ui fallback. Record the actual resolved font and host OS, and keep them consistent for before/after. A changed font or OS requires a reviewed rebaseline. The fixture pins dark semantic tokens even if browser preferences contain a light or custom theme. It never writes localStorage or sessionStorage. A separate light-theme smoke check cannot establish PNG parity.

After loading one of the routes, the authorized capture controller calls `window.__workspaceMockupCapture.configureCapture` with its observed values:

```ts
window.__workspaceMockupCapture.configureCapture({
  viewport: { width: 1280, height: 800, deviceScaleFactor: 1, zoom: 1 },
  resolvedFont: measuredFont,
  os: measuredHostOS,
  resolvedLocale: Intl.DateTimeFormat().resolvedOptions().locale,
  resolvedTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});
await window.__workspaceMockupCapture.reset("01");
const readiness = await window.__workspaceMockupCapture.ready();
```

`measuredFont` and `measuredHostOS` are observations from the controller, not desired settings. The entry also checks the fixture runtime's ambient locale/time zone. Missing font/OS, unsupported scale/zoom or mismatched locale/time zone rejects capture metadata. `ready()` before configuration rejects with `Capture host metadata is required.`

Readiness waits on React's committed layout signal and each active module's `settled()` promise. It never polls, sleeps or waits an arbitrary capture delay. An adapter's `settled()` must cover all committed fake work; `dispose()` must abort pending work and release its subscriptions. Concurrent reset requests are serialized, with superseded requests rejected. Reset first disposes the prior views and fakes, then starts a fresh request counter. Only the newest committed generation can produce a manifest.

Clear hover and focus before the resting capture. Move the pointer outside the claimed crop and blur the active control without navigating or invoking an action. Await `ready()` again after any interaction that commits fake work. The capture controller writes `<id>-<width>x<height>.png` and adjacent `<id>-<width>x<height>.manifest.json` in a disposable worktree-local evidence directory it chooses, for example `.t3/workspace-capture-evidence/`. Never use the production home. The fixture does not open output paths. Asset requests are limited to served dev entry assets; absolute filesystem paths and parent traversal are rejected.

`fixtureReady` means the pinned seed and session boundary are available. `shellReady` additionally requires the actual T2-T5 shared presentation components. A `complete` manifest needs every required center/resource slot, its actual presentation node and all required subregions ready. Empty adapters, placeholders and data-only modules cannot establish completion. T7 leaves all nine adapters with empty `readyRegions` and shows a readiness report. Recipe 07 retains `07.docs-format` and `07.docs-comments` until their W8 owners supply them. Plain note rendering alone cannot certify that crop.

Inspect `incompleteRegions` before choosing a comparison crop. A shell-only verdict may use completed shell regions while module bodies remain incomplete; full-PNG parity requires `complete`. Do not accept a final claim whose crop includes an incomplete region. All manifests are synthetic. Real provider permissions, packaged desktop, native mobile, physical remote access and live D05/D06 departures need separate evidence.

`networkRequests` counts attempted application requests, including requests caught by a view after the guard throws. The guard covers fetch, XHR, WebSocket, EventSource, sendBeacon and callable desktop bridge methods, including nested commands. It rejects every application request immediately. Only same-origin GETs to the entry's explicit served asset list and a same-host/port WebSocket with exactly `vite-hmr` are exempt. Browser-native module/CSS/font loading and an already-open Vite HMR connection are outside application counts. `/api`, `/ws`, `/oauth` and `/.well-known` never qualify as assets. A nonzero count rejects `ready()` even if the view swallowed the error. A successful manifest has zero application attempts and zero pending operations.

## Corrected comparisons

Use the unchanged reference PNGs under `mockups/` with corrections recorded in each manifest. D03 changes the first mail sender from the source list's Maya to Nina, Files selection in 02, Browser in 05 and Agents in 06. D28 freezes Tuesday and the stated date subtitles. The Communications date separator also uses the pinned Tuesday. No other fixture substitutions are admitted.

| Claim                             | Comparison box `[x,y,width,height]` at 1280x800  |
| --------------------------------- | ------------------------------------------------ |
| Full recipe                       | `[0,0,1280,800]`                                 |
| Primary navigation and space rail | `[0,0,259,800]`                                  |
| Breadcrumb and engagement header  | `[207,0,1073,78]`                                |
| Resources frame                   | `[940,26,340,774]`                               |
| Resources footer                  | `[940,768,340,32]`                               |
| Split center for 01/02/05/06      | `[259,78,681,722]`, list width 170, divider x429 |
| Full center for 03/04/07/08       | `[259,78,681,722]`, no allocated item list       |

Compare side-by-side crops and an overlay/difference. Boundaries, insets, baselines, row pitch and control bounds must be within 2 CSS px, type sizes within 1px, with matching wrapping, control order, icons, selected states and copy. Exclude text antialiasing from geometry measurements only. The inventories in [gap-shell.md](mockup-waves/gap-shell.md#2-rendered-look-inventory) and the module gap reports refine these boxes. Capture 1024px and 390px adaptations separately; they have no original compact PNG target. Desktop DEV fixture capture is outside this PNG acceptance contract.

The controller still owes all eight authorized browser captures after the shared shell and relevant module owners land. T7's tests and production exclusion check establish fixture readiness only.

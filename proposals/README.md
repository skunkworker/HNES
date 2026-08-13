# HNES — proposal to make it work on modern Chrome

## Context

HNES is at v1.6.0.3, Manifest V2, last substantively touched years ago. Two independent
things have broken since:

1. **Chrome killed MV2.** MV2 extensions no longer load, and the Chrome Web Store no
   longer accepts MV2 uploads. The extension cannot run at all as shipped.
2. **HN's markup drifted.** Even after an MV3 port, several features would render wrong
   or silently no-op, because they key off assets and tags HN removed.

Both must be fixed for the extension to be usable; (1) alone gets it loading, (2) makes
it correct. Verified against live `news.ycombinator.com` markup on 2026-07-31.

## Status

| Phase | State |
|---|---|
| Phase 0 — data migration | **Implemented and committed**, tested end to end |
| Phase 1 — MV3 port | **Implemented and committed** |
| Stylesheet rebuild | **Implemented and committed** (not in the original plan; added during the same pass) |
| Phase 2 — markup drift | Partly done — fade-class, vote arrows and the `/login` throw are fixed; the positional table walks are still unaudited |
| Phase 3 — hygiene | Not started |
| Design tracks | Proposals only |
| Palette as a user option | **Implemented** — [`palettes.md`](./palettes.md) |
| Tests | **Added** — see [`../test/README.md`](../test/README.md) |

The verification below is no longer a list to work through by hand; most of it runs.
`test/migration.mjs` drives a real version-bump upgrade and checks the data survives,
`test/tokens.mjs` checks all 110 contrast pair/palette/theme combinations, and
`test/degenerate.mjs` checks that the bodies HN returns when something is off do not
brick the page.

Two things the tests will not tell you, and both still need a human:

- **Logged-in flows** — voting, tagging, inline replies, `/threads` with real content.
- **Firefox** — `about:debugging` → Load Temporary Add-on, and confirm the shared
  manifest loads as an event page.

Also unverified: `poll`, `user`, `threads` and `submit` against real bodies. Every
automated attempt so far drew a 429, and a 429 body is not a page type — rerun
`npm run pages` once HN's rate limiter has cooled rather than reading anything into it.

Fixed since this document was written: `/login` threw on an unguarded
`$('form input[type=submit]').get(0)` whenever HN returned a body with no form — which a
429 is. It now returns early, and `test/degenerate.mjs` is the regression test.

---

## Phase 0 — Rescue user data BEFORE flipping the manifest *(implemented)*

This is the highest-risk step and it constrains everything after it, so it goes first.

All durable user state — per-user upvote counts, user tags, per-thread last-read comment
counts — lives in the **MV2 background page's `localStorage`** (`background.js:5,8,11,27`).
`localStorage` does not exist in an MV3 service worker. A naive port silently wipes every
user's tags and vote history.

The data itself survives the update (same `chrome-extension://<id>` origin); it just
becomes unreachable from a service worker. Two mechanisms recover it:

- **Chrome:** an offscreen document with `chrome.offscreen.Reason.LOCAL_STORAGE`
  ("the offscreen document needs access to localStorage") — this is the migration path
  Chrome's own MV2→MV3 guide points at. Requires the `offscreen` permission, Chrome 109+.
- **Firefox:** no offscreen API, but Firefox MV3 uses an *event page*, which still has
  `localStorage` — read it directly there.

Migration routine, run once on `chrome.runtime.onInstalled` and guarded by a
`hnesMigrated` flag in `chrome.storage.local`:

- copy every `localStorage` key into `chrome.storage.local`
- while copying, normalize the legacy numeric vote format (`"etcet": 1`) to the object
  form (`{"votes":1}`) — this is currently done lazily and per-page-load at
  `js/hn.js:1300-1310`; doing it once here lets that branch be deleted
- apply the expiry sweep that `background.js:34-41` was supposed to do — that IIFE is
  missing its trailing `()` and has never run, so stale thread entries have accumulated
  since the feature shipped
- set the flag, then tear the offscreen document down

**New releases must ship in this order:** migration logic first, in the same release that
flips to MV3. There is no second chance once a user updates.

## Phase 1 — Manifest V3 port *(implemented)*

`manifest.json`:

- `manifest_version: 2` → `3`, version → `2.0.0`
- `background.scripts` → `background: { service_worker, scripts }` — Chrome reads
  `service_worker`, Firefox reads `scripts` and ignores the other. One manifest, both
  browsers; this is MDN's documented cross-browser form.
- `web_accessible_resources` → MV3 object form (`{ resources, matches }`). Without this,
  `spin.gif` / `unvote.gif` / `tag.svg` are blocked in the page context.
- Drop `templates/comment.html` from that list — the file has never existed in git; the
  real template is an inline literal at `js/hn.js:269-307`.
- Match patterns: drop `news.ycombinator.net` and `news.ycombinator.org` (both fail to
  resolve — dead DNS), drop the `http://` variants (HN is HTTPS + HSTS), keep
  `hackerne.ws` (301s to HN).
- **Fix `hckrnews.com`:** the manifest matches only `http://hckrnews.com/*` and the site
  is HTTPS-only, so that content script has silently not run for years.
- Drop `all_frames: true` on the main content script — it re-runs jQuery + hn.js in every
  iframe for no benefit.
- `storage` + `unlimitedStorage` carry over unchanged (`unlimitedStorage` still lifts the
  `chrome.storage.local` 10 MB cap). Add `offscreen`. No `host_permissions` needed —
  every network call is same-origin from the content script.

`background.js` → service worker: replace the whole `localStorage` message proxy with
`chrome.storage.local`. Nothing else lives there — no tabs, alarms, webRequest,
contextMenus, commands, or action.

`js/hn.js`:

- `chrome.extension.getURL` → `chrome.runtime.getURL` at lines 66, 264, 465 (the
  `chrome.extension` namespace is gone in MV3).
- Delete the message-passing layer (`hn.js:911-931`) and call `chrome.storage.local`
  directly. This collapses today's two disjoint stores into one — collapse state already
  uses `chrome.storage.local` (`hn.js:622,630`) while everything else goes through the
  proxy — and kills the per-list-item message storm on hckrnews.com (`hn.js:1897` fires
  one `sendMessage` per `<li>`).
- Nothing else blocks MV3: no `eval`, no remote script, no inline `<script>`, no CSP key.

## Phase 2 — HN markup drift *(partly done)*

Verified against live HN, not inferred:

| Breakage | Where | Now |
|---|---|---|
| `y18.gif` **404s** | `hn.js:901`, `hn.js:953` | `y18.svg` |
| `grayarrow.gif` / `graydown.gif` **404** | `hn.js:1273-1274`, `style.css:846,856` | `div.votearrow` + `triangle.svg`; CSS should bundle its own asset instead of hotlinking HN's |
| `<font color="#3c963c">` green-user tag gone entirely (0 occurrences on live pages) | `hn.js:393-395` | new-user detection is dead code; needs a new signal or removal |
| Comment body is `div.commtext`, not a `span` | `hn.js:397-398` | `commentEl.querySelector('span')` never matches the fade class, so every comment defaults to `c00` and dead-comment fading is lost |
| Unguarded `span.comhead` deref | `hn.js:399` | throws on any comment row lacking it — and a throw here leaves the page **permanently blank** (see below) |

Still fine, worth knowing rather than "fixing":

- Indent-by-spacer-width (`hn.js:386`) **still works** — HN emits both `td.ind[indent="N"]`
  and `<img src="s.gif" width="N*40">`. Reading the `indent` attribute with the width as
  fallback is more robust, but nothing is broken today.
- `tr.athing.comtr`, `td.default`, `a.hnuser`, `span.age[title]`, `span.score`,
  `table.comment-tree`, `#hnmain` are all intact.
- Front page rows gained a `.submission` class and wrap titles in
  `span.titleline` — `hn.js:1843` already uses `.titleline > a`, so that path is current.

**Failsafe, and the reason this matters more than it looks:** `style.css` sets
`body { visibility: hidden }` at `document_start` and `hn.js:1943` reveals it at the very
end. Any uncaught throw anywhere in between leaves the user staring at a blank Hacker
News with no clue why. Given how much of this codebase does positional table walks
(`$('body > center > table > tbody > tr').eq(2)` and similar, ~15 sites), I'd add a
`setTimeout` reveal plus a top-level try/catch as part of this work. It converts every
future HN redesign from "extension bricks the site" into "some features stop working."

## Phase 3 — Hygiene *(not started)*

- **jQuery 3.2.1 → 3.7.1.** 3.2.1 is exposed to CVE-2019-11358 (prototype pollution) and
  CVE-2020-11022 / -11023 (XSS via HTML manipulation), all fixed by 3.5.0. This matters
  concretely because `hn.js:770-772` reads page HTML and pushes it through `.html()`,
  which executes scripts. Chrome Web Store review flags known-vulnerable bundled libs.
- Delete `HN.injectCSS` (`hn.js:905-907`) — it appends `<link href="news.css">` resolved
  against *HN's* origin, guaranteed 404.
- `js/jquery-3.2.1.js` (unminified, 268 KB) ships in the repo but is excluded by `zip.sh`;
  drop it with the upgrade.
- Modernize `e.keyCode` → `e.key` in `init_keys` (`hn.js:1764-1797`) and check
  `metaKey`/`altKey` — currently only `ctrlKey` is guarded, so **Cmd+L on macOS triggers
  "open story in new tab"** while trying to focus the address bar.

## Design tracks — proposed, not scheduled

Two independent tracks, each with three options. They are **orthogonal**: the token layer
separates colour from layout, so any palette below composes with any comment-UX direction.
Neither is implemented; both are for review.

Full write-ups with live mockups, token deltas and measured contrast. Both are
self-contained — no network, no external assets — so they open straight from disk:

| Track | Local | Hosted copy |
|---|---|---|
| Comment UX | [`comment-ux.html`](./comment-ux.html) | [claude.ai](https://claude.ai/code/artifact/693faa12-db6e-4ab9-a174-ac47ea807d50) |
| Visual overhauls | [`visual-overhauls.html`](./visual-overhauls.html) | [claude.ai](https://claude.ai/code/artifact/fd61b13c-6eaa-4e59-8a6b-7ceb00aae06a) |

The local copies are the durable ones; treat the hosted links as convenience.
Both files respect `prefers-color-scheme`, so they follow the OS theme when opened
locally (the hosted copies additionally have a manual toggle).

### Track A — comment UX

Baseline as shipped: body indents 54px, collapse target 26×26, collapsed row 34px,
259 rules / 62 tokens / 0 unused.

| Direction | Effort | Touches | Payoff | Main risk |
|---|---|---|---|---|
| **Rail** | Medium | Template + comment CSS | Collapse target grows from 26×26 to the full left edge; body indent 54px → 30px, buying width back at every level | Rewrites the markup the whole comment stylesheet hangs off |
| **Density** | Low | Tokens + one nav control | Comfortable / compact / dense via `data-hnes-density`, set in `boot.js` before first paint like the theme already is | Dense mode needs its own contrast pass |
| **Focus** | High | Read-state JS, keyboard, minimap | Promotes the existing read-position store from a border colour to the organising principle: dim read, light new, minimap, `n`/`p` unread jumps | Behaviour change, and leans on a store with no expiry |

Recommendation: **Density first, then Rail.** Density is close to configuration — the token
layer is already complete and audited. Rail has the real design payoff but should be its own
change, with this session's geometry checks re-run against it. Rail also wants the collapser
to become a real `<button>`; today it is an `<a>` with no href and is not focusable.

Focus should wait until the collapse-state store has an expiry — it would lean hardest on
exactly the data that currently grows without bound (see the note in `background.js`).

### Track B — visual overhaul

Organising question: how much orange is Hacker News? Each option answers differently and
brings its own theming machinery, not just a palette. All contrast computed per WCAG 2.1
relative luminance; all clear AA minimum.

| Overhaul | Orange | Ground | New machinery | Effort | Identity risk |
|---|---|---|---|---|---|
| **Newsprint** | Signal only | Warm paper | Contrast axis (`data-hnes-contrast`) | Low | Low — still reads as HN |
| **Ember** | Everything | Warm, one hue | `oklch()` ramp from a single `--hnes-hue` | Medium | Low — more HN than HN |
| **Slate** | Signal only | Cool desaturated | Semantic colour layer, split from brand | Medium | High — reads as a different product |

- **Newsprint** removes card fills entirely; nesting rides on the spine alone, retiring
  `--hnes-surface-alt` and the odd/even level tints. Mostly deletions.
- **Ember**'s real contribution is the mechanism rather than the look: once every surface is
  a step on one ramp, the palette re-themes from one number. Chrome 123+ is already the
  manifest floor, so `oklch()` is available.
- **Slate** splits brand from state. Today `--hnes-new-comment`, the poll graph and the
  active tab all trace back to `--hnes-brand`, so restyling the brand silently changes what
  "new" looks like. Dark becomes the reference and light is derived.

Recommendation: **Newsprint, with Ember's hue machinery underneath.** Newsprint removes
surfaces rather than adding colour, and the current design's weak moments have all been a
fill fighting the text on it. Ember's ramp is worth building whichever look ships. Slate is
the one to prototype behind the theme toggle rather than commit to — a cool Hacker News is a
product decision, not a styling one.

### Track B′ — all four shipped as a user option *(implemented)*

Rather than picking one, all four ship behind a third runtime axis, `data-hnes-palette`,
alongside the theme and density toggles. `classic` is the default and the unset state, so
nothing changes for anyone who ignores the control.

The colour block is split into eleven seeds per palette and a `color-mix()` derived layer
over them. The derivation runs **within each family, from that family's own endpoints** —
the obvious scheme of "every neutral a percentage of fg into bg" was measured and abandoned,
because the light and dark values here were tuned independently and do not share proportions.

Write-up, measurements and the one known pre-existing contrast defect:
[`palettes.md`](./palettes.md)
([hosted](https://claude.ai/code/artifact/af4f0fd4-4733-4b56-b0d0-b5905f2f653e)).

## Verification

No test suite exists, so this is manual. Load unpacked via `chrome://extensions`
→ Developer mode → Load unpacked, and check the service worker console for errors.

1. **Migration (the one that can't be redone):** install the *current* MV2 build first,
   tag a user and read a thread to seed `localStorage`, then load the MV3 build over it
   and confirm the tag and vote count survive.
2. Front page — styling applies, page becomes visible, `j`/`k`/`o`/`l`/`p`/`c`/`b` work,
   Cmd+L still focuses the address bar.
3. A 200+ comment thread (e.g. `item?id=49124218`) — nesting depth correct, collapse
   persists across reload, user tagging works, dead comments faded.
4. `/newest`, `/ask`, `/show`, `/jobs`, `/threads`, `/user?id=`, a poll, and the login
   page — these use the fragile positional selectors and are where regressions hide.
5. `https://hckrnews.com` — unread comment counts appear (this has been dead for years).
6. Logged in **and** logged out; vote/unvote round-trip.
7. Firefox: `about:debugging` → Load Temporary Add-on, confirm the shared manifest loads
   as an event page.

## Open decisions

- **Republishing.** The Chrome Web Store listing is MV2 and presumably delisted; getting
  back on the store means a fresh MV3 review with a privacy-practices disclosure. Is the
  goal "loads unpacked / sideloaded for you" or "back on the store"? The README says the
  project is unmaintained, so this may not be worth it.
- **Firefox.** Keeping the dual-target manifest costs ~2 lines. Worth it unless you want
  to drop the AMO listing.
- **Scope.** Phases 0-1 get it running. Phase 2 makes it correct. If you only want it
  loading again, stop after Phase 1 — but Phase 0 still has to be in that release.

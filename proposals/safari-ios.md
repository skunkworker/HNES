# HNES on Safari for iOS

**Status: proposal.** Nothing here is implemented. Written 2026-08-17 against the
tree at `8bacad8`.

The question is whether HNES can run as a Safari Web Extension on iPhone and
iPad. The answer is yes, and the interesting part is that the porting work is
small and the design work is not. Almost everything that would normally make
this hard — a second API surface, a second storage layer, a second manifest —
was already paid for by the MV3 port. What is left is a native app wrapper, one
Chrome-only API to make optional, and an open question about what a
desktop-table layout should become on a 390px screen.

## Why this is plausible now and was not before

Safari has run WebExtension-API extensions on iOS since iOS 15, and reads
`manifest_version: 3`. The v1.6 MV2 build would have been a rewrite. The v2.0
build is a port because the MV3 work already forced the two changes that matter:
the background page became a worker with no DOM assumptions, and every content
script reaches `chrome.storage.local` directly instead of proxying through the
background page over `sendMessage`.

Safari exposes the API under both `browser.*` and `chrome.*`, so the call sites
do not need touching. The `chrome.` surface this extension actually uses is
small enough to list in full:

| Call | Sites | Safari |
|---|---|---|
| `chrome.storage.local.get` / `.set` / `.remove` | 14 | yes |
| `chrome.storage.local.getBytesInUse` | 2 | yes |
| `chrome.storage.onChanged.addListener` | 1 | yes |
| `chrome.runtime.getURL` | 2 | yes |
| `chrome.runtime.onInstalled` / `.onStartup` | 2 | yes |
| `chrome.runtime.sendMessage` / `.onMessage` | 2 | yes |
| **`chrome.offscreen.createDocument` / `.closeDocument`** | **2** | **no** |

One row is red. Everything else lands.

## The one API that does not port, and why it does not matter

`chrome.offscreen` is Chrome-only. Firefox does not have it either, which is why
`background.js:76-80` already branches:

```js
async function readLegacyStorage() {
  // Firefox's MV3 event page still has localStorage; only Chrome needs the detour.
  if (typeof localStorage !== 'undefined') return snapshotLocalStorage(localStorage);
  return readLegacyStorageViaOffscreen();
}
```

On Safari that second line reaches `readLegacyStorageViaOffscreen`, which throws
`'offscreen API unavailable'` at `background.js:98`. The throw is caught by
`migrateLegacyStorage`, logged, and returned from without setting the migration
flag — so it fails safe today, with no data loss and no broken startup. It just
logs an error on every install and update, forever, chasing data that cannot
exist.

Because it cannot exist. The whole offscreen detour is there to rescue the MV2
background page's `localStorage`, and **there has never been an MV2 HNES on
iOS** — Safari on iOS could not run extensions at all until iOS 15, years after
the MV2 build stopped loading anywhere. No iOS user has a legacy store. The
migration is not a thing to port; it is a thing to skip.

The fix is one guard, not a rewrite:

```js
async function readLegacyStorage() {
  if (typeof localStorage !== 'undefined') return snapshotLocalStorage(localStorage);
  if (!chrome.offscreen) return {};   // Safari: no MV2 build ever ran here to migrate from
  return readLegacyStorageViaOffscreen();
}
```

Returning `{}` migrates nothing, writes the flag, and never runs again. Worth
doing regardless of whether the iOS port happens, because it is also the correct
behaviour for any future browser without the API.

`offscreen.html` and `offscreen.js` can stay in the tree and stay in the
manifest; Safari ignores a permission it does not implement. Whether the
`offscreen` permission triggers anything at App Store review is unknown and
would be worth checking early — it is cheap to drop from a Safari-specific
manifest if it does.

## Packaging: the part that is genuinely new

An iOS web extension is not a `.zip`. It ships **inside a native app** — a Swift
container whose only real content is a `SafariWebExtensionHandler` class and
your extension directory as a bundled resource. The user installs an app from
the App Store, then enables the extension in Settings → Safari → Extensions.

Xcode generates the whole project:

```sh
xcrun safari-web-extension-converter /path/to/HNES
```

It reads the manifest, scaffolds the app and extension targets, and reports
anything it cannot map. That is the entire mechanical conversion. What it cannot
do for you:

- **A Mac with Xcode.** Not a constraint for this project, but it does mean the
  iOS build cannot be produced by `zip.sh` and cannot run in the same CI as the
  Chrome and Firefox packages.
- **An Apple Developer Program membership**, $99/yr, to install on a real device
  beyond the 7-day free-provisioning window, to use TestFlight, or to ship.
- **App Store review.** A container app whose sole function is to deliver an
  extension is an accepted category, but the app itself needs enough of a first
  run to not read as a stub — typically a single screen explaining what the
  extension does and how to turn it on.
- **App Store metadata**, screenshots at several device sizes, a privacy
  disclosure. HNES stores everything locally and makes no network requests of
  its own, so the disclosure is short, but it is not zero.

`zip.sh` already writes a per-browser background key — Chrome has no event page
and Firefox has no service worker, so neither package can carry both. Safari
takes either, and picks with `browser_specific_settings.safari.preferred_environment`;
the converter is what would decide that. iOS becomes a third target alongside the
two, not a change to them.

## Permissions on iOS work differently, and it shows

On Chrome, a `content_scripts` `matches` entry is granted at install. On iOS,
the user is additionally prompted per site, with **"Allow for One Day"** as the
prominent option and "Always Allow" behind a second tap. A user who takes the
default gets HNES for a day and then wonders why Hacker News looks wrong again.

There is nothing to fix in code here — it is Safari's model — but it is the
single most likely source of "the extension stopped working" reports, and the
container app's first-run screen is the only place to get ahead of it.

## The actual hard part: it is a desktop table

HNES rewrites HN's markup in place, positionally: `td:nth-child(3)`,
`.subtext a:eq(1)`, `$this.parent().prev()`, walks over
`body > center > table > tbody > tr`. The good news is that this survives the
move, because **HN serves iOS the same HTML it serves everything else.** There
is no `m.ycombinator.com` and no mobile template — `news.css` carries some
`max-width: 750px` rules and that is the extent of it. The selectors hold. The
`degenerate.mjs` cases hold. The migration and token suites are platform-blind.

What does not automatically hold is that the result is a desktop layout on a
phone. The foundation is better than it sounds:

- Breakpoints already exist at 860px and 560px (`style.css:1725,1762`), and the
  560px one already unpins the score and comment tallies from their absolute
  positions rather than letting them overlap the title.
- `--hnes-control` already grows to 32px under 860px (`style.css:1736`).
- The vote arrows are already touch-aware — `style.css:1395-1402` exists
  specifically because HN's own `news.css` scales arrows 1.3× below 750px, and
  HNES sizes the whole gutter column for touch instead.
- `npm run pages` reports no horizontal overflow on any of the 14 page types.

So someone has thought about narrow screens. Nobody has thought about *fingers*,
and these are the places where that shows:

| Surface | Now | Problem on a phone |
|---|---|---|
| Settings panel | `width: 268px`, hangs off the header's right edge | Fits a 390px viewport, but only just; untested at 320px |
| Panel option rows | `padding: 5px` on a flex row | Well under a 44pt tap target |
| Gear | `padding: 6px 10px` around a small SVG | Same |
| Comment collapser | `--hnes-control`, so 32px at most | Under 44pt, and it is the most-tapped control on the page |
| 29 `:hover` rules | Recolour, fill, arrow tint | No hover on touch; iOS fakes it on first tap, so several controls need two taps to activate |
| Keyboard shortcuts | `j`/`k`/`o`/`l`/`p`/`c`/`b`/`h` (`hn.js:2045`) | Dead weight on iOS — the setting should probably not be offered |

The `:hover` row is the one that will actually annoy people. The fix is
mechanical — pair each `:hover` with `@media (hover: hover)` so touch devices
skip the sticky first tap — but it is 29 rules and it wants a real device to
verify, not a resized desktop window.

None of this is hard. It is just the majority of the work, and it is the part
that cannot be estimated from a manifest.

## Testing: the gap is real

Playwright drives Chromium, and that is what all seven suites assume. It cannot
drive iOS Safari with an extension loaded — no automation surface exists for
that. Practically:

- `typecheck`, `migration`, `tokens`, `degenerate` are logic and stay meaningful
  as Chrome-run proxies. They would catch a regression introduced *for* iOS.
- `session`, `controls`, `pages` assert on live layout and would need a parallel
  manual checklist for iOS. `controls` in particular asserts 43 things about the
  settings panel that nothing would be checking on the platform where the panel
  is most at risk.

The honest version is that iOS verification is manual, on a real device, against
a written checklist — the Simulator does not reproduce touch behaviour or the
per-site permission flow faithfully enough to trust. That is an ongoing cost per
release, not a one-time cost, and it is the strongest argument for doing the
touch work properly once rather than shipping and iterating.

## Payload

~262 KB of scripts and CSS, ~28 KB of images. jQuery 3.2.1 minified is a third
of that on its own. Nowhere near any iOS extension limit; not worth thinking
about.

## Suggested phasing

**Phase A — make the tree Safari-clean.** The `chrome.offscreen` guard above.
Confirm nothing else assumes a Chrome-only API. Half a day, and it is worth
committing on its own merits whether or not the rest happens.

**Phase B — get it running on a device.** `safari-web-extension-converter`, a
minimal container app, install to a phone via free provisioning. The goal is a
screenshot of HNES on real HN on a real iPhone, and a list of what is broken. A
day, most of it Xcode.

**Phase C — touch.** The table above: tap targets to 44pt, `@media (hover: hover)`
on the 29 hover rules, the settings panel at 320px, the keyboard group hidden
where there is no keyboard. This is the open-ended one and it should be scoped
*after* Phase B, from real screenshots rather than from this document.

**Phase D — ship, if it is worth shipping.** Developer Program, review, and a
per-release manual checklist forever after.

Phases A and B answer the question this document is asking. They are worth doing
before deciding anything about C and D.

## What would make this not worth it

- **App Store review rejects a thin container app.** Assessed as unlikely — many
  Safari extensions ship exactly this way — but it is the one failure mode that
  cannot be worked around, and it is not discoverable until Phase D.
- **Phase C turns out to be a redesign rather than a tune-up.** Possible. HN's
  layout is a table of two-line rows with tallies in gutters, and there is a
  version of "make this good on a phone" that means abandoning the gutters
  entirely — which would be a fourth density mode and a genuinely large piece of
  design work, not a breakpoint.
- **The manual test burden outweighs the users.** Every release growing a
  device-checklist step is a real ongoing tax on a project whose current release
  process is `zip.sh`.

## Adjacent, found while writing this

`images/spin.gif` is now unreferenced — it was only ever used by the inline
reply, removed in `60dce79` — but it is still listed in
`manifest.json:50` under `web_accessible_resources`. Harmless, and unrelated to
iOS, but it should go.

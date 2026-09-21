# A settings **page**, distinct from the settings **panel**

**Status: proposal only.** Not started, not scheduled.

This is deliberately a different thing from [`settings-panel.md`](./settings-panel.md).
That change shipped an in-page panel — a gear at the end of HN's header, one popup behind
it — and it settled, with measurements, why an in-page panel beat both its rivals: a
browser-action popup and an options page. This proposal reopens only the one part of that
argument that was closed *for cost*, not for principle: what a user has when they have no
Hacker News tab open, and what the panel explicitly punted as too big to hold.

## What it looks like

A second document — `options.html` — reachable from `chrome://extensions` → HNES → **Details
→ Options** (or, if an `action` is added later, a toolbar icon's right-click / context menu).
It reads and writes the same `chrome.storage.local` keys the panel does; it shares the
`HNESModes` spec list. It is not in Hacker News' DOM and paints nothing there; a change made
here reaches an open HN tab through the same `chrome.storage.onChanged` channel the panel
already uses, so the two stay consistent without either knowing about the other.

The page is where the things the panel **refused to host** live:

- **User tags and karma.** `setUserTag` and `upvoteUserData` (`hn.js:1714`,
  `hn.js:1771`) each write one JSON record *keyed by the username* — `{ "tag": "…",
   "votes": N }`. There is no index, so neither can be listed, edited or cleared from the
  panel; the panel is not a list view and `settings-panel.md` says so in its "Still open".
  A page has room for exactly this: one row per tagged user, sortable, with a clear-all
  beside it.
- **Storage**, promoted from a single row to the thing's own home. Today the panel reports
  `getBytesInUse` and offers to empty the unswept part (`buildStorageGroup`, `hn.js:1201`).
  That is fine for one button; an overview of *what* is taking space, and per-category
  clearing, is a page.
- **The paint axes, optionally.** Theme / view / palette can be previewed here at full size
  rather than in a 536px popup, but that is the weakest case — see below.

## What was there before

Nothing. Preferences reached *outside* an HN tab did not exist; the only surface was the gear,
and with no HN tab open there is no HN header and therefore no gear. Before your first visit is
the window where a settings page would actually be needed — pick the palette before navigating —
but it is also the window nobody notices, because the defaults (auto / comfortable / classic)
apply without any choice. That is the whole of its discoverability argument, and it is weak:
the panel's case was that "change the palette while looking at a spreadsheet" is not a thing
anyone does (`settings-panel.md`, *The three surfaces*). This survives only for **tags, karma
and storage**, which are maintenance a user reaches when they mean to, not on the way to HN.

## What the panel did, and why it still wins for its part

| | Reach without an HN tab | Live apply to open tabs | Room for a list | Second document |
|---|---|---|---|---|
| In-page panel (shipped) | No — needs a gear | Free (same document) | 536px, one group per tab | No |
| **Options page (this)** | **Yes** | Via `storage.onChanged` | **Unbounded** | Yes |

`settings-panel.md` weighed reach *from any tab* against the cost of a second surface, and
ruled it not worth paying for settings nobody changes except on HN. That ruling stands, so this
proposal does **not** ask to move the paint axes or the reading/keyboard toggles out of the
panel — that would spend the panel's "the setting lives where the thing it changes is" virtue
for reach nobody asked for. The page keeps the panel; it takes only what the panel could not
hold.

## The cost is real, and it is the cost `settings-panel.md` deleted on its way

Three of that change's "did not survive" clauses were deletions *because there was no second
document*. A page reintroduces a second document, so each of them becomes live again:

- **A shared stylesheet.** `css/tokens.css` was killed because nothing had to share the tokens.
  Now two surfaces do. But `style.css` is content-script-shaped — it sets `body { visibility:
   hidden }` at `document_start` and reveals on a failsafe timer — so the page cannot simply
  load it. The honest options are (a) extract the settings-panel block plus its palette seeds
  into a small shared css that both surfaces include, accepting back the split that was removed;
  or (b) style the page with inline rules and let `.hnes-settings` drift between two files.
  Option (a) is the one a "list defined once" codebase should pick — that principle is written
  at the top of `modes.js`.
- **A build path reused, not copied.** `buildSettingsPanel`, `buildStorageGroup`,
  `markSettings` are jQuery methods on `HN` and read their painting target off
  `document.documentElement` (`hn.js:958`; the paint path lives in `modes.js`). To render the same groups in `options.html`
  without a *second* list of specs, they would be factored to take a container and a paint root,
  so the panel paints `document.documentElement` and the page paints nothing. `modes.js` already
  gives the single source (`HNESModes.list`, `.tabs`, `.sections`); it only touches
  `chrome.storage.local`, which an options-document context can call. The risk is that the two
  surfaces build the groups differently and then disagree — the boot.js / hn.js drift this file
  fought at its header, one layer up.
- **Propagation vs. painting.** A paint axis changed on the page cannot restyle a body it never
  touched; it propagates, and a repaint only happens on the next HN load or through the existing
  `watch`/`subscribe` channel. That is a good fit for tags/karma (never painted in the first
  place) and an awkward one for theme/palette, which is another reason to leave those in the panel.

## Still-open items this would close vs. open

Closes:
- **User tags & karma have no surface** (`settings-panel.md`, *Still open*) — the natural home
  is a list view, and this is the one place a list can live.
- **Storage is a maintenance button, not an overview** — room for what it's holding.

Opens:
- A second document to keep in sync across two builds and two stores (see `zip.sh` notes below).
- Firefox: an event page has no `options_ui` behaviour issues here, but this has not been driven
  by hand anywhere yet, and the panel's own "Still open" already lists Firefox as undriven.
- **`zip.sh` / manifest.** Chrome wants `options_ui: { page: "options.html", open_in_tab: true }`;
  Firefox has no `open_in_tab` and a manifest that carries it may warn, the same class of
  cross-browser key mismatch that already splits the background key in two. The zip script would
  need another per-store line, and `options.html` plus its script must survive the `zip -r`
  exclude list (it does today: only `*.git* screenshots proposals test notes zip.sh
  jquery-3.2.1.js` are excluded).

## Options and recommendation

| | What it is | Effort | Touches | Risk |
|---|---|---|---|---|
| **1. Page = tags/karma + storage only** | A host for exactly what the panel punted; panel keeps paint axes, reading, keyboard, sections | Medium | new `options.html`+js, one shared css, factor the group builders out of `hn.js`, manifest `options_ui` | Two surfaces to keep in sync; the drift risk above |
| **2. Full mirror** | Page mirrors all seven groups at full size | High | plus a paint-axes renderer that cannot itself repaint | Spends the panel's virtue for reach nobody asked; weak case |
| **3. Link from panel, do not build yet** | The gear's Storage group grows a "manage tags & storage" affordance; page deferred | Low | one row, no new document today | Defers — but is the honest move while no one has asked for reach-without-HN |

**Recommendation: 3 now, 1 when a user asks.** The in-page panel won its argument on cost and
that holds for the three paint axes and the two behavioural toggles; leave them there. The only
thing a page strictly *adds* is room, and the only setting that needs room — the per-user
tags/karma list that `setUserTag`/`upvoteUserData` write with no index to read back — has no
surface at all today. Start from a link so the surface exists without paying for a second
document, and promote it to option 1 when listing tagged users is wanted enough to be worth the
sync cost. Option 2 is not recommended: a page that cannot repaint its own paint axes reads as
broken the moment someone changes theme and watches HN not move.

Nothing here blocks the running extension; every entry is something HNES already persisted
invisibly, given a list to live in.

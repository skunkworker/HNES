# The settings panel — theme, view and palette behind one gear

**Status: implemented.** The three nav controls are gone; a gear at the right end
of the header opens a panel holding all three.

This document started as a proposal to move them into a popup. The reasons held
up; the surface changed twice while it was being built, and the interesting part
is which of the plan's supporting arguments turned out to be doing no work.

## What it looks like

One `<a>` carrying an inline gear at the right end of the header — in the third
cell, beside the login link or the user menu, rather than among the section tabs
— and one panel built into the page behind it. Seven groups across four tabs —
Look, Reading, Sections, Storage — each group a list of options with the current
one marked. Theme and view carry a line of explanation each; the palette rows
*are* the swatches.

The stored keys (`hnesTheme`, `hnesDensity`, `hnesPalette`) and the `data-hnes-*`
attributes on `<html>` are unchanged, so there was no migration and no version
gate. Everyone's existing choice survived the change without being touched.

## What was there before

Three controls appended to the nav on every page load: `theme: auto`,
`view: comfortable`, `palette: classic` — around 45 characters of permanent
chrome, for settings a user touches about twice.

Their shapes disagreed for a reason that was about the nav rather than about the
settings: palette was a menu because five labels do not fit, theme and view were
cycles because three do. Neither shape had anywhere to say what `flow` or
`newsprint` actually do, which is most of what someone choosing between them
wants to know.

## The three surfaces, and why this one

| | Discoverable | Reach | Live apply | Extra plumbing |
|---|---|---|---|---|
| Browser-action popup | Only if pinned | Any tab | needs storage plumbing | manifest `action` |
| Options page | Only via the extensions menu | Any tab | needs storage plumbing | `options_ui`, a second document |
| **In-page panel** | **Always** | HN tabs | free — same document | none |

The first two were both built out on paper before the third won, and the argument
that settled it is that HNES only affects two hosts. "Reach from any tab" is the
structural advantage a popup or an options page has, and changing the Hacker News
palette while looking at a spreadsheet is not a thing anyone does — so both were
paying the real cost (invisible unless you go looking) for a benefit worth
approximately nothing here.

Discoverability was the whole risk in this change. The old controls were
impossible to miss. A gear in the same place is a smaller thing to notice but not
a hidden one, and it is the only one of the three options that keeps the setting
where the thing it changes is.

## What shipped, and what the plan got wrong

```
js/modes.js    +264     the descriptor list and its persistence, once
js/hn.js     +390/-225  panel in, six mode functions out; four behaviours gated
js/boot.js    +16/-41   mirrored list out, load/watch in
style.css    +278/-43   panel styles in, nav-toggle styles out; seeds split out
manifest.json    +1     modes.js ahead of boot.js at document_start
```

Three things the plan called for and did not survive:

- **`css/tokens.css`.** The split existed so a second document could share the
  colour tokens. There is no second document, so there is nothing to share and
  the split would have been churn for its own sake.
- **The iframe.** Same reason — it was buying style isolation for a panel living
  in a document that is not HN's. A panel in HN's own DOM needs no isolation from
  a stylesheet this repo also owns; `.hnes-settings` out-specifies the two
  `.nav-drop-down` rules it inherits and that is the entire cost.
- **`web_accessible_resources`.** Followed the iframe out.

One thing the plan had for the wrong reason. It argued that taking the controls
out of the page removes the render-critical-path coupling — `initModeControls`
awaited `boot.js`'s stored values so the nav would not visibly grow after paint.
True, but that is not what removed it. **The panel body is built on first click,**
not at init, and that is what does it: a click happens long after boot.js's read
has landed, so the panel reads its selection straight off `<html>` and there is
nothing to wait for. The same laziness is why a choice made in another tab shows
up correctly here — the marks are recomputed on every open rather than tracked,
so there is no second copy of the state to go stale.

`window.hnesModes` and its microtask-timing comment are gone either way.

That holds for the panel, and it stopped holding for the page: the Sections
setting put a storage read back in front of the reveal, because the header
cannot be built from a value nobody has read yet. See below for what that costs
and why it is not the same coupling.

## The swatch, and the one stylesheet change it forced

A palette control that renders the word `ember` was the best the nav could do.
The panel has room for the palette itself.

Each palette row carries `data-hnes-palette` and so paints itself in that
palette's own ground, ink, rule and accent. The colours had to come from the
palette blocks rather than from a copied list, or the swatch would drift from
what picking it does. That meant the palette blocks had to be able to match an
element and not just the document:

```css
:root:where([data-hnes-palette="ember"])  ->  [data-hnes-palette="ember"]
```

Both weigh (0,1,0), so the source-order argument the blocks were built on — and
the responsive steps at the foot of the file that depend on it — is untouched.

The rows butt together with no gap, and that is the design rather than a detail.
These five palettes are all warm papers whose grounds sit within a few percent of
each other in light mode; separated by white space and text that difference is
invisible, and a small chip of it is invisible twice over. At a shared edge it is
not — simultaneous contrast does work no chip size can. The alternative, drawing
a miniature page with the difference amplified, would make the swatch lie about
what picking it does.

Two consequences worth knowing:

- **Classic needed a rule of its own.** It is the unset state on `<html>`, so a
  classic swatch with no attribute would inherit whatever the page is currently
  set to. The seeds moved into `:root, [data-hnes-palette="classic"]`, and the
  brand-collapse rule picked up a `:not(:where([data-hnes-palette="classic"]))`
  so a classic swatch keeps classic's two oranges. The `:where()` is load-bearing
  rather than decorative: a bare `:not()` takes its argument's specificity, which
  would quietly put that one rule above the (0,1,0) every other palette rule is
  built on, and break the "a future palette can just say so" extension point the
  comment above it advertises.
- **The swatch is drawn from seeds only.** The derived layer stays on `:root`,
  because a custom property has its `var()`s substituted at computed-value time —
  a swatch inherits root's already-resolved derivations, not its own. bg, orange,
  fg, fg-muted and border are all seeds, so this costs nothing today, but a
  swatch that reached for `--hnes-surface-alt` would silently show the page's.

`test/tokens.mjs` still passes all 110 pair/palette/theme combinations, which is
what says the restructuring changed nothing on screen.

## A bug the move surfaced

Putting the gear in the header's third cell put the panel inside the reach of
`html body #header td:nth-child(3) a` — a catch-all pill rule at (1,1,4), which
out-specifies the `.nav-drop-down` rules by a comfortable margin. Every option
row came out as an inline-block pill and the panel rendered as a horizontal
smear.

The panel was not the only casualty. `#user-hidden`, the logged-in user menu,
hangs off that same cell, and had been getting the same treatment for as long as
the rule has existed — a row of pills where a list was intended. It went unseen
because none of the harnesses log in, and the one written for this change had to
fake a session to confirm the fix.

Excluding dropdown contents from the catch-all — `a:not(.nav-drop-down a)` — is
the fix for both, and is the right scope for that rule regardless: a menu row is
a list item, not a pill.

## Cross-tab sync

`boot.js` grew a `chrome.storage.onChanged` listener. The panel paints its own
tab directly; this is what every other open HN tab hears.

Not in the original scope, and added because the panel makes it necessary rather
than nice: three nav links read as this page's controls, and a settings panel
reads as global settings. Two tabs disagreeing until each is reloaded reads as
the setting not having saved.

It is also the cheap way round — no `tabs` permission (dropped in `2a907f8` for
store review), no messaging, and background tabs and second windows are covered
without being told to be. The extension still requests exactly the permissions it
did before this change.

## What it holds now

The three modes were the reason to build the surface. What the surface then made
possible is the rest of this list, and none of it is a new feature — every entry
is something HNES already did, unconditionally and invisibly.

| Group | | Was |
|---|---|---|
| Theme, View, Palette | three lists | three nav controls |
| Reading | highlight new comments, hckrnews.com counts | always on |
| Keyboard | shortcuts on/off, and the bindings listed | always on, written down nowhere |
| Sections | which of the 14 are header tabs | two hardcoded arrays in `rewriteNavigation` |
| Storage | how much is held, and clear the part that never expires | no surface at all |

Three of those are worth their own note.

**Storage is the only one that fixes something.** `background.js` says so in its
own comment: the expiry sweep only understands string values carrying an
`expire` stamp, and comment collapse state is written per comment as an object,
so it has never been swept and has grown for the life of the extension. Nothing
could see it and nothing could clear it. The row reports `getBytesInUse` on open
— cheap, and the store it is measuring is the one that gets large — and reads
the store in full only when clicked, which is also when it can say how many
entries it removed.

**The keyboard bindings are listed, not rebindable.** `h` was bound to a help
screen that was never written; the call was commented out where it was bound.
The panel lists these bindings, so `h` opens the panel — which is the screen that
binding was always reaching for. Rebinding is a real feature with a real cost
(capture, conflict checking, a reset) and the thing actually missing was that
nobody could find out what the keys were.

**Sections is the one that changes markup rather than style**, and it is why the
persistence had to move. See below.

## Behaviour settings, and what they cost

The original three all paint: boot.js writes an attribute onto `<html>` before
first paint and the stylesheet does the rest, which is what makes them free to
change live and across tabs. The four added here mostly do not. `rewriteNavigation`
has to *know* which sections are tabs before it builds the header, and no
attribute on `<html>` can tell it that.

So `modes.js` grew the `load` / `commit` / `watch` split that the previous round
listed as still open, and specs split into two families: one with an `attr`,
which paints, and one without, which hn.js reads and acts on.

The cost is one ordering rule. `rewriteNavigation` and `reveal` both queue on
`HNESModes.ready`, and ready fires its callbacks in order, so the header is built
before the page is shown — otherwise the default tabs would paint and then be
corrected. In practice that waits for nothing: boot.js issues the read at
document_start, so it has landed long before document_end. Two guards keep a
storage failure from costing a reveal rather than a setting — `load` resolves
with defaults when `chrome.storage` throws, and the stylesheet's failsafe
animation still reveals the page on a timer.

`rewriteUserNav` had to queue on the same thing. It appends the current user page
into `#top-navigation .nav-links`, which now might not exist yet — a one-line
reach into markup another function owns, only reachable while logged in on
`/upvoted` or a profile, and exactly the kind of thing a test that never logs in
cannot see.

## A second bug the panel surfaced

The keyboard shortcuts were guarded by one flag, `HN.searchInputFocused`, set by
the search box's own focus handler. Every other text box on Hacker News —
every comment box, the submit form, the profile editor — was unguarded, so `j`
typed mid-reply scrolled the page out from under it.

Asking the focused element instead (`INPUT`, `TEXTAREA`, `SELECT`,
`isContentEditable`) covers all of them, and covers boxes HN adds later without
being told about them. The flag it replaces is gone.

That fix is not what the toggle is for, but it is what looking for a reason to
want the toggle turned it up.

## Tabs, because it outgrew the column

The panel shipped holding three lists. By the time it held seven groups it was
**1519px of content in a 536px box** — measured, not estimated — which is about
a third of itself on screen at once. Everything after Palette was below the
fold, and on a full-height 1080px desktop, not just on a laptop.

What made that bad rather than merely long is that nothing said so. macOS
defaults to overlay scrollbars, which fade out a second after you stop
scrolling, so a panel with four hidden groups looked exactly like a panel with
none. A user who never scrolled had no way to learn that Sections or Storage
existed.

Four tabs, grouped so each pane fits without scrolling:

| Tab | Groups | Pane height |
|---|---|---|
| Look | Theme, View, Palette | 488px |
| Reading | Reading, Keyboard | 416px |
| Sections | Sections | 442px |
| Storage | Storage | 106px |

The grouping is not arbitrary and it is not only about balance: Look is the
three that paint, Reading is the two that change what a comment page does plus
the bindings that move around it, Sections is the header, Storage is the one
thing here that is maintenance rather than preference.

Three details worth stating, because each is a decision that could have gone the
other way:

- **The tab list lives in `modes.js`, next to `MODES`.** A spec's `label` and the
  tab that has to hold it are one fact. Splitting them across two files is
  exactly what let boot.js and hn.js drift apart before `modes.js` existed, and
  that lesson is already written at the top of that file.
- **A group no tab claims still appears**, in the pane that opens. Adding a spec
  with a new label and forgetting the tab list should look wrong immediately
  rather than silently dropping the setting out of the panel.
- **Panes are built up front, not on demand.** The panel is already a lazy build
  — nothing exists until the first open — and having paid that once, making a
  tab switch cost a second layout would be deferring the wrong half.

The panel keeps `overflow-y: auto` and a `max-height` for the short-viewport
case, where 70vh binds before the 615px cap does. It also now sets
`scrollbar-color`, which is what makes Chromium draw a classic scrollbar instead
of the overlay one — so on the occasions it does scroll, it says so.

## Saved, but not shown

There are two families of setting here and only one of them can repaint. A spec
with an `attr` goes onto `<html>` and the stylesheet does the rest, live and
across tabs. A spec without one — the two Reading switches, Keyboard, and all
fourteen Sections — was read at `document_end` and turned into markup and
bindings that already exist. Clicking it saves instantly and moves nothing.

Adding `ask` to the header and watching the header not change is
indistinguishable from the click having failed, and a settings panel cannot look
like that. So a bar appears under the panes: **Reload to apply**, with the word
*Saved* first, because the reload is applying a stored choice rather than
committing an unstored one. It is up until the reload it is asking for.

- **Under the panes, not inside one.** It is raised by whichever tab was open —
  Reading or Sections — and answered by any of them.
- **Keyed on `!spec.attr`, not on a list of keys.** That distinction is already
  the one `modes.js` documents at the top of the file, so a new behaviour spec
  gets the bar without anyone remembering to add it.
- **Cross-tab too.** `HNESModes.subscribe` reports which specs changed; a
  behaviour change made in another tab leaves this page just as stale, so the
  bar is owed here as well — on the next open if the panel is shut.
- **Derived, not tracked.** `markSettings` decides the bar's visibility on every
  open, the same way it recomputes the marks rather than tracking them, so there
  is no second copy of the state to go stale.

It cost 50px, which is what took the `max-height` cap from 560 to 615: the Look
pane set that cap and the bar has to fit under it. Sticking the bar to the
bottom of the scroll box would have avoided that, but it would also have made a
scrolling panel a supported case again, and not scrolling is the thing the tabs
bought.

## Tests

`test/controls.mjs` was rewritten and now asserts rather than logs — 43 checks,
exit code and all. Beyond the old coverage (attribute written, choice persists,
applied before the reveal, palette and view orthogonal) it adds:

- the panel is **lazy** — nothing exists in the DOM until the gear is clicked
- every group is drawn, with the right **number** of marks in each: one for a
  list, two for the two switches under Reading, four for the chosen sections,
  none for Storage
- the five swatches resolve to **five distinct grounds**, which is what fails if
  a swatch ever inherits the page's palette instead of carrying its own
- a **second tab** follows a change without being reloaded, and an **open panel**
  re-marks itself when the other tab is the one that wrote
- click-away and Escape both close it
- a **switch flips**, and `h` stops opening the panel when shortcuts are off —
  the behavioural assertion, since a behaviour setting writes no attribute to
  look at
- **typing is not navigation**: `h` with the search box focused does nothing
- a chosen section is a **header tab after a reload**, and has left the `more`
  menu — the one setting that rebuilds markup rather than restyling it
- clearing storage **reports what it freed**
- the strip draws **four tabs**, exactly one pane is shown, the strip is **one
  tab stop**, and **no label is clipped** — the cells are fixed-width, so a
  longer label would be cut rather than wrap
- the reload bar is **down for a repaint**, **up after a behaviour change**, and
  **down again after the reload** — two of the three assert it is down, because a
  bar that is always up says nothing
- the bar **does not overflow the panel**, checked on the tallest pane, which is
  the one that set the cap it has to fit under
- **no pane needs scrolling.** This is the assertion that protects the change: a
  setting added to the wrong tab puts the panel back behind the scrollbar, and
  nothing else here would notice
- **arrows walk the strip and wrap**, carrying focus with the selection

Two things about the harness itself. Hacker News rate-limits a driven browser
readily, and a 429 is neither a pass nor a failure — it is a page the run never
got to look at. The comment-page check now says `skip` and prints the status
rather than reporting a gear that was never built, which is the same thing
`test/pages.mjs` does with its sweep. Console errors are filtered to script
errors for the same reason: a failed request is HN's answer to being driven, not
a bug in the extension.

One thing that test learned the hard way: there is no inert pixel on the left of
an HNES front page. The comment count and score are gutter columns, and both are
links, so the click-away target has to be hunted with `elementFromPoint` rather
than guessed at — clicking a link closes the panel by navigating, which passes a
naive check for the wrong reason.

`test/pages.mjs` now counts gears instead of toggles. On the last sweep the six
pages that returned 200 all built it; the rest drew a 429 and are untested rather
than passing, as ever.

## Still open

- **Collapse state still grows.** The panel can now measure it and empty it, but
  clearing it is a thing someone has to think to do. The fix at the right depth
  is an expiry stamp on the collapse entries so `background.js` can sweep them
  like everything else, which means changing what `HNComments.storeMeta` writes
  and reading both shapes for a release.
- **User tags and karma have no surface either.** `setUserTag` and
  `upvoteUserData` write one record per username with no way to list, edit or
  clear them. That is a list view rather than a panel row — closer to a
  sub-page, and the reason it is not here.
- **Keyboard navigation inside a group.** The options are
  `<a href="javascript:void(0)">`, so they are focusable and the panel closes on
  Escape; the gear carries `aria-expanded` and the switches `role="switch"` with
  `aria-checked` kept in step by `markSettings`. The tab strip is a proper
  `tablist` — roving tabindex, arrows, wrap — but arrow-key navigation *within* a
  group is still not implemented, which the fourteen-row Sections list is the
  first group long enough to want.
- **Firefox** loads `zip.sh`'s Firefox package as an event page and supports
  `storage.onChanged`, but this has not been driven by hand there yet.
- **Three floating menus, three implementations.** The `more` menu and the user
  menu each toggle their own visibility and their trigger's `.active` blindly,
  and neither closes on a click elsewhere. The panel is the only one that does,
  which is why opening it has to reach in and clean up after the other two
  (`hn.js`, `$('.more-arrow > a.active').removeClass('active')`). That is
  knowledge a fourth surface would have to learn as well. The fix is one
  `HN.bindDropdown(trigger, menu)` — paint, close siblings, click-away, Escape —
  called from all three sites, which would also give the older two the
  click-away they have never had. Deliberately not done here: it rewrites two
  components this change does not otherwise touch.
- ~~An already-open panel does not follow another tab.~~ Closed by the same
  refactor: `HNESModes.subscribe` hands the panel the notification `watch`
  already receives, so a panel left open while another tab changes something
  re-marks itself instead of contradicting the page under it.

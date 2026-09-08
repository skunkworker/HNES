# Search in the header — proposal of 7 September 2026

Follows [`polish.md`](./polish.md). Evidence is the code on `aug_2026_rework`
and HN's live footer markup. No renders were made for this document.

## What is there now

HN puts one search form at the foot of every index and item page:

```html
<center>
  <span class="yclinks">Guidelines | FAQ | Lists | API | Security | Legal | Apply to YC | Contact</span>
  <br><br>
  <form method="get" action="//hn.algolia.com/">Search:
    <input type="text" name="q" size="17" autocorrect="off" spellcheck="false"
           autocapitalize="off" autocomplete="false">
  </form>
</center>
```

The extension keeps it there. It restyles the field (`style.css:1950-1963`)
and fills it with the words `Search on hn.algolia.com` as a fake placeholder
(`HN.setSearchInput`, `js/hn.js:2363`).

Three problems:

1. **It is at the bottom.** A reader has to scroll past 30 stories or a whole
   thread to find it. Search is the one control a reader reaches for from
   anywhere on the page.
2. **The fake placeholder submits.** The text is the field's value, not a
   `placeholder` attribute. Enter on an untouched field sends
   `Search on hn.algolia.com` to Algolia as the query.
3. **It does not match the header.** The header is pills and one icon
   (`hnes-gear`). The footer field is a square 270px box with the word
   `Search:` in front of it, in the body font.

## Proposal

Move search into the header as an icon that opens into a rounded field.

### Closed

A magnifier icon sits in the header's third cell, left of the gear. It has the
same box as the gear: a 15px glyph, `padding: 6px 10px`, pill radius, header
ink, header hover background. On a page with no third cell, the synthetic
header on `/login` and `/submit` (`js/hn.js:1455`), it goes where the gear
goes.

### Open

A click, or the `/` key, opens the field. The icon stays. The field grows out
to its left to 220px over 120ms, the same duration the pills use. The field is
a pill: `height: var(--hnes-control)`, `border-radius: var(--hnes-radius-pill)`,
no border, header hover colour as background, header ink as text,
`--hnes-header-ink-dim` as placeholder. Focus moves into it. The ring is the
shared `:focus-visible` rule (`style.css:1916`).

`prefers-reduced-motion` skips the grow and shows the field at full width.

### Close

- **Escape** closes the field and returns focus to the icon.
- **Blur** closes it when it is empty. A field with text stays open, so a
  click elsewhere does not lose a half-typed query.
- **A click on the icon** while open, with text in the field, submits. With an
  empty field it closes. One control, and the icon is never a dead button.
- Opening closes the `more`, user and settings menus, as the gear does now
  (`js/hn.js:997-998`). Opening any of those closes the field.

### Submit

Enter, or the icon, submits `GET https://hn.algolia.com/?q=…` in the same tab.
That is what the footer form does today. No new-tab option: the search page
has a back button.

### Phone

Below 560px the header is a grid (`style.css:2285`). The third cell is the
`user` area, top right. An open field there has about 200px to grow into
before it hits the logo. So below the breakpoint the open form takes the whole
first row: `grid-column: 1 / -1`, with the logo and login hidden while it is
open. The pills on row two stay. Close puts the row back.

### Keys

Add `/` to `KEYS` in `js/modes.js:60` as `Search`. The keydown handler
already ignores keys typed in a field (`js/hn.js:2396`), so `/` cannot fire
from inside the search box or a reply box. It also already reads `191` with
`shiftKey` as `?`, so `/` without shift is free.

### Footer

Remove HN's form and the two `<br>` before it. `.yclinks` stays, centred, with
`padding: var(--hnes-gap-3)`, so the footer does not keep a hole where the
field was.

## Implementation notes

Build the form. Do not move HN's. Moving it would leave `/user`, `/threads`
and `/login` without search, since HN prints the form on index and item pages
only. One code path, drawn on every page, is simpler than two states.

```html
<form class="hnes-search" role="search" method="get" action="https://hn.algolia.com/">
  <input type="search" name="q" placeholder="Search Hacker News" aria-label="Search Hacker News"
         autocorrect="off" autocapitalize="off" spellcheck="false">
  <button type="button" class="hnes-search-toggle" aria-label="Search" aria-expanded="false">…svg…</button>
</form>
```

- **Where.** `HN.initSettings` (`js/hn.js:948`) already finds the right slot
  and falls back to the cell. Pull that lookup into one `HN.headerSlot()` and
  call it from both. Insert the form before `.hnes-settings-host`, so the
  order is icon, gear.
- **Icon.** Bootstrap Icons `search` (MIT), inline as `HN.SEARCH_SVG` beside
  `HN.GEAR_SVG` (`js/hn.js:926`).
- **Open and close.** Same shape as the key help overlay: a namespaced
  `keydown.hnesSearch` bound on open and unbound on close. Track the open
  state on the form as a class, `is-open`, and drive the width from CSS. No
  jQuery animation, so reduced motion is one media query.
- **Delete.** `HN.setSearchInput` and its call at `js/hn.js:853`. The
  `input[name="q"]` and `form[action*="hn.algolia.com"]` rules at
  `style.css:1950-1963`. Remove the footer form in `HN.initElements` next to
  the `.yclinks` work at `js/hn.js:849`.
- **CSS.** New rules go in the header section beside `.hnes-settings-host`
  (`style.css:725`). The pill rule at `style.css:594` matches
  `#header td:nth-child(3) a`, so a `<button>` inside the form does not pick
  it up. Give the toggle the gear's box explicitly. The input needs
  `appearance: none` to drop the rounded search style on Safari. The shared
  button reset rule already covers `button.hnes-settings-tab`; add the toggle
  to it.
- **Tokens.** None new. Header ink, header hover, control height and the pill
  radius all exist. The `tokens` test needs no change.

Size **M**. One session for the control, the footer cleanup and the phone
layout together.

## Risks

- **Third cell width.** Logged in, the cell holds the user menu, karma and the
  gear. On a 1024px window a 220px field plus those still fits. On a phone the
  full-row rule above avoids the question.
- **`/` collides with the browser.** Firefox binds `/` to quick find. Chrome
  does not. A page handler that calls `preventDefault` wins in both. Say so in
  the keys tab.
- **HN adds a query field elsewhere.** The old `$('input[name="q"]')` was a
  page-wide selector. The new code scopes to `.hnes-search`, so an HN change
  cannot pick up the wrong input.

## Verification

1. `npm run session`: the routed index, item, `/user` and `/threads` pages each
   show one `.hnes-search` and no footer form.
2. Playwright at 1280px and 375px, closed and open, light and dark. Check the
   open field on the phone hides the logo and login and keeps the pills.
3. Type a query and press Enter. The tab goes to `hn.algolia.com/?q=…`.
4. Press Enter on an empty open field. Nothing is submitted.
5. `npm run typecheck` stays at 24.

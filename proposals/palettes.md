# The palette option — newsprint, ember, slate, letterpress

**Status: implemented.** All four ship as a runtime choice alongside the theme and
density axes. `classic` is the default and the unset state, so nothing changes for
anyone who ignores the control.

This document started as a proposal to do it. The plan survived contact with the
numbers in outline and not in detail; what follows is what was actually built, with
the place the original plan was wrong called out, because it is the interesting part.

## What it looks like

A third `<html>` attribute, `data-hnes-palette`, next to `data-hnes-theme` and
`data-hnes-density`. One entry in `HN.MODES` (`js/hn.js`), the mirrored entry in
`js/boot.js` so the choice applies before first paint, and one seed block per palette
in `style.css`.

5 palettes × 3 densities × 3 themes is 45 combinations and zero combinatorial CSS,
because palettes own colour tokens, density owns geometry tokens, and the two sets do
not intersect.

## The seed / derive split

The four palettes define **7 slots** each. `style.css` had **29 `light-dark()` colour
pairs**. Written literally that is 116 hand-picked values, so the colour block was
first split into:

- **Seeds** (11 pairs) — what a palette replaces: `bg`, `surface`, `fg`, `fg-muted`,
  `border`, `brand`, `orange`, `orange-ink`, `fade-strong`, `fade-weak`, `selection`.
- **Derived** — `color-mix()` over the seeds, palette-independent, never restated:
  `surface-alt`, `surface-hi`, `fg-subtle`, `link`, `visited`, the eight interior rungs
  of the fade ladder, and the two header inks.

### Where the original plan was wrong

The proposal said: derive every neutral as a percentage of `fg` into `bg`, with the
fade ladder as the showcase — ten pairs collapsing into ten percentages.

Measured, that scheme misses by an Oklab dE of **0.02 to 0.09**. It fails because the
light and dark values in this stylesheet were tuned independently and do not share
proportions. The fade ladder is the sharpest case: light fades to 9.8% of the
foreground, dark stops at 33.6%. Deriving both from one percentage would have made
dark-mode downvoted comments dramatically dimmer — a visible redesign smuggled in
under a refactor.

What works instead is **deriving within a family, from that family's own endpoints**.
Anchoring absorbs the light/dark divergence, and one percentage then serves both
themes:

| Token | Derivation | Worst dE |
|---|---|---|
| `surface-alt` | `bg` 61% into `border` | 0.008 |
| `surface-hi` | `bg` 31% into `border` | 0.008 |
| `fg-subtle` | `fg-muted` 61% into `border` | 0.004 |
| `visited` | `fg` 60% into `bg` | 0.007 |
| `c73`…`cce` | between `fade-strong` and `fade-weak` | 0.017 |

So the ladder's two ends stay seeds rather than becoming a proportion. That is not a
concession — light text on a dark ground loses legibility faster than the contrast
ratio predicts, so the shallower dark ladder is a deliberate call, and it now survives
into every palette instead of being flattened.

`border` and `fg-muted` refused to derive cleanly (best dE 0.012 and 0.015) and stayed
seeds. Both are slots the palettes supply anyway, as "rule" and "muted".

### What the palettes supply

Seven slots come from `visual-overhauls.html` verbatim. The remaining four are
generated per theme by applying classic's own transform to that palette's colours, so
a new palette inherits classic's *intent* rather than its hexes.

All four collapse `--hnes-brand` into `--hnes-orange`: each picked an accent that works
as a header surface *and* as accent text, which is the job classic needs two oranges
for. Their `--hnes-orange-ink` flips dark in dark mode for the same reason — the header
there is the bright accent, not a burnt one. An early pass derived `brand` by darkening
the accent the way classic does, which put light ink on a bright header and failed AA
at 2.0–2.5:1 in all four; the mockups' own pairing was right and the derivation was not.

## Two things the split turned up

- `--hnes-new-comment` resolved to `--hnes-brand`, so restyling the brand silently
  redefined what "new" looks like. State colours are now split from the brand.
- `.title a.on_story` carried a hardcoded `#3986f8` that every palette would have
  fought. Now `--hnes-current`, still blue on purpose: sharing the accent would make
  the current story indistinguishable from an unread one.

## The control

A menu, not a third cycling toggle — five values is four clicks to reach the last one.
It reuses `.nav-drop-down`, the surface the user and "more" menus already use, so it
inherits their placement, elevation and hover states. `MODES` descriptors gained a `ui`
field (`cycle` or `menu`); both renderings write the same attribute and storage key.

It is right-aligned because it is appended last and is therefore always the rightmost
thing in the nav: opening leftward is the only direction that cannot push the menu off
the viewport and reintroduce horizontal scroll.

## Verification

Run against a real Chrome with the extension loaded, on live Hacker News.

- **Token resolution** — custom properties are substitution-only, so reading them back
  needs a probe element using each token in a real property, then a canvas to convert
  the resulting `oklab()`/`color(srgb …)` to bytes. Every derived token lands within
  dE 0.019 of the literal it replaced; the ladder is monotonic toward the background in
  all five palettes and both themes.
- **Contrast** — every load-bearing pair clears AA across all five palettes and both
  themes, most AAA, none below classic.
- **End to end** — the control builds with all five options; picking one writes the
  attribute, relabels, closes the menu and persists; the choice survives a reload with
  the attribute already set before the reveal; palette and density do not disturb each
  other; no page errors on the index or a 300-comment thread.
- **The header** — `#header` resolves to the palette's brand on both page shapes
  (classic `#8f3b08`, slate `#ff7a33` in dark), and HN's own `bgcolor="#ff6600"` does
  not win. The remaining edge is `setTopColor` (`js/hn.js`), which writes an inline
  style on HN's memorial days and is the one place the token layer is not in charge.

## Known defect, pre-existing, not fixed here

`--hnes-fg-subtle` measures **2.81:1 on the page background in classic light**, against
a 4.5:1 AA floor for text at its size (12px). It is the same in every palette
(2.85–3.23 light, 3.59–4.25 dark) because they all inherit the same relationship.

It applies to the non-link words in the subtext line — "points by", "ago" — plus
`.paren`, `.hnes-age`, `.hnes-actions` separators and `.input-help`. The links in that
line are `--hnes-fg-muted` and pass at 5.02.

This predates the palette work; the derived value is dE 0.003 from the literal it
replaced. It is not fixed here because the fix is a design decision, not a token edit:
raising `fg-subtle` to 4.5 collapses it into `fg-muted` and loses the distinction, so
the real options are to accept a smaller gap or to move the text uses of `fg-subtle`
onto `fg-muted` and keep `fg-subtle` for the non-text ones.

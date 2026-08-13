# Ship all four palettes as a user option

## What this asks that Track B didn't

[`visual-overhauls.html`](./visual-overhauls.html) asked *which* of Newsprint, Ember, Slate
and Letterpress should become the look. This asks for all four, selectable at runtime —
which turns a design decision into a mechanism decision. The design work is already done and
measured; what follows is about making four palettes cost roughly what one costs.

The extension already has two runtime axes on `<html>` — `data-hnes-theme` (auto/light/dark)
and `data-hnes-density` (comfortable/compact/flow). A palette is a third axis of exactly the
same shape, and every piece of machinery it needs already exists.

## The one real obstacle

The mockups define each palette as **7 slots** — bg, surface, fg, muted, rule, accent,
onaccent. `style.css` defines **75 tokens, 29 of them `light-dark()` colour pairs**. Written
out literally, four palettes is 116 hand-picked hex values, every one of which needs its own
contrast measurement. That is not a stylesheet anyone will keep correct.

So the palettes are cheap only if the token block is first split into **seeds** and
**derived values**. That split is the bulk of the work, and it is worth doing on its own
merits — it is also, not coincidentally, what Slate's write-up was arguing for.

---

## Step 1 — Seed / derive split *(prerequisite, no visible change)*

Today's `:root` block is partly derived already (`--hnes-c00: var(--hnes-fg)`,
`--hnes-heat-3: var(--hnes-orange)`, `--hnes-spine: var(--hnes-border)`). This finishes
the job.

**Seeds** — the only thing a palette declares, ~8 `light-dark()` pairs:

| Seed | Why it can't be derived |
|---|---|
| `--hnes-bg`, `--hnes-surface` | the two grounds everything else mixes toward |
| `--hnes-fg` | the ink |
| `--hnes-brand`, `--hnes-orange`, `--hnes-orange-ink` | brand surface, accent, ink on brand |
| `--hnes-danger`, `--hnes-new-user` | independent hues — see below |

**Derived** — one palette-independent block, `color-mix(in oklab, …)`:

`--hnes-surface-alt`, `--hnes-surface-hi`, `--hnes-border`, `--hnes-fg-muted`,
`--hnes-fg-subtle`, `--hnes-visited`, `--hnes-selection`, `--hnes-new-parent`,
`--hnes-heat-1/2`, `--hnes-header-ink*`, and the entire `c5a…cdd` fade ladder.

The fade ladder is where this pays off most. The existing comment already says what those
ten pairs *are* — "the scale runs from full contrast toward the page background" — so state
it instead of restating it twenty times:

```css
--hnes-c73: color-mix(in oklab, var(--hnes-fg) 60%, var(--hnes-bg));
```

Ten pairs become ten percentages, correct in every palette and every theme for free.
The percentages get fitted to today's rendered values during implementation — sRGB hex to
an oklab mix ratio is not a clean linear map, so `[100, 72, 60, 54, 51, 44, 36, 30, 24, 18]`
is a starting ladder to be checked against the current output, not a claim.

**Why `--hnes-danger` and `--hnes-new-user` become seeds rather than derivations:** this is
Slate's "split brand from state" argument, and it applies whichever palette ships. Today
`--hnes-new-comment` traces back to `--hnes-brand`, so any palette that moves the brand
silently changes what "new" looks like. Once the seeds are separate, a palette can move the
brand without moving the state colours — or move both deliberately.

`color-mix()` and `oklch()` are Chrome 111+; the manifest floor is already 123.

## Step 2 — The palette axis

One entry in `HN.MODES` (`js/hn.js:929`) and the mirrored entry in `js/boot.js` — the
mirroring is deliberate and already documented in both files; skip the boot.js half and the
palette flashes to `classic` on every cold load.

```js
{ key: 'hnesPalette', attr: 'data-hnes-palette', label: 'palette',
  title: 'Switch colour palette',
  values: ['classic', 'newsprint', 'ember', 'slate', 'letterpress'] }
```

`values[0]` is the unset state and leaves the attribute off, per the existing convention —
so **`classic` is today's look and nobody who ignores the toggle sees any change.**
`HN.applyMode` and the storage write need no modification at all.

Each palette is then one seed block, weighted with `:where()` for the same reason the
density blocks are:

```css
:root:where([data-hnes-palette="ember"]) {
  --hnes-bg:      light-dark(#fbf6f1, #14100c);
  --hnes-surface: light-dark(#fffcf9, #1e1712);
  --hnes-fg:      light-dark(#241a12, #f0e6dc);
  --hnes-orange:  light-dark(#a8480c, #ff8f45);
  /* …five more */
}
```

Seed values for all four come straight out of `visual-overhauls.html:255-292`, where they
are already paired light/dark and already measured.

**Orthogonality holds:** palettes own colour tokens, density owns geometry tokens, and the
two sets do not intersect. 5 palettes × 3 densities × 3 themes is 45 combinations and zero
combinatorial CSS.

## Step 3 — What deliberately does *not* come along

- **Newsprint's "no card fills"** is `--hnes-com-fill: transparent` — which is already
  `view: flow`. Keeping it there preserves the orthogonality; Newsprint-the-palette is its
  colour half, and the documented recipe for the full look is **palette: newsprint + view:
  flow**. Folding a geometry change into a palette would be the one thing that breaks the
  axis model.
- **Newsprint's `data-hnes-contrast` axis** — defer. If it is wanted later it becomes a
  multiplier on the derived mix percentages, which is only cheap *because* of step 1.
- **Ember's user-selectable `--hnes-hue`** — ship Ember at fixed hue 45. Ember's own
  measurements say the accent lightness has to be solved per hue (a 30-entry table, because
  the target chroma is unreachable at 19 of 36 sampled hues). A hue slider is its own
  project; the ramp underneath it is what step 1 delivers.
- **Slate's semantic layer** — already absorbed into step 1, for every palette.

## Step 4 — Presentation

Three cycling text toggles in a 13.5px nav, one of them cycling five values, is the wrong
control: four clicks to reach `letterpress`, and the label is long.

| Option | Cost | Trade |
|---|---|---|
| Cycle, like the other two | none | 4 clicks worst case, longest label in the nav |
| **Dropdown** reusing `.nav-drop-down` | small | one click to any palette; component exists at `js/hn.js:1659-1700`, styled at `style.css:476-507` |
| Options page (`options_ui`) | medium | conventional home for 3+ prefs, but a new surface, and `boot.js` still needs its own storage read |

**Recommendation: the dropdown.** Give the `MODES` descriptor a `ui` field (`cycle` or
`menu`); theme and density keep cycling, palette renders as a menu. The storage key, the
attribute write and `boot.js` are identical either way — only the rendering branch differs.

## Verification

Per palette (×2 themes), only the **seeds** need measuring — every derived token is a mix of
two already-measured seeds:

1. `--hnes-fg` on `--hnes-bg` and on `--hnes-surface`; `--hnes-orange-ink` on `--hnes-brand`;
   `--hnes-orange` on `--hnes-bg`. Same twelve pairs this session already measured for classic.
2. Fade ladder renders monotonic `c00 → cdd`, and the steps at `c88` and below still clear the
   floor for de-emphasised text — construction guarantees monotone lightness, not legibility.
3. **`setTopColor` (`js/hn.js:1809`)**: on HN's memorial days the header `bgcolor` is an inline
   style that beats `--hnes-brand`. Confirm `--hnes-orange-ink` still reads on HN's tint in each
   palette — this is the one place the token layer is not in charge.
4. Cold-load flash check per palette: hard reload with cache disabled, confirm no `classic`
   frame — i.e. `boot.js` really did get the third entry.

## Sequencing

1. **Commit what exists first.** All of this lands on ~1,449 uncommitted lines (MV3 port +
   stylesheet rebuild). A seed/derive refactor is a bad thing to have tangled with that diff.
2. Seed/derive split — no user-visible change, carries the real risk, own commit.
3. Palette axis + four seed blocks.
4. Menu UI.

Steps 2-4 are each independently shippable; stopping after 2 still leaves the stylesheet
better than it is now.

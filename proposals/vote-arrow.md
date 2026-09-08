# Vote arrow and tallies — proposal of 7 September 2026

One defect on the index pages, measured on the live front page at 1280px on
7 September 2026, on `aug_2026_rework`.

## The defect

In every story row the comment count and the score sit higher than the vote
arrow and the title. The digits read as a line above the row, not as part of
it.

Measured on the first live row, in CSS pixels from the top of the row:

| Element | Text box | Font | Line height |
|---|---|---|---|
| comment count, score | 8 to 26 | 16px | normal (18px) |
| arrow triangle | 17.5 to 25.5 | — | — |
| title, first line | 9.3 to 29.3 | 17px | 22.95px |

The count's line box is 18px tall and starts at 9px. The title's first line
box is 22.95px tall and starts at 8px. Centred in their own boxes, the digits
land about 2.5px above the title's letters. The arrow is centred on the title,
so it lands 2.5px below the digits too.

## Why

Three rules each place one thing, and each does its own arithmetic:

- `#index-body .score, #index-body .comments` (`style.css:1219`) are absolute,
  with `padding-top: calc(var(--hnes-row-pad-y) + 1px)`. The comment there
  calls the pixel "the optical nudge the 9px here always was". The font is
  16px on a normal line height, so the box is 18px.
- `#index-body #content table td.votelinks` (`style.css:1206`) pads the arrow
  down by half of the title's first line box less the arrow's own 10px.
- The title (`style.css:1259`) sets `font-size: var(--hnes-row-title)` and
  the shared `html body .title` rule sets `line-height: 1.35`.

The arrow tracks the title. The tallies track nothing. They sat right when
the title and the tallies had the same line box, and drifted when the title
got its own size token and line height.

## Fix

Give the row one line box and put all three in it.

1. Add a token beside `--hnes-row-title` (`style.css:238`):
   `--hnes-row-line: calc(var(--hnes-row-title) * 1.35);`
2. Title: `line-height: var(--hnes-row-line)` in the `#index-body .title`
   rule. Same value as today, but named.
3. Tallies: `line-height: var(--hnes-row-line)` and
   `padding-top: var(--hnes-row-pad-y)`. Drop the `+ 1px`. The digits are
   then centred in the same box as the title's first line.
4. Arrow: `padding-top: calc(var(--hnes-row-pad-y) + (var(--hnes-row-line) - 10px) / 2)`.
   Same formula, one token instead of a repeat of the multiplication.

The compact mode changes `--hnes-row-title` to 14.5px (`style.css:386`). The
token follows it, so all three move together there too. Nothing else reads
`--hnes-row-title`.

Size **S**. One token, three rules, no markup.

## Verification

1. Live `/news` at 1280px, comfortable and compact. Measure the count text
   box, the arrow box and the title's first line box on one row. The three
   centres agree within 1px.
2. `/ask` and `/jobs`, since `/jobs` rows hold the age where the score goes.
3. 375px, where `--hnes-size-title` drops to 15px (`style.css:2314`).
4. `npm run tokens` stays green. The new token is a size, not a colour, so it
   needs no palette pair.

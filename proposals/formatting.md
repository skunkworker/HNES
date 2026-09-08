# Formatting help and buttons — proposal of 8 September 2026

One proposal, drawn from [refined-hacker-news][rhn]'s `input-field-tweaks`,
`backticks-to-monospace` and `key-bindings-on-input-fields`. Evidence is the
code on `aug_2026_rework` and the live text of `news.ycombinator.com/formatdoc`,
fetched on 8 September 2026.

[rhn]: https://github.com/plibither8/refined-hacker-news

## Status

**Implemented on 8 September 2026.** Everything below shipped as written, with
three changes made during the build, recorded at the foot of this document.
Covered by `test/formatting.mjs`, 26 checks.

## The problem

Hacker News is not Markdown, and nothing on the page says so. The comment box
is a bare textarea. The only guidance is a `help` link that leaves the page.
People type `**bold**`, backticks, `[text](url)` and hyphen lists, and HN
prints them literally. Single newlines are worse: HN joins them, so a typed
list arrives as one run-on paragraph.

## What HN really supports

The whole of `/formatdoc`, verbatim, is six rules:

1. Blank lines separate paragraphs.
2. Text surrounded by asterisks is italicized.
3. To get a literal asterisk, use `\*` or `**`.
4. Text after a blank line that is indented by two or more spaces is formatted
   as code.
5. Urls become links, except in the text field of a submission.
6. If your url gets linked incorrectly, put it in `<angle brackets>` and it
   should work.

There is no rule for bold, headings, lists, blockquotes, tables, backticks or
`[text](url)`. Rule 3 is the reason `**bold**` renders as bold *text* with the
asterisks eaten in an order most people do not expect.

## What is there now

* `HN.setUpReplyBox` (`js/hn.js:874`) wraps the textarea and HN's `help` link
  in `.hnes-reply-box`, pins the link to the corner, and grows the box with
  typed content. It adds no guidance of its own.
* `HN.getFormattingHelp` (`js/hn.js:1886`) writes three paragraphs of rules.
  It is called from one place only, the `about` field on `/user`
  (`js/hn.js:1810-1818`), where it toggles under the field.
* That help text is stale. It omits rules 3 and 6, and its wording for rule 2
  ("if the character after the first asterisk isn't whitespace") is no longer
  what HN publishes.
* `.input-help` (`style.css:1606`) and `.hnes-reply-box` (`style.css:1521-1545`)
  are the two surfaces this work extends. No new visual language is needed.

## Proposal

### 1. One source of truth for the rules

Put the six rules in one array, `HN.FORMAT_RULES`, each entry holding the rule
text and a flag for whether it applies to a submission text field. Rewrite
`getFormattingHelp(links_work)` to build from it. This fixes the stale profile
help and gives the reply box the same text, from one place.

Add a second short list, "What does not work", naming bold, headings, lists,
blockquotes, tables and backticks. That list is what stops the mistake, and no
part of HN's own documentation states it.

### 2. Help under the box, not away from it

Intercept the `help` link inside `.hnes-reply-box` and toggle `.input-help`
below the textarea instead of following the link. This is the same pattern the
profile page already uses (`js/hn.js:1811`), so the two boxes behave alike.

Set `aria-expanded` on the link and give the panel an id the link points at
with `aria-controls`. Keep the link's `href` so a middle-click still opens
`/formatdoc`.

### 3. A formatting bar

A row of buttons above the textarea, inside `.hnes-reply-box`.

| Button | Action on the selection |
|---|---|
| *Italic* | Wraps in `*`. Removes the asterisks if they are already there. |
| Code | Inserts a blank line, then indents every selected line by two spaces. |
| Quote | Prefixes every selected line with `> `. Convention, not a rule. |
| Link | Wraps a selected url in `<` and `>` (rule 6). |
| Help | Toggles the panel from item 2. |

Four constraints on the implementation:

* Each control must be `<button type="button">`. A bare `<button>` inside HN's
  form submits the comment, which is the worst possible failure here.
* The bar collapses the selection correctly on an empty selection: it inserts
  the markers and puts the caret between them.
* Every edit goes through one `applyEdit(textarea, fn)` helper that keeps the
  scroll position and the undo stack. Use `document.execCommand('insertText')`
  where it is available, because a direct `.value` write destroys undo.
* `Ctrl/Cmd+I` runs Italic. Bind it on the textarea, not on the document. The
  page-level key handler deliberately ignores keys while a text box has focus
  (`js/hn.js:2509`), so it will not carry this.

### 4. A Markdown warning

On `input`, debounced, scan the draft for the five patterns HN will not honour
and show one line under the box naming what was found. Offer a fix where one
is safe:

| Found | Message | Fix offered |
|---|---|---|
| `**text**` | Bold does not work here. | Change to `*text*` |
| `` `text` `` | Backticks do not work here. | none; suggest the Code button |
| `[text](url)` | Link syntax does not work here. | Change to `text url` |
| Lines starting `- ` or `* ` | Lists join into one paragraph. | Insert blank lines |
| Lines starting `# ` | Headings do not work here. | none |

The warning never blocks the post and never edits without a click. This is the
single highest-value item in the proposal, because it catches the mistake while
it can still be fixed.

### 5. A setting

Add one behaviour spec to `js/modes.js`, beside `hnesKeys`:

```js
{
  key: 'hnesFormatBar', label: 'Writing', ui: 'toggle', values: ON_OFF,
  name: 'Formatting bar',
  hint: 'Buttons and Hacker News formatting help above the comment box'
}
```

No `attr`, so it is read by `hn.js` at build time and takes effect on the next
page load. That matches how `hnesKeys` and `hnesNewComments` already work. It
adds a fifth tab, "Writing", to the settings panel; alternatively it sits in
the existing "Reading" tab, renamed.

## Where it applies

Every textarea named `text`, which is `/reply`, the box at the foot of an item
page, `/submit` and `/edit`. Rule 5 differs on `/submit`, so
`getFormattingHelp` keeps its `links_work` argument and the bar drops the Link
button there. The `about` field on `/user` keeps its own help panel, which now
reads from the same rule list; it gets no bar, because its textarea is named
`about` and its markup is nothing like a comment form.

## Not proposed

* **A live preview.** Matching HN's renderer exactly is the whole job, and an
  approximate preview that disagrees with the posted comment is worse than no
  preview. Revisit only if the six rules prove sufficient in practice.
* **Rendering backticks as monospace in posted comments**, which is what
  refined-hacker-news does. It makes HNES readers see a page other readers do
  not, and it misleads about what HN accepts.

## Tests

A new `test/formatting.mjs`, in the style of `test/controls.mjs`:

* The bar renders on a page with a `textarea[name=text]` and not on one without.
* Italic on a selection wraps it; Italic again unwraps it.
* Code indents each line by two spaces and puts a blank line above.
* A button click does not submit the form.
* The help panel toggles, and `aria-expanded` follows it.
* The warning fires on `**bold**` and the offered fix rewrites it to `*bold*`.
* With `hnesFormatBar` off, nothing is built.

## Size

Roughly 200 lines in `js/hn.js`, 60 in `style.css`, one spec in `js/modes.js`,
one test file. No new permissions, no network, no storage beyond the one
preference.

## What changed during the build

1. **No new settings tab.** The `Writing` group sits in the existing `Reading`
   pane (`js/modes.js`, `TABS`). A fifth tab for one switch would not have
   earned its width, and the pane still fits unscrolled.

2. **`setUpReplyBox` moved out of `doCommentsList` and into `HN.init`.** It was
   only ever called from the comments path, so `/reply`, `/submit` and `/edit`
   each carried a comment box that never got the wrap — and would never have got
   the bar. Moving the call is what makes "every textarea named `text`" true.

3. **Quote and Code share one `prefixLines`.** Both rewrite line starts and both
   toggle off when every touched line already carries the prefix, so they differ
   only in the prefix and in whether rule 4's blank line is owed.

4. **The `/user` `about` field gets the rules but not the bar.** Its textarea is
   named `about`, and `setUpReplyBox` keys off `text`. It shares `FORMAT_RULES`
   through `getFormattingHelp`, and — after the `/simplify` pass — the toggle
   itself through `HN.wireHelpPanel`, so it gains the `aria-expanded` and
   `aria-controls` it never had.

## What `/simplify` changed

Four review agents ran over the diff. Seven findings applied, one skipped.

* **`links_work` now reads `init`'s normalised `pathname`**, passed in, rather
  than `window.location.pathname`. HN serves `/reply` and `/edit` from `/x`, and
  `init` is the one place that untangles that; a second, weaker copy of "which
  page is this" is what drifts.
* **One disclosure, `HN.wireHelpPanel`**, for the comment box and the profile's
  `about` field. They were two implementations of one widget, and only the new
  one had aria wiring.
* **The open state lives in `aria-expanded`**, not in a closure boolean beside
  it. The attribute has to be written anyway and reading one costs no layout.
* **`wrapSelection` is two branches, not three.** A selection that took the
  markers in is shifted inward, which makes it the same case as a selection of
  the text alone. One unwrap formula instead of two.
* **A lint states its pattern once.** `applyLint` derives the `/g` copy from
  `re.source`; the second hand-typed regex is gone.
* **`FORMAT_UNSUPPORTED` is a list**, joined for display, for the same reason
  `FORMAT_RULES` is one.
* **No `!important` fights an `!important`.** The reserved padding is scoped to
  `.hnes-reply-box:not(.has-format-bar) textarea`, so the bar case simply falls
  through to the plain rule.

Skipped: wiring the help panel into `HN.closeMenus` and `HN.escapeCloses`, as
the settings panel and search are. Those are floating surfaces that cover the
page and must not stack. This panel is inline content under the textarea. It
covers nothing, so closing it when another menu opens would be wrong.

## Where it landed

| Part | File |
|---|---|
| Rules, unsupported list, buttons, lints | `js/hn.js:927-999` |
| `applyLint`, `wireHelpPanel` | `js/hn.js:1002-1035` |
| `replaceRange`, `wrapSelection`, `prefixLines` | `js/hn.js:1044-1124` |
| `addFormatTools`, `watchFormatting` | `js/hn.js:1127-1209` |
| `getFormattingHelp`, rebuilt from `FORMAT_RULES` | `js/hn.js:2200` |
| The setting | `js/modes.js:115-119`, and `TABS` |
| Styling | `style.css:1531-1604` |
| Tests | `test/formatting.mjs` |
| Screenshots | `test/screenshots/07-format-bar-{light,dark}.png`, written by the harness; untracked |

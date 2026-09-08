# Polish and UX — proposal of 4 September 2026

Follows [`visual-bugs.md`](./visual-bugs.md). That audit found nine bugs and
ranked them. This document reads the same screenshots again, plus the
`test/screenshots/` sweep, and lists what to do after those nine are fixed.

Evidence is the 22 August screenshots and the code as it stands on
`aug_2026_rework`. No new renders were made; every claim below points at a
screenshot or a line of code. Items marked *unverified* need a render first.

Three groups:

1. Two more defects, found while re-reading the screenshots.
2. Polish. Visual work that makes the existing screens consistent.
3. UX. Behaviour work that changes what the extension does.

Sizes: **S** is an hour, **M** is a session, **L** is more than one session.

---

## 1. New defects

### 1.1 `/jobs` rows show the age where the score should be

`test/screenshots/page-jobs.png`. The tally column reads `01`, `02`, `02`,
`06`, `06`, `07`, `09`, `010`, `010`, `018`. The second digit group is the
age of each row: 1 day, 2 days, 2 days, 6 days. The byline reads
`by 1 day ago`.

**Cause.** `HN.formatScore` (`js/hn.js:1805`) picks the score with
`span:first` and the author with `a:eq(0)`. Job rows carry no score and no
author. The first span is `span.age` and the first link is the age link, so
both selectors land on the age.

**Fix.** Select `span.score` and `a.hnuser`. When either is missing, leave the
slot empty and drop the word `by`. Size **S**.

### 1.2 Comment controls cannot take keyboard focus

The comment template (`js/hn.js:167`) builds the collapser, the unvoter and the
tag control as `<a>` with no `href`. A link with no `href` is not in the tab
order. A keyboard user can reach `reply` and `parent`, but not collapse, unvote
or tag. The settings panel already does this right: its tabs are `<button>`
elements with roving `tabindex` (`js/hn.js:1035`).

`style.css` sets `outline` once, on text inputs (`style.css:1629`). There is no
`:focus-visible` rule for nav pills, vote arrows, the gear or the collapser, so
those fall back to the browser default ring, which the palettes never tuned.

**Fix.** Make the three controls `<button type="button">` with `aria-label`.
Add one `:focus-visible` rule that uses the same ring as the inputs. Size
**S** for the rule, **M** for the buttons, because the comment stylesheet
keys off `a.collapser` in several places.

---

## 2. Polish

Ranked by how often the reader sees the screen.

### 2.1 Index subline on a phone

`visual-bugs/03b-arrow-mobile.png`. At 414px the byline runs on after the
title, so `(martypc.net) by boilerupnc 3 hours ago` wraps into the title's
lines. Title and metadata read as one sentence.

Below 600px, put the subline on its own row under the title. Keep the domain
on the title line, since it is part of the title's meaning. Size **S**.

### 2.2 Story text links on self posts

`visual-bugs/02a-comments-375.png`. Links inside `.toptext` render at title
size, black, underlined, with wide line spacing. Comment links in the same
page are body size and use the link colour.

Give `.toptext` the same type and link rules as `.hnes-comment .text`. This
is the same block that needs `overflow-wrap: anywhere` for bug 2. Size **S**.

### 2.3 Comment header controls

`visual-bugs/04-threads-no-story.png`. The header row holds, left to right:
vote arrow, `[–]`, author, tag icon, age. Three of those come from different
eras. The arrow is a filled triangle. The collapser is bracketed text. The
tag icon is a faint grey outline with no label.

- Replace the `[–]` text with a glyph in a square, sized to
  `--hnes-control`, so it matches the gear and the nav pills.
- Give the tag icon the muted foreground colour and a hover tint, so it reads
  as a control and not as a stray mark.
- Hide the tag icon until the header is hovered or focused, except when a tag
  is set. Today it appears on every comment, logged in or not, and most users
  never tag anyone.

Size **M**. Depends on 1.2, since the collapser becomes a button.

### 2.4 Comment footer links

`reply` and `parent` are 12px, black, underlined. Every other action link in
the extension is muted with an orange hover. Apply the subtext link rules to
`.hnes-comment footer`. Size **S**.

### 2.5 Poll layout

`visual-bugs/01-poll-broken.png`. After bug 1 is fixed the poll still needs a
layout. Each option today is three rows: the arrow and the text, the score,
then a 28px brand-orange bar. The bar is heavy and sits far from its text.

Proposed row: arrow, option text, then a thin bar with the points at its
right end. Compute each bar as a share of the total, not of the largest
option, so the bars add up to the vote count. Size **M**.

### 2.6 Mobile header

`visual-bugs/06-header-wrap-414.png` and `02b-threads-375.png`. Below about
480px the nav wraps and the logo centres itself between the two rows.

Define the two-row layout instead of letting flex wrap decide. Row one holds
the logo, `login` and the gear. Row two holds the section pills and scrolls
sideways if it must. This gives the same bar on every phone width. Size
**S**.

### 2.7 Section pill outside the main nav

`test/screenshots/page-jobs.png`. On `/jobs`, `/ask` and `/show` the section
pill is appended after `more ▾`, so it reads as a sixth tab in the wrong place.
Put the current section's pill in the row where `top` sits, and drop the
duplicate from the dropdown. Size **S**.

### 2.8 Pipes in the footer

`.yclinks` still separates its links with ` | `, as does the item subtext in
bug 9. Fix both with the same rule: hide the text nodes and use `gap`. Size
**S**.

### 2.9 `/jobs` page column

`test/screenshots/page-jobs.png`. The intro sentence sits at the left page
edge. The job table is centred and narrower than the page. Align both to one
column. Size **S**.

### 2.10 `More` link at the foot of an index page

`#more` is a plain orange word at the left. Make it a full-width row with the
same height as a story row, so it reads as the last row and gives a phone
thumb a target. Size **S**.

### 2.11 User page

Bug 8 says the page is unstyled. The shape to give it:

- One card. Label column in the muted colour, value column in the foreground.
- `submissions`, `comments`, `favorites` as a row of pills, not a stacked list.
- The `about` text gets the comment text rules, since it is the same HN markup.
- For the logged-in user, the form fields get the input rules from
  `style.css:1620`.

Size **M**.

### 2.12 Dark mode of the same screens — *unverified*

No dark render exists for the poll bars, the user page or the mobile header.
The 22 August sweep covered both themes for overflow only, not for
appearance. Re-run the sweep with screenshots in dark mode before this list
ships, and add any defect found to this document.

---

## 3. UX

### 3.1 A comment failsafe

`visual-bugs/01-poll-broken.png`. When `HNComments.apply` throws, the page
keeps the `Loading comments` box forever and hides HN's own tree
(`style.css:1235` sets `table.comment-tree` to `display: none`). The reader
gets no comments and no way to reach them.

The page-level failsafe already exists: `body` is revealed after 2s whatever
happens. Comments need the same idea.

1. Wrap the walk in a `try`.
2. On a throw, remove the loading box and unhide `table.comment-tree`.
3. Show one line above it: `HNES could not draw the comments. This is Hacker
   News' own view.`

This turns every future markup drift from *no comments* into *plain
comments*. Size **S**. This is the most valuable item in the document.

### 3.2 The loading box

`#loading_comments` (`style.css:1439`) is a white box with one word in it.
On a 453-comment page it shows for a noticeable time.

Replace it with three skeleton cards of the same shape as a comment card. It
should respect `prefers-reduced-motion`, so no shimmer in that case. Size
**S**.

### 3.3 Story context on `/threads` and `/newcomments`

After bug 4 restores the story name, decide where it goes. Proposed: trailing
the header as `on Story title`, in the muted colour, truncated with an
ellipsis on narrow screens. On `/threads` the same story repeats for a run of
comments; show it on the first comment of each run only. Size **S** for the
first part, **M** with the run grouping.

### 3.4 Reduced motion for `j` and `k`

`HN.next_or_prev_story` (`js/hn.js:2234`) scrolls with a 200ms jQuery
animation. `prefers-reduced-motion` is honoured for the spine transition only.
Skip the animation when the media query matches. Size **S**.

### 3.5 Keyboard help

The extension binds `j`, `k`, `o`, `l`, `p`, `c`, `b` and more, and the
settings panel lets a user turn them off. Nothing on the page lists them.
Bind `?` to a small overlay that lists the bindings, and add a line at the
foot of the settings panel that says `?` opens it. Size **M**.

### 3.6 The reply box

Bug 7 covers the width. The rest:

- Move the `help` link inside the box's frame, at the bottom-right, in the
  muted colour.
- Give the textarea a visible label for screen readers.
- Grow the box with its content up to a cap, instead of a fixed 80px.

Size **S**.

### 3.7 Tag a user from the user page

User tags can only be set from a comment header. The user page is where a
reader goes to decide who someone is, and it has no tag control. Add the same
tag control beside the username on `/user`. Size **M**, since the page has no
HNES markup yet and 2.11 has to land first.

---

## Suggested order

| Step | Items | Why first |
| --- | --- | --- |
| 1 | 3.1, 1.1 | A throw hides every comment. The `/jobs` numbers are wrong on every row. |
| 2 | 1.2, 2.3, 2.4 | One pass through the comment header and footer. |
| 3 | 2.1, 2.6, 2.7, 2.10 | One pass through the index pages and the header. |
| 4 | 2.2, 2.5, 2.8, 2.9 | Small, independent, one file each. |
| 5 | 2.11, 3.7 | The user page, then the tag control on it. |
| 6 | 3.2, 3.3, 3.4, 3.5, 3.6 | Behaviour work, each its own change. |
| 7 | 2.12 | Dark render sweep, then fold any findings back in. |

The `test/pages.mjs` sweep measures overflow and errors. It does not measure
appearance. Each step above should add its before-and-after screenshot to
`proposals/polish/` the way `visual-bugs/` did, so the next audit has a
baseline.

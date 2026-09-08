# What refined-hacker-news has that HNES does not — survey of 8 September 2026

A read of [plibither8/refined-hacker-news][rhn]'s feature list against this
codebase. Nothing here is decided. It is a shortlist to pick from.

[rhn]: https://github.com/plibither8/refined-hacker-news

One item has already been taken from it and shipped: the formatting bar over
the comment box, from `input-field-tweaks`, `backticks-to-monospace` and
`key-bindings-on-input-fields` — see [`formatting.md`](./formatting.md).

## Method

The upstream README was read on 8 September 2026. Each feature was checked
against `js/hn.js`, `js/modes.js` and `style.css` on `aug_2026_rework` by name
and by behaviour. "Already have it" below means HNES does the same job, not
that it does it the same way.

## Ranked

### Tier 1 — build these first

| Upstream name | What it does | Note |
|---|---|---|
| `reply-without-leaving-page` | Reply, edit and delete a comment under its parent, in place | HNES has an inline reply box (`HN.setUpReplyBox`), but the reply itself still navigates to `/reply`. This closes that. Largest of the four, and the one people would notice most. |
| `show-item-info-on-hover` | Hover an item link inside a thread to see its points, age and comment count | Needs a fetch per hover and a cache. No new permission: HNES already reads `news.ycombinator.com`. |
| `show-user-info-on-hover` | Hover a username to see karma and account age | HNES already fetches user data (`HN.getUserData`) for the upvote tally, so half the plumbing exists. |
| `show-similar-submissions` | List earlier posts of the same URL, at the foot of a thread | Wants hn.algolia.com, which is an optional host permission today (`manifest.json`, `optional_host_permissions`). It would have to be opt-in the way the Algolia theme is. |
| `click-comment-indent-to-toggle` | Click a comment's left indent to fold it | Small. HNES already draws the indent spine (`--hnes-spine`), so the hit area is already there to widen. |
| `toggle-all-comments-and-replies` | One control to fold or unfold a whole thread, or one subtree | Small, and it pairs with the item above. |

### Tier 2 — worth doing, smaller payoff

| Upstream name | What it does | Note |
|---|---|---|
| `more-accessible-favorite` | A favourite button beside items and comments | HN buries this behind the item page. |
| `more-accessible-flag` | A flag button on comments | Same. HNES already reads the flag link (`js/hn.js`, `a[href^=flag]`). |
| `click-rank-to-vote-unvote` | Click the rank number to upvote | Widens a very small hit area. Risk: an accidental vote is hard to undo. |
| `archive-submission` | An "archive" button at the top of a thread | One link to a third-party site. Should be opt-in for the same reason the Algolia theme is. |
| `hide-read-stories` | Hide stories you have already opened | HNES already tracks opened stories for `link-highlight`, so the state exists. |
| `sort-stories` | Sort the index by score, age or rank | Client-side reorder of rows already parsed. |
| `auto-refresh` | Refresh the index on a timer, without a reload | Polling HN on a timer is the one thing here that costs the site something. Off by default, long interval. |
| `fetch-submission-title-from-url` | Fill the title field from the page being submitted | Needs a cross-origin fetch of an arbitrary URL. That is a real permission ask, and it tells the extension every URL you submit. Weigh carefully. |
| `prefill-submit-title` | Prefill `Show HN: ` or `Ask HN: ` from the section you came from | Trivial. |
| `past-choose-date` | Pick a date on `/front` | Trivial. `/front` already takes a `day=` parameter. |
| `profile-links-dropdown` | Profile pages in a dropdown | HNES already has this — `HN.rewriteUserNav` builds the user menu. **Skip.** |
| `load-more-links-in-navbar` | Reveal more nav links in place | HNES already has this — the "more" menu and the Sections setting. **Skip.** |
| `input-field-tweaks` | Character count on the title, growing textarea | The growing textarea shipped with the formatting bar. The title character count did not. |

### Tier 3 — UI details

| Upstream name | What it does | Note |
|---|---|---|
| `change-dead-comments-color` | Dead comments in light red rather than near-invisible grey | HNES fades dead comments through the `--hnes-c*` ladder. A deliberate colour is a different choice, not obviously better. Would need a `tokens.mjs` contrast pair. |
| `comments-ui-tweaks` | Indent borders, indent width, `[op]` marking | HNES already has all three. **Skip.** |
| `highlight-unread-comments` | Mark new comments since the last visit | HNES already has this — `CommentTracker`, and the `hnesNewComments` setting. **Skip.** |
| `linkify-user-about` | Linkify a profile's `about` field | HNES already has this — `js/linkify/`. **Skip.** |
| `preview-and-set-top-bar-color` | Try header colours at `/topcolors` | HNES reads `topcolor` (`HN.setTopColor`) but the palette system supersedes it. **Skip.** |
| `on-link-focus-comment` | Jump to a comment from an `on:` link | Small. |
| `backticks-to-monospace` | Render backticked text as monospace in posted comments | **Do not build.** HNES readers would see a page no other reader sees, and it teaches that HN accepts backticks when it does not. See [`formatting.md`](./formatting.md), "Not proposed". |
| `list-hn-polls-separately` | A page listing HN polls | **Cannot build.** HN publishes no such list to draw from. Upstream builds it by search, which is a different feature with different costs. |

## Keyboard bindings HNES does not have

HNES binds ten keys, all on index pages: `HN.init_keys` (`js/hn.js:2819`) is
called from `HN.doPostsList` (`js/hn.js:1950`) and from nowhere else, so a
thread page has no bindings at all — not even `/` for search or `?` for the
overlay that lists them. The set itself is `KEYS` in `js/modes.js`. Upstream
binds far more, and on comments as well as items.

**On an item, missing from HNES:** `Enter` open and focus, `Ctrl/Cmd+Enter` open
in the background, `Esc` un-highlight, `u` upvote, `f` favourite,
`Shift+X` flag, `Shift+H` hide.

**On a comment, all missing** — HNES binds nothing on a comment page:
`j`/`k` next and previous, `Shift+J`/`Shift+K` next and previous sibling,
`Enter` fold, `Esc` un-highlight, `u` upvote, `d` downvote, `r` reply,
`f` favourite, `Shift+X` flag, `0`-`9` open the numbered links in the comment.

**Site-wide, all missing:** `Alt+H` home, `Alt+S` submit, `Alt+N` new,
`Alt+O` Show HN, `Alt+A` Ask HN, `Alt+P` profile, `Alt+T` threads.

Three notes before building any of these:

1. **Comment-page keys are the real gap.** A thread is where a reader spends
   their time, and HNES leaves the keyboard idle there.
2. **`KEYS` in `js/modes.js` is the list the settings panel draws.** Anything
   added has to go there, or it is bound and documented nowhere — which is the
   bug the list was added to fix.
3. **Voting keys need a confirm or an undo.** `u` beside `j` is one slip from a
   vote you cannot take back on an old comment.

## What this survey does not answer

Whether any of it is wanted. The upstream project is a different extension with
a different taste — it adds; HNES restyles. Several Tier 2 items would make HNES
busier without making it better. Pick from this list; do not work through it.

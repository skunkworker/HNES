# Tests

There is no unit-test suite — almost everything HNES does is rewriting a page it
does not control, so the useful tests drive a real Chrome with the extension
loaded. These four cover what manual checking kept missing.

```sh
cd test && npm install        # playwright only
npm run migration             # the one that cannot be redone
npm run tokens                # colour tokens, contrast, fade ladder
npm run degenerate            # broken markup must not brick the page
npm run controls              # settings panel, persistence, cross-tab, orthogonality
npm run pages                 # every page type, logged out
```

`migration`, `tokens` and `degenerate` need no network and are deterministic.
`controls` and `pages` hit live Hacker News and can be rate limited — see the
warning under `pages.mjs`.

Screenshots land in `test/screenshots/`.

## migration.mjs — run this before any release that changes storage

The MV2 → MV3 storage migration gets exactly one attempt per user: if it fails,
their tags, vote counts and read positions are gone and no later fix recovers
them.

Chrome will not load an MV2 extension any more, so the MV2 half is simulated
where it matters — the legacy data lived in `localStorage` on the extension
origin, and that origin does not change across the upgrade, so seeding it from
an extension page is the same starting state the real upgrade sees. The upgrade
itself is real: the manifest version is bumped between two launches of one
profile, so Chrome fires `onInstalled({reason: 'update'})`, which is the trigger
the shipping code hangs off. On Chrome that also exercises the offscreen
document, since a service worker cannot read `localStorage` directly.

Checks: legacy bare-number vote counts convert, the object form survives
untouched, **keys the new build already wrote are not clobbered**, live thread
read-state is kept, stale entries are swept, string flags are not eaten as
values, and `localStorage` is left intact so a failed run can retry.

## tokens.mjs — colour, in a browser rather than on paper

Custom properties are substitution-only, so reading one back gives unresolved
text; it has to be used in a real property and then converted through a canvas,
because Chrome hands back `oklab()` / `color(srgb …)`.

Checks every derived token against the literal it replaced (worst drift should
stay under an Oklab dE of 0.02), that the comment fade ladder stays monotonic
toward the page background in all five palettes and both themes, and contrast on
the load-bearing pairs.

Two expected non-failures in its output: `border / bg` is a hairline, not text,
and `fg-subtle / bg` is scoped to punctuation that carries no information — see
the comment on `--hnes-fg-subtle` in `style.css`.

## degenerate.mjs — broken markup must not brick the page

The failure mode this extension is most exposed to. HNES hides the page at
`document_start` and reveals it at the end of the rewrite, so anything that
throws in between leaves the user on a blank Hacker News. The stylesheet's
failsafe animation caps that at two seconds, but two seconds of blank followed
by a half-rewritten page is still a bug.

Every response is served by route interception, so there is no network and no
rate limiting. The cases are the bodies HN actually returns when something is
off: a 429 while you are being rate limited, an empty body, an expired-link
page, a login form missing its submit button. Each one asserts the page is
usable within the failsafe window — it deliberately does **not** assert the
rewrite succeeded, because against markup this broken, doing nothing is the
right outcome.

Sampling happens at 1.2s, inside the 2s failsafe, so the check is that `hn.js`
revealed the page itself rather than that the stylesheet bailed it out.

This is a real regression test, not a smoke test: removing the guard in
`doLogin` makes exactly the two `/login` cases fail with the original
`TypeError`, and restoring it makes all eight pass.

## controls.mjs — the settings panel end to end

Opens the gear, picks options out of the panel, and checks the attribute is
written, the mark moves, the panel closes on click-away and Escape, and the
choice persists across a reload with the attribute set *before* the reveal. Also
checks palette and view do not disturb each other. 33 checks, exits non-zero on
any failure.

Several exist because they are the ways this can break silently:

- **the panel is lazy** — nothing is in the DOM until the gear is clicked, which
  is what keeps the settings off the render critical path
- **five swatches, five distinct grounds** — a swatch that inherited the page's
  palette instead of carrying its own would still render, just identically five
  times over
- **a second tab follows without reloading**, and **an open panel follows
  another tab** — the `storage.onChanged` path in `modes.js` and the
  `subscribe` hook on top of it have no other coverage
- **a chosen section is a header tab after a reload** — the settings that
  change behaviour rather than paint write no attribute to look at, so the
  assertion has to be what the next load builds
- **typing is not navigation** — the keyboard guard, which for years was one
  flag that only the search box set

Note the click-away target is hunted with `elementFromPoint` rather than hard
coded. There is no inert pixel down the left of an HNES front page — the comment
count and score are gutter columns and both are links — and clicking one closes
the panel by navigating, which passes a naive check for the wrong reason.

A check can also report `skip`: Hacker News rate-limits a driven browser
readily, and a 429 is neither a pass nor a failure but a page this run never got
to look at. Console errors are filtered to script errors for the same reason.

## pages.mjs — every page type, logged out

Walks the index variants, a comment thread, a poll, a user page, `/threads`,
`/login`, `/submit`, and page 2, checking each one reveals, gets styled, builds
its controls, and throws nothing. These are the pages built on positional table
walks, so they are where a throw actually lands.

**Read the `http` column before believing a row.** HN rate-limits a fast sweep,
and a 429 body is not a page type — it has no form and no story rows, so it can
look like a clean page or like a broken one depending on what you assert. Any
row that is not 200 is untested, not passing. The script paces itself, but on a
warm rate limiter you may need to rerun the stragglers later.

That rate limiting is worth keeping in mind rather than working around: a 429
body with no form is exactly what used to make `/login` throw.

## What these do not cover

Logged-in flows — voting, tagging, inline replies, `/threads` with real content —
all need a session, so they are still manual. So is Firefox, which loads the
same manifest as an event page (`about:debugging` → Load Temporary Add-on).

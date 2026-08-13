# Tests

There is no unit-test suite — almost everything HNES does is rewriting a page it
does not control, so the useful tests drive a real Chrome with the extension
loaded. These four cover what manual checking kept missing.

```sh
cd test && npm install        # playwright only
npm run migration             # the one that cannot be redone
npm run tokens                # colour tokens, contrast, fade ladder
npm run controls              # nav controls, persistence, orthogonality
npm run pages                 # every page type, logged out
```

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

## controls.mjs — the nav controls end to end

Builds the controls, opens the palette menu, picks one, and checks the attribute
is written, the label updates, the menu closes and the choice persists across a
reload with the attribute set *before* the reveal. Also checks palette and
density do not disturb each other.

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

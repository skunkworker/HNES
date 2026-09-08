# Theme hn.algolia.com — proposal of 7 September 2026

**Implemented the same day, option B.** What the build changed from the text
below:

- The prefix is `html.hnes-algolia:root`, not `html[data-hnes-palette]`: the
  attribute is absent for the classic palette, and the extra `:root` unit is
  what beats the site's `.experimental.dark .Foo` rules without `!important`.
  `boot.js` sets the class on that host instead of `hnes-pending`.
- The orange lives on `.SearchHeader_search`, not `.SearchHeader`; `.Story_link`
  is the full URL and doubles as a meta-line span; the site's dark theme only
  exists as `.experimental.dark`. The match highlight is the one place the sheet
  needs `!important`, because the site declares it so.
- Chrome accepts the script registration before the grant; only injection is
  gated. So `permissions.onAdded` decides *when* to register, and `onInstalled`
  re-registers because an update or reload drops registrations while the grant
  survives.
- Firefox needs 128 or later for `optional_host_permissions`; on an older
  build the switch simply does nothing. `zip.sh` needed no change.
- The check lives in `test/algolia.mjs`, not `pages.mjs`, since it runs with
  no extension loaded.

Follows [`search-bar.md`](./search-bar.md). The header search sends every
query to `hn.algolia.com`, so the one page a reader lands on from the
extension's own control is the one page it does not style. Evidence is the
live site on 7 September 2026 and the manifest on `aug_2026_rework`.

## What the page is

- A React app under `<main id="root">`. One stylesheet, no CSS variables of
  its own. Verdana at 13px, black on white, an orange header bar.
- Plain class names, not hashed: `SearchHeader`, `SearchInput`,
  `SearchFilters`, `Dropdown`, `Story`, `Story_title`, `Story_link`,
  `Story_meta`, `Story_comment`, `Pagination`, `Footer`.
- The root `<div>` carries the site's own settings as classes, `default light`
  today. Its settings page offers a dark theme and an "experimental" style.
  A reader who only wants dark has that now.
- Every search re-renders the results. A DOM rewrite of the kind `hn.js` does
  to HN would be undone on the next keystroke.

## What the extension does today

Content scripts run on `news.ycombinator.com` and `hackerne.ws` only
(`manifest.json:21-40`), plus `hn.js` on `hckrnews.com`. Every token the
palettes define lives in `style.css`, in the same file as the HN rules.
`boot.js` reads the saved theme, density and palette at `document_start` and
writes them to `<html>` as `data-hnes-*` attributes. Settings live in
extension storage, which every host the extension runs on can read.

## Proposal

Style the site with CSS only, from the same tokens and the same settings.
No JS on the page beyond `modes.js` and `boot.js`.

### Themed, still distinct

The palette, the type and the controls are shared. The layout is the site's
own. A reader should know at a glance that this is the search site and not
the front page. What stays as the site drew it:

- **The header.** The H logo, the "Search Hacker News" wordmark and the
  full-width field in the middle. HN's header is a row of pills with a small
  icon; this one is a search box, and it should look like one.
- **The Algolia credit** in the field, unchanged.
- **The filter strip.** Stories, Popularity, All time. HN has no such row.
- **The result rows.** Title, then the URL in full, then the meta line. No
  rank, no vote arrow, no zebra. Rows are separated by the site's own rule,
  drawn in `--hnes-border`.
- **The match marks.** The yellow highlight on each hit stays a highlight,
  drawn in `--hnes-selection` so it fits the palette.

What changes is colour, type and control shape only: the brand bar takes the
palette's brand, the text takes the palette's ink and font, the field and the
dropdowns take the extension's field and pill shapes.

### 1. Split the tokens out

Move the seed and derived tokens, the palette blocks and the density blocks
(`style.css:47-425`) into `tokens.css`. `style.css` keeps the HN rules. Both
sites load `tokens.css` first. One file, so a palette change lands on both.

### 2. Run the boot on the new host

`modes.js` and `boot.js` at `document_start` on `https://hn.algolia.com/*`.
The `hnes-pending` class must not be set there: nothing rewrites the page, so
nothing reveals it. Give `boot.js` one guard on the host, or add a second
small boot that skips the flag.

### 3. One new stylesheet, `algolia.css`

Every rule is prefixed `html[data-hnes-palette]` so it out-specifies the
site's own classes without `!important`. The map:

| Site class | Rule |
|---|---|
| `.SearchHeader` | `--hnes-brand` background, `--hnes-header-ink` text; layout, logo and credit untouched |
| `.SearchInput`, `.SearchIcon` | the `.hnes-search` field: pill radius, `--hnes-surface`, `--hnes-border`, the shared focus ring |
| `.SearchFilters`, `.Dropdown` | `--hnes-surface`, `--hnes-border`, `--hnes-radius`, `--hnes-size-sm` |
| `.Story` | `--hnes-row-pad-y` and a `--hnes-border` rule between rows; no zebra, no arrow column |
| `.Story_title`, `.Story_link` | `--hnes-font`, `--hnes-row-title`, `--hnes-fg`; the domain in `--hnes-fg-muted` |
| `.Story_meta` | `--hnes-size-xs`, `--hnes-fg-muted`; the ` \| ` separators stay, since the site's own rhythm is part of what keeps it distinct |
| `.Story_comment` | `.hnes-comment .text`: body size, `--hnes-fg`, link colour |
| `em` inside results | `--hnes-selection` background; still a highlight |
| `.Pagination` | the extension's pill shape; current page takes the active pill |
| `.Footer` | `.yclinks` |
| the settings page | the submit form rules for its inputs and buttons |

Density applies through the row tokens with no extra rules. The site's own
`dark` class fights `color-scheme`; the sheet sets `color-scheme` on `html`
from `data-hnes-theme` the way `style.css:270` does, and the tokens already
answer to it.

### 4. The permission

Two ways to get the content scripts onto the host.

**A. Declare it.** Add the match to the manifest. Chrome then turns the
extension off at the update and asks every user to approve the new host
before it runs again. One click, once, for everyone, whether they use
Algolia or not. Firefox grants MV3 host permissions on install only when the
user opts in, so a Firefox user would also see a prompt.

**B. Ask for it.** Put the host in `optional_host_permissions`, add the
`scripting` permission, and register the content scripts with
`chrome.scripting.registerContentScripts` once the user grants it. The grant
has to come from a user gesture on an extension page, not from a content
script, so this needs a small options page with one switch, "Theme
hn.algolia.com". The settings panel's Storage tab links to it. Nobody is
interrupted, and the feature is opt-in.

Recommend **B**. A search results page is not why anyone installed the
extension, and the update should not turn it off to ask.

## Limits

- CSS only. Restyling survives the app's re-renders; restructuring does not.
- The class names are not hashed today. A deploy could still rename them,
  and the sheet would go stale with no error. Add one check to `pages.mjs`
  that loads a query and asserts the header, one row and the pagination took
  the tokens.
- The site's settings page and its "experimental" style get the form rules
  and nothing more.

## Size

| Step | Size |
|---|---|
| tokens split | S |
| boot on the host | S |
| `algolia.css` | M |
| options page and grant, option B | S |

**M** in all, one session. Option A saves the options page and costs every
user one prompt.

## Verification

1. A query page at 1280px and 375px, light and dark, in each palette.
   Put it beside the HN front page in the same palette: same colours, same
   type, and still plainly two different sites.
2. Change the palette on HN; the Algolia tab follows without a reload.
3. The site's own dark theme with the extension's light theme: the tokens
   win.
4. `npm run tokens` stays green; no new colour tokens.
5. Option B: a fresh install shows no prompt; the switch asks once and the
   sheet is on the next load.

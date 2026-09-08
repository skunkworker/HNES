/*
 * The logged-in pages, which nothing else covers.
 *
 * Every other harness browses Hacker News logged out, and two bugs have now
 * hidden in that gap: the user menu rendered as a row of pills for as long as
 * the header pill rule existed, and `/threads` threw a TypeError that aborted
 * the whole rewrite. Neither is exotic — both are what a signed-in user sees
 * every day — and neither was visible to a harness that never signs in.
 *
 * No network. The body below is HN's own markup for a logged-in front page,
 * served by route interception for every path, which is enough because what is
 * under test is what HNES does with `pathname` and the logout link. Logging in
 * for real would need credentials and would rate-limit immediately.
 */
import { chromium } from 'playwright';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SHOTS = join(ROOT, 'test', 'screenshots');

// The third header cell is the part that matters: the `logout` link is what
// HN.init keys "is logged in" off, and #user-hidden hangs off the same cell.
const BODY = `<html><body><center><table id="hnmain"><tbody>
<tr id="header"><td bgcolor="#ff6600"><table><tbody><tr>
<td><a href="https://ycombinator.com"><img src="y18.gif" width="18" height="18"></a></td>
<td><span class="pagetop"><b class="hnname"><a href="news">Hacker News</a></b>
<a href="newest">new</a> | <a href="front">past</a></span></td>
<td style="text-align:right;padding-right:4px;"><span class="pagetop">
<a id="me" href="user?id=alice">alice</a> (1234) | <a id="logout" href="logout?auth=x">logout</a>
</span></td></tr></tbody></table></td></tr>
<tr><td><table class="itemlist"><tbody>
<tr class="athing" id="1"><td align="right" class="title"><span class="rank">1.</span></td>
<td class="votelinks"><center><a href="vote?id=1"><div class="votearrow"></div></a></center></td>
<td class="title"><span class="titleline"><a href="https://x.test/">A story</a>
<span class="sitebit comhead"> (<a href="from?site=x.test"><span class="sitestr">x.test</span></a>)</span></span></td></tr>
<tr><td colspan="2"></td><td class="subtext"><span class="subline">
<span class="score">40 points</span> by <a href="user?id=bob" class="hnuser">bob</a>
<span class="age"><a href="item?id=1">2 hours ago</a></span> | <a href="item?id=1">3&nbsp;comments</a>
</span></td></tr><tr class="spacer"></tr>
</tbody></table></td></tr></tbody></table>
<br><br><form method="get" action="//hn.algolia.com/">Search: <input type="text" name="q" size="17"></form>
</center></body></html>`;

const results = [];
const check = (name, ok, note = '') => results.push({ name, ok: !!ok, note });

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'hnes-session-')), {
  channel: 'chromium',
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

await page.route('**://news.ycombinator.com/**', r =>
  r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: BODY }));

/*
 * The label on the active user-page link. `/upvoted` and `/favorites` are
 * always your own, so they are named plainly; anywhere else says whose it is.
 * A guard written with `||` instead of `&&` is true for every path, which both
 * lost that distinction and let the two id-less pages reach a deref that threw.
 */
const PAGES = [
  { path: '/upvoted?id=alice',   label: 'upvoted'          },
  { path: '/upvoted',            label: 'upvoted'          },
  { path: '/favorites?id=alice', label: 'favorites'        },
  { path: '/threads',            label: 'comments'         },  // no ?id=: HN drops it on your own
  { path: '/submitted?id=alice', label: 'Your submitted'   },
  { path: '/submitted?id=bob',   label: "bob's submitted"  },
];

for (const { path, label } of PAGES) {
  errors.length = 0;
  // 'commit' rather than 'domcontentloaded': a fulfilled route plus a
  // document_start script can settle before the wait is armed.
  await page.goto('https://news.ycombinator.com' + path, { waitUntil: 'commit' });
  await page.waitForTimeout(2000);

  const state = await page.evaluate(() => ({
    pending: document.documentElement.classList.contains('hnes-pending'),
    gear: document.querySelectorAll('.hnes-settings-host > a').length,
    search: document.querySelectorAll('.hnes-search').length,
    footer: document.querySelectorAll('form[action*="algolia"]:not(.hnes-search)').length,
    active: document.querySelector('.new-active-link')?.textContent ?? null,
  }));

  // `pending` is the tell for a throw: reveal() never ran and only the
  // stylesheet's failsafe animation is holding the page up.
  check(`${path} completes`,
    !state.pending && state.gear === 1 && state.search === 1 && !state.footer && !errors.length,
    errors.length ? errors.join(' ') : state.pending ? 'never revealed'
      : `${state.search} search, ${state.footer} footer form`);
  check(`${path} names the page`, state.active === label, state.active);
}

// The user menu, which the header's pill rule used to lay out horizontally.
// Vertical means every row is a block starting at the same left edge.
await page.goto('https://news.ycombinator.com/news', { waitUntil: 'commit' });
await page.waitForTimeout(2000);
await page.click('#my-more-link > a');   // the username, which is the trigger
await page.waitForTimeout(200);
const menu = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#user-hidden a')];
  return {
    count: rows.length,
    displays: [...new Set(rows.map(a => getComputedStyle(a).display))],
    lefts: [...new Set(rows.map(a => Math.round(a.getBoundingClientRect().left)))],
    tops: rows.map(a => Math.round(a.getBoundingClientRect().top)),
  };
});
check('user menu is a list', menu.count > 1 && menu.displays.join() === 'block',
  `${menu.count} rows, display ${menu.displays.join('/')}`);
check('user menu stacks vertically',
  menu.lefts.length === 1 && menu.tops.every((t, i) => i === 0 || t > menu.tops[i - 1]),
  `lefts ${menu.lefts.join(',')} tops ${menu.tops.join(',')}`);
await page.screenshot({ path: `${SHOTS}/08-user-menu.png` });

// Search: `/` opens it and closes the user menu still open from above; Escape
// shuts it and hands focus back to the icon.
await page.keyboard.press('/');
await page.waitForTimeout(200);
const opened = await page.evaluate(() => ({
  open: document.querySelector('.hnes-search')?.classList.contains('hnes-search-open'),
  focused: document.activeElement?.getAttribute('name'),
  value: document.querySelector('.hnes-search input')?.value,
  menu: getComputedStyle(document.querySelector('#user-hidden')).display,
}));
check('/ opens search', opened.open && opened.focused === 'q' && opened.value === '',
  `open ${opened.open}, focus on ${opened.focused}, value "${opened.value}"`);
check('search closes the user menu', opened.menu === 'none', opened.menu);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const shut = await page.evaluate(() => ({
  open: document.querySelector('.hnes-search')?.classList.contains('hnes-search-open'),
  focused: document.activeElement?.className,
}));
check('Escape shuts search', !shut.open && shut.focused === 'hnes-search-toggle',
  `open ${shut.open}, focus on ${shut.focused}`);
await page.screenshot({ path: `${SHOTS}/09-search-shut.png` });

await ctx.close();

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('check', 36) + pad('result', 8) + 'note');
console.log('-'.repeat(76));
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(pad(r.name, 36) + pad(r.ok ? 'ok' : 'FAIL', 8) + (r.note || '-'));
}
console.log(failed ? `\n${failed} of ${results.length} checks failed`
                   : `\nall ${results.length} checks pass`);
process.exit(failed ? 1 : 0);

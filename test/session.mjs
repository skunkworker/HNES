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

/*
 * A thread, for the comment-page keys, the spine click and fold-all. Also
 * routed rather than live: the checks need a known tree to walk, and HN's
 * threads change under a harness by the minute. Shape, by id:
 *
 *   101 ─ 102 ─ 103
 *   104 ─ 105
 *   106
 */
const comment = (id, level, user, text) => `
<tr class="athing comtr" id="${id}"><td><table border="0"><tbody><tr>
<td class="ind" indent="${level}"><img src="s.gif" height="1" width="${level * 40}"></td>
<td valign="top" class="votelinks"><center><a id="up_${id}" href="vote?id=${id}&amp;how=up"><div class="votearrow"></div></a></center></td>
<td class="default"><div style="margin-top:2px; margin-bottom:-10px;"><span class="comhead">
<a href="user?id=${user}" class="hnuser">${user}</a> <span class="age"><a href="item?id=${id}">1 hour ago</a></span>
</span></div><br><div class="comment"><div class="commtext c00">${text}</div>
<div class="reply"><p><font size="1"><u><a href="reply?id=${id}&amp;goto=item%3Fid%3D100">reply</a></u></font></p></div></div>
</td></tr></tbody></table></td></tr>`;

const ITEM = BODY.replace(/<tr><td><table class="itemlist">[\s\S]*<\/tbody><\/table><\/td><\/tr><\/tbody><\/table>/, `
<tr id="pagespace" style="height:10px"></tr>
<tr><td><table class="fatitem" border="0"><tbody>
<tr class="athing submission" id="100"><td align="right" valign="top" class="title"><span class="rank"></span></td>
<td valign="top" class="votelinks"><center><a id="up_100" href="vote?id=100&amp;how=up"><div class="votearrow"></div></a></center></td>
<td class="title"><span class="titleline"><a href="https://x.test/">A story</a></span></td></tr>
<tr><td colspan="2"></td><td class="subtext"><span class="subline"><span class="score">40 points</span>
by <a href="user?id=bob" class="hnuser">bob</a> <span class="age"><a href="item?id=100">2 hours ago</a></span>
| <a href="item?id=100">6&nbsp;comments</a></span></td></tr>
<tr style="height:10px"></tr>
<tr><td colspan="2"></td><td><form action="comment" method="post"><input type="hidden" name="parent" value="100">
<textarea name="text" rows="8" cols="80"></textarea><br><br><input type="submit" value="add comment"></form></td></tr>
</tbody></table><br>
<table class="comment-tree" border="0"><tbody>
${comment(101, 0, 'amy', 'First')}${comment(102, 1, 'bob', 'Reply to first')}${comment(103, 2, 'cat', 'Deeper')}
${comment(104, 0, 'dan', 'Second')}${comment(105, 1, 'eve', 'Reply to second')}
${comment(106, 0, 'fay', 'Third')}
</tbody></table></td></tr></tbody></table>`);

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
  r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
              body: new URL(r.request().url()).pathname === '/item' ? ITEM : BODY }));

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

/*
 * The thread. Reduced motion so every scroll lands at once: it is the branch
 * polish.md 3.4 asks for, and it lets a check read the scroll without a wait.
 * A short window, so the last comment starts off screen.
 */
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.setViewportSize({ width: 1000, height: 420 });
const loadItem = async () => {
  await page.goto('https://news.ycombinator.com/item?id=100', { waitUntil: 'commit' });
  await page.waitForSelector('#hnes-comments .hnes-comment', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
};
errors.length = 0;
await loadItem();
const current = () => page.evaluate(() =>
  [...document.querySelectorAll('.hnes-current-comment')].map(c => c.id).join(','));
const folded = () => page.evaluate(() =>
  [...document.querySelectorAll('.hnes-comment.collapsed')].map(c => c.id).join(','));
const press = async (...keys) => {
  const seen = [];
  for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(40); seen.push(await current()); }
  return seen.join(' ');
};

check('thread renders', await page.evaluate(() =>
  document.querySelectorAll('#hnes-comments .hnes-comment').length) === 6);
// Walks in reading order; Shift keeps to one depth and stops at the ends.
check('j/k walk the thread', await press('j', 'j', 'j', 'j', 'k') === '101 102 103 104 103');
check('Shift+J/K walk one depth',
  await press('Shift+K', 'Shift+K', 'Shift+J', 'Shift+J', 'Shift+J') === '103 103 103 103 103' &&
  await press('k', 'k', 'Shift+J', 'Shift+J', 'Shift+J', 'Shift+K') === '102 101 104 106 106 104');
check('Esc clears the highlight', await press('Escape') === '');

// The highlight has to be visible wherever it lands: 3:1 against the comment
// fill, the WCAG floor for a non-text mark, in both themes and every palette.
await press('j');
const marks = await page.evaluate(() => {
  const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  // A canvas resolves any CSS colour, color-mix() and light-dark() included.
  const rgb = c => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#fff'; cv.fillRect(0, 0, 1, 1);
    cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data].slice(0, 3); };
  const lum = c => c.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
                    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const root = document.documentElement, out = [];
  for (const theme of ['light', 'dark']) {
    for (const palette of ['classic', 'newsprint', 'ember', 'slate', 'letterpress']) {
      root.setAttribute('data-hnes-theme', theme);
      root.setAttribute('data-hnes-palette', palette);
      const head = document.querySelector('.hnes-current-comment > header');
      const cs = getComputedStyle(head);
      let fill = getComputedStyle(head.parentElement).backgroundColor;
      if (rgb(fill).join() === '255,255,255' && fill !== 'rgb(255, 255, 255)') fill = getComputedStyle(document.body).backgroundColor;
      out.push({ at: `${theme}/${palette}`, style: cs.outlineStyle, r: ratio(rgb(cs.outlineColor), rgb(fill)) });
    }
  }
  root.removeAttribute('data-hnes-theme');
  root.removeAttribute('data-hnes-palette');
  return out;
});
const weak = marks.filter(m => m.style !== 'solid' || m.r < 3);
check('highlight shows in every palette', marks.length === 10 && !weak.length,
  weak.map(m => `${m.at} ${m.r.toFixed(2)}`).join(' ') || `min ${Math.min(...marks.map(m => m.r)).toFixed(2)}:1`);

// Enter folds the current comment, and the walk then steps over what it hid.
await press('Enter');
check('Enter folds the current comment', await folded() === '101');
check('j skips a folded thread', await press('j') === '104');
await press('k', 'Enter');
check('Enter unfolds it', await folded() === '');

// Kept on screen: the last comment starts below a 420px window.
await press('Escape', 'j', 'j', 'j', 'j', 'j', 'j');
check('the current comment is kept on screen', await page.evaluate(() => {
  const r = document.querySelector('.hnes-current-comment > header').getBoundingClientRect();
  return r.top >= 0 && r.bottom <= innerHeight;
}), await current());

// Typing is not navigation, here as on the index.
await page.focus('textarea[name="text"]');
await page.keyboard.press('j');
check('keys ignored while typing', await current() === '106' &&
  await page.evaluate(() => document.querySelector('textarea[name="text"]').value) === 'j');
await page.evaluate(() => document.activeElement.blur());

// `?` and `/` work on a thread too, and the list names the thread keys.
await page.keyboard.press('?');
await page.waitForTimeout(150);
const help = await page.evaluate(() =>
  [...document.querySelectorAll('.hnes-keyhelp kbd')].map(k => k.textContent));
check('? opens the list on a thread', ['Shift+J', 'Shift+K', 'Enter', 'r', 'Esc'].every(k => help.includes(k)),
  help.join(' '));
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
await page.keyboard.press('/');
await page.waitForTimeout(150);
check('/ opens search on a thread', await page.evaluate(() =>
  document.querySelector('.hnes-search')?.classList.contains('hnes-search-open')));
await page.keyboard.press('Escape');
await page.waitForTimeout(100);

// The spine: a click on the line folds its comment; a click on a reply beside
// it does not. Then the fold has to outlive a reload, like the button's.
const spineAt = await page.evaluate(() => {
  document.querySelector('[id="101"]').scrollIntoView({ block: 'start' });
  const r = document.querySelector('[id="101"] > .replies').getBoundingClientRect();
  return { x: r.left + 1, y: r.top + 8 };
});
await page.click('[id="102"] > section.body .text');
check('a click on a reply does not fold', await folded() === '');
await page.mouse.click(spineAt.x, spineAt.y);
await page.waitForTimeout(100);
check('clicking the spine folds its comment', await folded() === '101');
await page.waitForTimeout(300);
await loadItem();
check('the spine fold is stored', await folded() === '101');
await page.click('[id="101"] > header .collapser');
await page.waitForTimeout(300);

// Fold all is a real button, keyboard included; its label says what it will do.
const fold = () => page.evaluate(() => {
  const b = document.querySelector('.hnes-fold-all');
  return b ? `${b.tagName} ${b.textContent}` : 'missing';
});
check('fold-all button above the thread', await fold() === 'BUTTON Fold all', await fold());
await page.focus('.hnes-fold-all');
await page.keyboard.press('Enter');
await page.waitForTimeout(100);
check('fold all folds every thread', await folded() === '101,104,106' && await fold() === 'BUTTON Unfold all',
  `${await folded()} / ${await fold()}`);
check('its focus ring is the token', await page.evaluate(() =>
  getComputedStyle(document.querySelector('.hnes-fold-all')).outlineStyle) === 'solid');
await page.keyboard.press('Enter');
await page.waitForTimeout(100);
check('and unfolds them again', await folded() === '' && await fold() === 'BUTTON Fold all');
await page.evaluate(() => document.activeElement.blur());

// r follows the current comment's own reply link.
await press('Escape', 'j', 'j');
await Promise.all([page.waitForURL(/\/reply/, { timeout: 5000 }).catch(() => {}), page.keyboard.press('r')]);
check('r opens the reply page', /reply\?id=102/.test(page.url()), page.url());

// The shortcuts switch covers the thread keys too.
await loadItem();
await page.click('.hnes-settings-host > a');
await page.click('#hnes-tab-keys');
await page.click('[data-hnes-opt="hnesKeys:on"]');
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check('keys off means off on a thread', await press('j') === '');
await page.click('.hnes-settings-host > a');
await page.click('#hnes-tab-keys');
await page.click('[data-hnes-opt="hnesKeys:on"]');
await page.keyboard.press('Escape');
await page.screenshot({ path: `${SHOTS}/10-thread-keys.png` });
check('no page errors on the thread', !errors.length, errors.join(' '));

await ctx.close();

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('check', 42) + pad('result', 8) + 'note');
console.log('-'.repeat(82));
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(pad(r.name, 42) + pad(r.ok ? 'ok' : 'FAIL', 8) + (r.note || '-'));
}
console.log(failed ? `\n${failed} of ${results.length} checks failed`
                   : `\nall ${results.length} checks pass`);
process.exit(failed ? 1 : 0);

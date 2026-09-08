/*
 * The formatting bar over a comment box.
 *
 * No network. The body below is Hacker News' own /reply markup, served by route
 * interception for every path, which is enough because what is under test is
 * what HNES does with a `textarea[name=text]` inside a form. A real reply page
 * needs a login and would rate-limit at once.
 *
 * The one check that cannot be faked is the submit guard: a bare <button> in
 * HN's form defaults to type=submit, so a formatting press would post the
 * comment. The fixture posts to a route that records the hit.
 */
import { chromium } from 'playwright';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SHOTS = join(ROOT, 'test', 'screenshots');

const BODY = `<html><body><center><table id="hnmain"><tbody>
<tr><td bgcolor="#ff6600"><table><tbody><tr>
<td><a href="https://ycombinator.com"><img src="y18.svg" width="18" height="18"></a></td>
<td><span class="pagetop"><b class="hnname"><a href="news">Hacker News</a></b>
<a href="newest">new</a> | <a href="front">past</a></span></td>
<td style="text-align:right;padding-right:4px;"><span class="pagetop">
<a id="me" href="user?id=alice">alice</a> (1234) | <a id="logout" href="logout?auth=x">logout</a>
</span></td></tr></tbody></table></td></tr>
<tr style="height:10px"></tr>
<tr><td>
<form method="post" action="comment">
<input type="hidden" name="parent" value="1">
<textarea name="text" rows="8" cols="60"></textarea>
<br><br>
<input type="submit" value="reply">
<a href="formatdoc" rel="nofollow" target="_blank"><font size="1">help</font></a>
</form>
</td></tr>
</tbody></table>
<br><br><form method="get" action="//hn.algolia.com/">Search: <input type="text" name="q" size="17"></form>
</center></body></html>`;

const results = [];
const check = (name, ok, note = '') => results.push({ name, ok: !!ok, note });

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'hnes-format-')), {
  channel: 'chromium',
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

let posted = 0;
await page.route('**://news.ycombinator.com/**', r => {
  if (r.request().method() === 'POST') posted++;
  return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: BODY });
});

const load = async () => {
  await page.goto('https://news.ycombinator.com/reply?id=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
};

// Drives the textarea the way a person does: focus, select a range, press a
// button. Selecting through the DOM rather than the mouse keeps the range exact.
const select = (from, to) => page.evaluate(([a, b]) => {
  const el = document.querySelector('.hnes-reply-box textarea');
  el.focus();
  el.setSelectionRange(a, b);
}, [from, to]);
const type = text => page.evaluate(t => {
  const el = document.querySelector('.hnes-reply-box textarea');
  el.focus();
  el.value = t;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, text);
const value = () => page.evaluate(() => document.querySelector('.hnes-reply-box textarea').value);
const press = label => page.click(`.hnes-format-btn[title^="${label}"]`);

await load();

// 1. is the bar there at all, and is every control safe inside HN's form?
const built = await page.evaluate(() => {
  const bar = document.querySelector('.hnes-format-bar');
  return {
    bars: document.querySelectorAll('.hnes-format-bar').length,
    labels: bar ? [...bar.querySelectorAll('button')].map(b => b.textContent).join(' ') : '',
    types: bar ? [...bar.querySelectorAll('button')].map(b => b.type).join(' ') : '',
    help: !!bar?.querySelector('a[href="formatdoc"]'),
    boxed: !!document.querySelector('.hnes-reply-box.has-format-bar'),
    pad: getComputedStyle(document.querySelector('.hnes-reply-box textarea')).paddingBottom,
  };
});
check('bar is built once', built.bars === 1 && built.boxed, `${built.bars} bars`);
check('four buttons, in order', built.labels === 'Italic Code Quote Link', built.labels);
check('no button can submit the form', built.types === 'button button button button', built.types);
check("HN's help link moved into the bar", built.help);

// 2. italic wraps, and a second press unwraps.
await type('hello world');
await select(6, 11);
await press('Italic');
const italic = await value();
check('italic wraps the selection', italic === 'hello *world*', JSON.stringify(italic));
await press('Italic');
check('italic again unwraps it', (await value()) === 'hello world', JSON.stringify(await value()));

// Selecting the asterisks along with the text is the same unwrap: the range is
// shifted inward so one formula covers both.
await type('hello *world*');
await select(6, 13);
await press('Italic');
check('italic unwraps a selection that took the asterisks in',
  (await value()) === 'hello world', JSON.stringify(await value()));

// 3. an empty selection gets the pair with the caret between.
await type('');
await select(0, 0);
await press('Italic');
const caret = await page.evaluate(() => {
  const el = document.querySelector('.hnes-reply-box textarea');
  return { value: el.value, at: el.selectionStart };
});
check('italic on nothing leaves the caret inside',
  caret.value === '**' && caret.at === 1, `${JSON.stringify(caret.value)} at ${caret.at}`);

// 4. code indents every touched line and buys itself the blank line rule 4
//    needs. The paragraph above is what makes the blank line necessary.
await type('a paragraph\nint x = 1;\nint y = 2;');
await select(12, 34);
await press('Indent');
check('code indents and adds the blank line above',
  (await value()) === 'a paragraph\n\n  int x = 1;\n  int y = 2;',
  JSON.stringify(await value()));

// 5. nothing above means nothing to separate from.
await type('int x = 1;');
await select(0, 10);
await press('Indent');
check('code at the top of the box adds no blank line',
  (await value()) === '  int x = 1;', JSON.stringify(await value()));

// 6. the buttons did not post the comment.
check('no button posted the comment', posted === 0, `${posted} posts`);

// 7. help toggles under the box instead of navigating away.
const before = page.url();
await page.click('.hnes-reply-box a[href="formatdoc"]');
await page.waitForTimeout(80);
const helpOpen = await page.evaluate(() => {
  const link = document.querySelector('.hnes-reply-box a[href="formatdoc"]');
  const panel = document.querySelector('.hnes-reply-box .input-help');
  return {
    shown: panel ? getComputedStyle(panel).display !== 'none' : false,
    expanded: link.getAttribute('aria-expanded'),
    controls: link.getAttribute('aria-controls') === panel?.id,
    rules: panel ? panel.querySelectorAll('li').length : 0,
    unsupported: !!panel?.querySelector('.input-help-unsupported'),
  };
});
check('help opens in place', helpOpen.shown && page.url() === before);
check('help announces its state', helpOpen.expanded === 'true' && helpOpen.controls,
  `aria-expanded=${helpOpen.expanded}`);
// All six of /formatdoc, because /reply does linkify — a submission's text
// field is the one place that drops the last two.
check('all six rules listed', helpOpen.rules === 6, `${helpOpen.rules} rules`);
check('and what does not work', helpOpen.unsupported);

await page.click('.hnes-reply-box a[href="formatdoc"]');
await page.waitForTimeout(80);
check('help closes again', await page.evaluate(() =>
  getComputedStyle(document.querySelector('.hnes-reply-box .input-help')).display === 'none'));

// 8. the Markdown warning, and the fix it offers.
await type('**bold** and `code` and [text](https://x.test/)\n- one\n- two\n# head');
await page.waitForTimeout(500);
const warned = await page.evaluate(() => ({
  lines: [...document.querySelectorAll('.hnes-format-warn p')].length,
  fixes: [...document.querySelectorAll('.hnes-format-fix')].map(b => b.textContent),
}));
check('every Markdown pattern warned about', warned.lines === 5, `${warned.lines} warnings`);
check('a fix offered where one is safe',
  warned.fixes.join(' | ') === 'Use single asterisks | Unwrap the links | Separate with blank lines',
  warned.fixes.join(' | '));

await page.click('.hnes-format-fix');
await page.waitForTimeout(80);
check('the bold fix rewrites the draft',
  (await value()).startsWith('*bold* and'), JSON.stringify((await value()).slice(0, 20)));

await type('a clean comment');
await page.waitForTimeout(500);
check('a clean draft warns about nothing',
  (await page.evaluate(() => document.querySelectorAll('.hnes-format-warn p').length)) === 0);

// 9. Ctrl+I runs italic without the page-level key handler seeing it.
await type('one two');
await select(4, 7);
await page.keyboard.press('Control+i');
await page.waitForTimeout(80);
check('Ctrl+I italicises', (await value()) === 'one *two*', JSON.stringify(await value()));

// 10. the record of what it looks like, in both themes. The theme goes through
//     the panel and the page is reloaded: the tokens are light-dark() and
//     resolve off color-scheme, which boot.js writes, so setting the attribute
//     by hand here would darken the page around a white textarea.
const DRAFT = '**Bold** does not work here.\n\n- one\n- two\n\nSee [the docs](https://x.test/) for more.';
const pose = async () => {
  await load();
  await type(DRAFT);
  await page.click('.hnes-reply-box a[href="formatdoc"]');
  await page.waitForTimeout(500);
};
await page.setViewportSize({ width: 1100, height: 560 });
await pose();
await page.screenshot({ path: `${SHOTS}/07-format-bar-light.png` });
await page.click('.hnes-settings-host > a');
await page.click('[data-hnes-opt="hnesTheme:dark"]');
await page.waitForTimeout(200);
await pose();
await page.screenshot({ path: `${SHOTS}/07-format-bar-dark.png` });
await page.click('.hnes-settings-host > a');
await page.click('[data-hnes-opt="hnesTheme:auto"]');
await page.waitForTimeout(200);

// 11. rule 5: a submission's text field is the one place HN does not linkify,
//     so the last two rules and the Link button have no business there.
await page.goto('https://news.ycombinator.com/submit', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
await page.click('.hnes-reply-box a[href="formatdoc"]');
await page.waitForTimeout(80);
const submit = await page.evaluate(() => ({
  labels: [...document.querySelectorAll('.hnes-format-btn')].map(b => b.textContent).join(' '),
  rules: document.querySelectorAll('.hnes-reply-box .input-help li').length,
}));
check('no Link button on /submit', submit.labels === 'Italic Code Quote', submit.labels);
check('and the two url rules are dropped', submit.rules === 4, `${submit.rules} rules`);

// 12. with the setting off, nothing is built and HN's own help link is back in
//     the corner where it was before the bar existed.
await page.click('.hnes-settings-host > a');
await page.click('#hnes-tab-reading');
await page.waitForTimeout(120);
await page.click('[data-hnes-opt="hnesFormatBar:on"]');
await page.waitForTimeout(200);
await load();
const off = await page.evaluate(() => ({
  bars: document.querySelectorAll('.hnes-format-bar').length,
  box: document.querySelectorAll('.hnes-reply-box').length,
  pinned: getComputedStyle(document.querySelector('.hnes-reply-box a[href="formatdoc"]')).position,
  pad: getComputedStyle(document.querySelector('.hnes-reply-box textarea')).paddingBottom,
}));
check('setting off builds no bar', off.bars === 0, `${off.bars} bars`);
check('the box itself is unaffected', off.box === 1 && off.pinned === 'absolute', off.pinned);
// Room is reserved for the pinned help link, and only then — with the bar, help
// sits in the bar and the textarea keeps the plain padding.
check('room reserved only where help is pinned',
  parseFloat(off.pad) > parseFloat(built.pad), `${built.pad} with bar, ${off.pad} without`);

await ctx.close();

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('check', 46) + pad('result', 8) + 'note');
console.log('-'.repeat(88));
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(pad(r.name, 46) + pad(r.ok ? 'ok' : 'FAIL', 8) + (r.note || '-'));
}
console.log('\npage errors:', errors.length ? errors : 'none');
console.log(failed || errors.length
  ? `\n${failed} of ${results.length} checks failed`
  : `\nall ${results.length} checks pass`);
process.exit(failed || errors.length ? 1 : 0);

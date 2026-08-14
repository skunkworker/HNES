/*
 * Walk every page type the extension rewrites, logged out, and record whether
 * the rewrite finished. These are the pages built on positional table walks
 * ($('body > center > table > tbody > tr').eq(2) and friends), so they are where
 * a throw leaves the page unstyled — the failsafe reveals it after 2s, which
 * means a broken page now looks merely wrong rather than blank, and only a
 * console error tells you apart.
 */
import { chromium } from 'playwright';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname, join as pjoin } from 'path';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SHOTS = pjoin(ROOT, 'test', 'screenshots');


const EXT = ROOT;
const OUT = SHOTS;

const PAGES = [
  ['front',     'https://news.ycombinator.com/'],
  ['newest',    'https://news.ycombinator.com/newest'],
  ['ask',       'https://news.ycombinator.com/ask'],
  ['show',      'https://news.ycombinator.com/show'],
  ['jobs',      'https://news.ycombinator.com/jobs'],
  ['best',      'https://news.ycombinator.com/best'],
  ['comments',  'https://news.ycombinator.com/item?id=49274600'],
  ['poll',      'https://news.ycombinator.com/item?id=126809'],
  ['user',      'https://news.ycombinator.com/user?id=pg'],
  ['threads',   'https://news.ycombinator.com/threads?id=pg'],
  ['login',     'https://news.ycombinator.com/login'],
  ['submit',    'https://news.ycombinator.com/submit'],
  ['newcomments','https://news.ycombinator.com/newcomments'],
  ['front-p2',  'https://news.ycombinator.com/news?p=2'],
];

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'hnes-')), {
  channel: 'chromium',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const page = await ctx.newPage();

const rows = [];
for (const [name, url] of PAGES) {
  const errors = [];
  const onErr = e => errors.push(String(e).split('\n')[0]);
  const onConsole = m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 120)); };
  page.on('pageerror', onErr);
  page.on('console', onConsole);

  let status = 0;
  try {
    const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    status = r ? r.status() : 0;
  } catch (e) { errors.push('goto: ' + e.message.split('\n')[0]); }
  await page.waitForTimeout(2600);
  // HN rate-limits a fast sweep; pace it so a 429 body is not mistaken for a page type.
  await new Promise(r => setTimeout(r, 6000));

  const state = await page.evaluate(() => ({
    pending: document.documentElement.classList.contains('hnes-pending'),
    visibility: getComputedStyle(document.body).visibility,
    // Did HNES actually restyle, or is this raw HN? #hnmain is HN's; the
    // settings gear only exists if initSettings got that far.
    controls: document.querySelectorAll('.hnes-settings-host').length,
    bodyFont: getComputedStyle(document.body).fontFamily.slice(0, 22),
    rows: document.querySelectorAll('tr.athing').length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));

  page.off('pageerror', onErr);
  page.off('console', onConsole);

  // A 429 is HN rate-limiting the test, not the extension.
  const real = errors.filter(e => !e.includes('429') && !e.includes('Failed to load resource'));
  rows.push({ name, status, ...state, errors: real });
  await page.screenshot({ path: `${SHOTS}/page-${name}.png`, clip: { x: 0, y: 0, width: 1280, height: 500 } }).catch(() => {});
}
await ctx.close();

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('page', 13) + pad('http', 6) + pad('revealed', 10) + pad('styled', 8) +
            pad('ctrls', 7) + pad('rows', 6) + pad('hscroll', 9) + 'errors');
console.log('-'.repeat(86));
let bad = 0;
for (const r of rows) {
  const revealed = !r.pending && r.visibility === 'visible';
  const styled = !r.bodyFont.toLowerCase().includes('verdana');
  if (!revealed || r.errors.length || r.overflow) bad++;
  console.log(
    pad(r.name, 13) + pad(r.status, 6) + pad(revealed ? 'yes' : 'NO', 10) +
    pad(styled ? 'yes' : 'NO', 8) + pad(r.controls, 7) + pad(r.rows, 6) +
    pad(r.overflow ? 'YES' : '-', 9) + (r.errors[0] || '')
  );
  for (const e of r.errors.slice(1)) console.log(' '.repeat(51) + e);
}
console.log(bad ? `\n${bad} page(s) need attention` : '\nall pages clean');

/*
 * Load the unpacked extension into a real Chrome and drive the palette control
 * on a live Hacker News page. Checks the parts the token harness cannot: that
 * the nav control is built, that clicking an option writes the attribute and
 * persists it, and that the choice survives a reload without a flash of classic.
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
const userDataDir = mkdtempSync(join(tmpdir(), 'hnes-'));

const ctx = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto('https://news.ycombinator.com/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

const shot = p => page.screenshot({ path: `${SHOTS}/${p}`, fullPage: false });

// 1. did the rewrite finish, and is the page actually visible?
const state = await page.evaluate(() => ({
  pending: document.documentElement.classList.contains('hnes-pending'),
  visible: getComputedStyle(document.body).visibility,
  toggles: [...document.querySelectorAll('.hnes-nav-toggle > a')].map(a => a.textContent),
  menuOptions: [...document.querySelectorAll('.hnes-nav-menu .nav-drop-down a')].map(a => a.textContent),
  rows: document.querySelectorAll('tr.athing').length,
}));
console.log('after load:', JSON.stringify(state, null, 2));
await shot('01-classic.png');

// 2. open the palette menu and pick ember
await page.click('.hnes-nav-menu > a');
await page.waitForTimeout(200);
const menuVisible = await page.isVisible('.hnes-nav-menu .nav-drop-down');
console.log('menu opens:', menuVisible);
await shot('02-menu-open.png');

await page.click('.hnes-nav-menu .nav-drop-down a:has-text("ember")');
await page.waitForTimeout(300);
const afterPick = await page.evaluate(() => ({
  attr: document.documentElement.getAttribute('data-hnes-palette'),
  label: document.querySelector('.hnes-nav-menu > a').textContent,
  menuOpen: getComputedStyle(document.querySelector('.hnes-nav-menu .nav-drop-down')).display,
  bg: getComputedStyle(document.body).backgroundColor,
}));
console.log('after picking ember:', JSON.stringify(afterPick));
await shot('03-ember.png');

// 3. does it survive a reload, and does boot.js apply it before the reveal?
await page.reload({ waitUntil: 'domcontentloaded' });
const early = await page.evaluate(() => ({
  attr: document.documentElement.getAttribute('data-hnes-palette'),
  pending: document.documentElement.classList.contains('hnes-pending'),
}));
await page.waitForTimeout(2000);
const late = await page.evaluate(() => ({
  attr: document.documentElement.getAttribute('data-hnes-palette'),
  label: document.querySelector('.hnes-nav-menu > a')?.textContent,
  bg: getComputedStyle(document.body).backgroundColor,
}));
console.log('right after reload:', JSON.stringify(early));
console.log('settled after reload:', JSON.stringify(late));
await shot('04-ember-reload.png');

// 4. palette x density are orthogonal: flow must not disturb the palette
await page.click('.hnes-nav-toggle:has-text("view") > a');
await page.click('.hnes-nav-toggle:has-text("view") > a');
await page.waitForTimeout(300);
console.log('palette x view:', JSON.stringify(await page.evaluate(() => ({
  palette: document.documentElement.getAttribute('data-hnes-palette'),
  density: document.documentElement.getAttribute('data-hnes-density'),
  bg: getComputedStyle(document.body).backgroundColor,
}))));
await shot('05-ember-flow.png');

// 5. a comment page, where the fade ladder and the spine live
await page.goto('https://news.ycombinator.com/item?id=' + (await page.evaluate(() =>
  document.querySelector('tr.athing')?.id) || '1'), { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(2500);
await shot('06-ember-comments.png');
console.log('comment page comments:', await page.evaluate(() => document.querySelectorAll('.comtr, tr.athing.comtr').length));

console.log('\npage errors:', errors.length ? errors : 'none');
await ctx.close();

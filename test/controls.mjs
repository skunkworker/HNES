/*
 * Load the unpacked extension into a real Chrome and drive the settings panel
 * on a live Hacker News page. Checks the parts the token harness cannot: that
 * the gear is built, that the panel draws every mode with its selection marked,
 * that picking an option writes the attribute and persists it, that the choice
 * survives a reload without a flash of classic, and that a second tab picks the
 * change up without being reloaded.
 */
import { chromium } from 'playwright';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SHOTS = join(ROOT, 'test', 'screenshots');

const EXT = ROOT;
const userDataDir = mkdtempSync(join(tmpdir(), 'hnes-'));

const ctx = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

const results = [];
const check = (name, ok, note = '') => results.push({ name, ok: !!ok, note });
// Hacker News rate-limits a driven browser readily. A 429 is not a pass and not
// a failure — it is a page this run never got to look at, and saying so is the
// same thing test/pages.mjs does with the sweep.
const skip = (name, note) => results.push({ name, ok: true, skipped: true, note });

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
// Script errors only: a failed request is HN's answer to being driven, and the
// checks below already treat a page that did not load as untested.
page.on('console', m => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) {
    errors.push('console: ' + m.text());
  }
});

await page.goto('https://news.ycombinator.com/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

const shot = p => page.screenshot({ path: `${SHOTS}/${p}`, fullPage: false });
// Storage is the last group, and the Sections group has a note of its own —
// so this has to name the group rather than take the first note in the panel.
const STORAGE_NOTE = '.hnes-settings > .hnes-settings-group:last-child .hnes-settings-note';
// Null-safe: a check that navigated away has no panel, and should report that
// rather than throw and take the rest of the run with it.
const panelDisplay = () => page.evaluate(() => {
  const panel = document.querySelector('.hnes-settings');
  return panel ? getComputedStyle(panel).display : 'missing';
});

// 1. did the rewrite finish, is the page visible, and is the gear the only
//    thing the settings now cost the nav?
const loaded = await page.evaluate(() => ({
  pending: document.documentElement.classList.contains('hnes-pending'),
  visible: getComputedStyle(document.body).visibility,
  gears: document.querySelectorAll('.hnes-settings-host > a').length,
  gearIcon: !!document.querySelector('.hnes-settings-host > a svg'),
  // The panel is built on first open, so nothing should exist yet.
  panels: document.querySelectorAll('.hnes-settings').length,
  rows: document.querySelectorAll('tr.athing').length,
}));
check('page revealed', !loaded.pending && loaded.visible === 'visible');
check('rows rewritten', loaded.rows > 10, `${loaded.rows} rows`);
check('one gear in the nav', loaded.gears === 1 && loaded.gearIcon);
check('panel is lazy', loaded.panels === 0);
await shot('01-classic.png');

// 2. open it: every mode drawn, exactly one option marked per mode, swatches
//    rendered from the palettes rather than from the page's current one
await page.click('.hnes-settings-host > a');
await page.waitForTimeout(200);
const opened = await page.evaluate(storageNote => {
  const panel = document.querySelector('.hnes-settings');
  const groups = [...panel.querySelectorAll('.hnes-settings-group')].map(g => ({
    label: g.querySelector('.hnes-settings-label').textContent,
    options: [...g.querySelectorAll('.hnes-settings-opt')].map(a => a.dataset.hnesOpt),
    marked: [...g.querySelectorAll('.hnes-settings-on')].map(a => a.dataset.hnesOpt),
  }));
  // The palette rows are the swatches: each paints itself in its own ground.
  const swatchBg = [...panel.querySelectorAll('.hnes-settings-swatches .hnes-settings-opt')]
    .map(s => getComputedStyle(s).backgroundColor);
  return {
    visible: getComputedStyle(panel).display,
    groups,
    swatchBg,
    keys: [...panel.querySelectorAll('.hnes-keys kbd')].map(k => k.textContent).join(''),
    note: document.querySelector(storageNote)?.textContent ?? '',
  };
}, STORAGE_NOTE);
check('panel opens', opened.visible !== 'none');
// Storage is a group without a stored setting behind it, and Reading holds two
// switches under one heading — both are shapes the panel only grew once it held
// more than three lists.
check('every group drawn',
  opened.groups.map(g => g.label).join(' ') ===
    'Theme View Palette Reading Keyboard Sections Storage',
  opened.groups.map(g => `${g.label}(${g.options.length})`).join(' '));
// A switch that is off has no row to mark, so a count is the assertion: two
// switches on under Reading, four sections chosen, nothing under Storage.
check('right number marked in each group',
  opened.groups.map(g => g.marked.length).join(',') === '1,1,1,2,1,4,0',
  opened.groups.map(g => `${g.label}:${g.marked.length}`).join(' '));
check('defaults marked',
  opened.groups.flatMap(g => g.marked).join(' ') ===
    'hnesTheme:auto hnesDensity:comfortable hnesPalette:classic ' +
    'hnesNewComments:on hnesHckrnews:on hnesKeys:on ' +
    'hnesNav:top hnesNav:new hnesNav:best hnesNav:submit',
  opened.groups.flatMap(g => g.marked).join(' '));
// The bindings were bound in hn.js and written down nowhere.
check('every binding listed', opened.keys === 'jkolpcbh', opened.keys);
check('storage reports a size', /^\d+(\.\d+)? (B|KB|MB) stored$/.test(opened.note), opened.note);
// Five palettes, five distinct grounds — a swatch inheriting the page's palette
// instead of carrying its own would collapse these to one value.
check('swatches show their own palette',
  new Set(opened.swatchBg).size === 5, opened.swatchBg.join(' '));
await shot('02-panel-open.png');

// 3. pick a palette: attribute written, mark moved, panel stays open
const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
await page.click('[data-hnes-opt="hnesPalette:ember"]');
await page.waitForTimeout(300);
const picked = await page.evaluate(() => ({
  attr: document.documentElement.getAttribute('data-hnes-palette'),
  marked: [...document.querySelectorAll('[data-hnes-opt^="hnesPalette:"].hnes-settings-on')]
    .map(a => a.dataset.hnesOpt),
  bg: getComputedStyle(document.body).backgroundColor,
}));
check('picking writes the attribute', picked.attr === 'ember', picked.attr);
check('mark follows the pick', picked.marked.join() === 'hnesPalette:ember', picked.marked.join());
check('panel stays open to pick again', await panelDisplay() !== 'none');
// The click-away handler is on the document, so the panel's own furniture has
// to stop the click — otherwise hitting a group heading closes it.
await page.locator('.hnes-settings .hnes-settings-label').first().click();
await page.waitForTimeout(150);
check('clicking panel furniture keeps it open', await panelDisplay() !== 'none');
check('page repaints', picked.bg !== before, `${before} -> ${picked.bg}`);
await shot('03-ember.png');

// 4. click away closes it. The target has to be hunted rather than guessed:
//    HNES moves the comment count and score into left gutter columns, so even
//    the page margin is a link, and following one would close the panel by
//    navigating rather than by the handler under test.
const before4 = page.url();
const spot = await page.evaluate(() => {
  const w = document.documentElement.clientWidth, h = window.innerHeight;
  for (let y = 120; y < h - 10; y += 12) {
    for (let x = 4; x < w - 4; x += 25) {
      const el = document.elementFromPoint(x, y);
      if (el && !el.closest('a') && !el.closest('.hnes-settings')) return { x, y, on: el.tagName };
    }
  }
  return null;
});
check('found somewhere inert to click', !!spot, spot ? `${spot.x},${spot.y} on ${spot.on}` : 'none');
await page.mouse.click(spot?.x ?? 4, spot?.y ?? 140);
await page.waitForTimeout(150);
check('click-away closes the panel',
  page.url() === before4 && await panelDisplay() === 'none',
  page.url() === before4 ? '' : 'navigated instead: ' + page.url());

// 5. a second tab hears the change without being reloaded — this is the
//    storage.onChanged path in boot.js, and it has no other coverage
const second = await ctx.newPage();
await second.goto('https://news.ycombinator.com/newest', { waitUntil: 'domcontentloaded' });
await second.waitForTimeout(2500);
await page.click('.hnes-settings-host > a');
await page.click('[data-hnes-opt="hnesPalette:slate"]');
await page.waitForTimeout(400);
const otherAttr = await second.evaluate(() =>
  document.documentElement.getAttribute('data-hnes-palette'));
check('a second tab follows without reloading', otherAttr === 'slate', otherAttr);

// And the other direction, with the panel *open* the whole time: the second tab
// writes, and this one's marks have to move without being reopened. This is the
// HNESModes.subscribe path, and nothing else exercises it.
await second.click('.hnes-settings-host > a');
await second.click('[data-hnes-opt="hnesPalette:newsprint"]');
await page.waitForTimeout(500);
check('an open panel follows another tab', await page.evaluate(() =>
  !!document.querySelector('[data-hnes-opt="hnesPalette:newsprint"].hnes-settings-on') &&
  !document.querySelector('[data-hnes-opt="hnesPalette:slate"].hnes-settings-on')));
await second.close();
// Panel is still open from the pick above, so this is a second pick in one
// visit rather than a fresh open — the case the mark refresh has to survive.
await page.click('[data-hnes-opt="hnesPalette:ember"]');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check('Escape closes the panel', await panelDisplay() === 'none');

// 6. does it survive a reload, and does boot.js apply it before the reveal?
//
// Watched rather than sampled. The point of applying in boot.js is that the
// attribute is set while the page is still hidden, so there is no frame of
// classic to see — and polling for `.hnes-pending` after the fact only catches
// that if the poll wins a race against the rewrite, which on a warm cache it
// does not. The observer records the palette at the instant the page is
// revealed, which is the property itself rather than a proxy for it.
await page.addInitScript(() => {
  window.__hnesAtReveal = null;
  // An init script runs before <html> exists, so the watcher may have to wait
  // for it. Both halves are needed: which one fires depends on how early Chrome
  // gets round to this relative to parsing.
  let sawPending = false;
  const watch = () => {
    const root = document.documentElement;
    if (!root) return false;
    const obs = new MutationObserver(() => {
      if (root.classList.contains('hnes-pending')) { sawPending = true; return; }
      // Only after it was hidden — otherwise a class change on <html> before
      // boot.js has run would be recorded as a reveal.
      if (!sawPending) return;
      window.__hnesAtReveal = root.getAttribute('data-hnes-palette') || 'unset';
      obs.disconnect();
    });
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });
    return true;
  };
  if (!watch()) {
    const pending = new MutationObserver(() => { if (watch()) pending.disconnect(); });
    pending.observe(document, { childList: true });
  }
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const late = await page.evaluate(() => ({
  attr: document.documentElement.getAttribute('data-hnes-palette'),
  atReveal: window.__hnesAtReveal,
}));
check('choice persists', late.attr === 'ember', late.attr);
check('applied before the reveal', late.atReveal === 'ember',
  `palette at reveal: ${late.atReveal ?? 'never revealed'}`);
await shot('04-ember-reload.png');

// 7. palette x view are orthogonal: flow must not disturb the palette
await page.click('.hnes-settings-host > a');
await page.click('[data-hnes-opt="hnesDensity:flow"]');
await page.waitForTimeout(300);
const both = await page.evaluate(() => ({
  palette: document.documentElement.getAttribute('data-hnes-palette'),
  density: document.documentElement.getAttribute('data-hnes-density'),
  marked: [...document.querySelectorAll('.hnes-settings-on')].map(a => a.dataset.hnesOpt),
}));
check('palette x view orthogonal', both.palette === 'ember' && both.density === 'flow',
  `${both.palette} / ${both.density}`);
check('both marks held at once',
  both.marked.slice(0, 3).join(' ') === 'hnesTheme:auto hnesDensity:flow hnesPalette:ember',
  both.marked.join(' '));
await shot('05-ember-flow.png');

// 8. the settings that change behaviour rather than paint. These are the ones
//    with no attribute on <html>: hn.js reads them and decides what to build or
//    bind, so the assertion is what the next load does, not what the row shows.
// A switch has one row, for values[0]; off is drawn as that row unmarked.
await page.click('[data-hnes-opt="hnesKeys:on"]');
await page.waitForTimeout(200);
check('a switch flips', await page.evaluate(() =>
  !document.querySelector('[data-hnes-opt="hnesKeys:on"].hnes-settings-on')));

// With shortcuts off, h must not reach the panel either — it is one of them.
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
await page.keyboard.press('h');
await page.waitForTimeout(200);
check('h is off with the shortcuts', await panelDisplay() === 'none');

await page.click('.hnes-settings-host > a');
await page.click('[data-hnes-opt="hnesKeys:on"]');   // back on
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
await page.keyboard.press('h');
await page.waitForTimeout(200);
check('h opens the panel', await panelDisplay() !== 'none');

// The typing guard: HN's own search box is on the same document, and this used
// to be one flag that only the search box set — every comment box was unguarded.
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
await page.locator('input[name="q"]').first().focus();
await page.keyboard.press('h');
await page.waitForTimeout(200);
check('typing is not navigation', await panelDisplay() === 'none');

// A section moved out of "more" is a header tab on the next load — this is the
// one setting that rebuilds markup rather than restyling it.
await page.click('.hnes-settings-host > a');
await page.click('[data-hnes-opt="hnesNav:ask"]');
await page.waitForTimeout(300);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const nav = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('.nav-links > span > a')].map(a => a.textContent),
  more: [...document.querySelectorAll('#nav-others a')].map(a => a.textContent),
}));
check('a chosen section is a header tab', nav.tabs.includes('ask'), nav.tabs.join(' '));
check('and has left the more menu', !nav.more.includes('ask'), nav.more.join(' '));
await shot('07-sections.png');

// The one store with no expiry, and the only place that can say how big it is.
await page.click('.hnes-settings-host > a');
await page.waitForTimeout(200);
await page.click('.hnes-settings-action');
await page.waitForTimeout(600);
const cleared = await page.evaluate(sel => document.querySelector(sel).textContent, STORAGE_NOTE);
check('clearing reports what it freed',
  /^\d+ cleared — \d+(\.\d+)? (B|KB|MB) left$/.test(cleared), cleared);
await page.keyboard.press('Escape');

// 9. a comment page, where the fade ladder and the spine live
await page.keyboard.press('Escape');
const id = await page.evaluate(() => document.querySelector('tr.athing')?.id);
const item = await page.goto('https://news.ycombinator.com/item?id=' + (id || '1'),
  { waitUntil: 'domcontentloaded' }).catch(() => null);
await page.waitForTimeout(2500);
if (!item || item.status() !== 200) {
  skip('gear on a comment page too', `HTTP ${item ? item.status() : 'no response'}`);
} else {
  const comments = await page.evaluate(() => ({
    count: document.querySelectorAll('tr.athing.comtr').length,
    gears: document.querySelectorAll('.hnes-settings-host > a').length,
  }));
  check('gear on a comment page too', comments.gears === 1, `${comments.count} comments`);
  await shot('06-ember-comments.png');
}

await ctx.close();

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('check', 42) + pad('result', 8) + 'note');
console.log('-'.repeat(84));
let failed = 0, skipped = 0;
for (const r of results) {
  if (!r.ok) failed++;
  if (r.skipped) skipped++;
  console.log(pad(r.name, 42) + pad(r.skipped ? 'skip' : r.ok ? 'ok' : 'FAIL', 8) + (r.note || '-'));
}
console.log('\npage errors:', errors.length ? errors : 'none');
console.log(failed || errors.length
  ? `\n${failed} of ${results.length} checks failed`
  : `\nall ${results.length - skipped} checks pass` + (skipped ? `, ${skipped} skipped` : ''));
process.exit(failed || errors.length ? 1 : 0);

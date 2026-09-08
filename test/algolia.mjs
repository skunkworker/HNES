/*
 * algolia.css against the live hn.algolia.com.
 *
 * The site's class names are plain, not hashed, so the whole sheet is a bet on
 * `.SearchHeader`, `.Story_title`, `.Pagination` and friends still being called
 * that. A rename ships silently — the page keeps working and the theme just
 * stops applying — so the point of this file is to fail loudly, by name, the
 * first time a class the sheet hooks is not on the page.
 *
 * No extension is loaded. The host permission for hn.algolia.com is optional
 * and granted from a native Chrome bubble that Playwright cannot answer, so the
 * sheets are injected by hand instead: tokens.css then algolia.css, then the
 * `hnes-algolia` class and the `data-hnes-*` attributes boot.js would have
 * written. That is exactly what the content scripts do, minus the grant.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join as pjoin } from 'path';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SHOTS = pjoin(ROOT, 'test', 'screenshots');

const CSS = ['tokens.css', 'algolia.css'].map(f => readFileSync(pjoin(ROOT, f), 'utf8')).join('\n');

const URL = 'https://hn.algolia.com/?q=rust';
const PALETTES = ['classic', 'newsprint', 'ember', 'slate', 'letterpress'];
const THEMES = ['light', 'dark'];

// Every class algolia.css hooks. Missing from the page => the site renamed it
// and the rules that mention it are dead.
const REQUIRED = [
  'SearchHeader', 'SearchHeader_search', 'SearchHeader_label', 'SearchHeader_settings',
  'SearchInput', 'SearchIcon', 'PoweredBy',
  'SearchFilters', 'SearchFilters_engineProcessingTime', 'Dropdown', 'Dropdown_label',
  'SearchResults', 'Story', 'Story_title', 'Story_link', 'Story_meta', 'Story_separator',
  'Pagination', 'Pagination_item', 'Pagination_item-current',
  'Footer', 'Footer_list',
];

const rgb = s => { const m = s.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number).join(',') : s; };

const browser = await chromium.launch({ channel: 'chromium' });
const rows = [];
const failures = [];
let missing = [];
let phoneShot = false;

for (const theme of THEMES) {
  const ctx = await browser.newContext({ colorScheme: theme, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 120)); });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('.Story', { timeout: 30000 });
  await page.addStyleTag({ content: CSS });

  for (const palette of PALETTES) {
    const before = errors.length;
    await page.evaluate(({ palette, theme }) => {
      const root = document.documentElement;
      root.classList.add('hnes-algolia');
      root.setAttribute('data-hnes-theme', theme);
      root.setAttribute('data-hnes-density', 'comfortable');
      // classic is the bare :root block; boot.js writes no attribute for it.
      if (palette === 'classic') root.removeAttribute('data-hnes-palette');
      else root.setAttribute('data-hnes-palette', palette);
    }, { palette, theme });
    // The site declares `transition: color .1s linear` on every <a>, and the
    // pager pill carries one of its own; a computed style read on the same tick
    // returns the animation's start value, not the token.
    await page.waitForTimeout(400);

    const r = await page.evaluate(({ required }) => {
      // Custom properties are substitution-only: getPropertyValue hands back
      // unresolved light-dark() text. A throwaway element that actually uses
      // one in `color` is what makes the browser resolve it.
      const probe = document.createElement('span');
      probe.style.display = 'none';
      document.body.appendChild(probe);
      const token = name => {
        probe.style.color = '';
        probe.style.color = `var(${name})`;
        return getComputedStyle(probe).color;
      };
      const tokenText = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

      const out = {
        missing: required.filter(c => !document.querySelector('.' + CSS.escape(c))),
        brand: token('--hnes-brand'),
        fg: token('--hnes-fg'),
        font: tokenText('--hnes-font'),
      };
      const header = document.querySelector('.SearchHeader');
      const title = document.querySelector('.Story_title a');
      const current = document.querySelector('.Pagination_item-current button');
      out.headerBg = header ? getComputedStyle(header).backgroundColor : null;
      out.titleColor = title ? getComputedStyle(title).color : null;
      out.currentBg = current ? getComputedStyle(current).backgroundColor : null;
      out.bodyFont = getComputedStyle(document.body).fontFamily;
      probe.remove();
      return out;
    }, { required: REQUIRED });

    if (r.missing.length) missing = [...new Set([...missing, ...r.missing])];

    const key = `${theme}/${palette}`;
    const checks = {
      header: r.headerBg && rgb(r.headerBg) === rgb(r.brand),
      title: r.titleColor && rgb(r.titleColor) === rgb(r.fg),
      // --hnes-font leads with -apple-system; Verdana is the site's own.
      font: !r.bodyFont.toLowerCase().includes('verdana') && r.bodyFont.startsWith(r.font.split(',')[0]),
      pager: r.currentBg && rgb(r.currentBg) === rgb(r.brand),
    };

    await page.setViewportSize({ width: 1280, height: 900 });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    await page.screenshot({ path: `${SHOTS}/algolia-${theme}-${palette}.png`, clip: { x: 0, y: 0, width: 1280, height: 620 } });

    await page.setViewportSize({ width: 375, height: 720 });
    const narrow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (!phoneShot) { await page.screenshot({ path: `${SHOTS}/algolia-phone.png` }); phoneShot = true; }
    await page.setViewportSize({ width: 1280, height: 900 });

    const errs = errors.slice(before);
    for (const [name, ok] of Object.entries(checks)) if (!ok) failures.push(`${key} ${name}`);
    if (wide) failures.push(`${key} overflow@1280`);
    if (narrow) failures.push(`${key} overflow@375`);
    for (const e of errs) failures.push(`${key} ${e}`);

    rows.push({ key, ...checks, wide, narrow, errs: errs.length });
  }
  await ctx.close();
}
await browser.close();

const pad = (s, n) => String(s).padEnd(n);
const yn = v => (v ? 'yes' : 'NO');

if (missing.length) {
  console.log('MISSING CLASSES — the site renamed these and algolia.css no longer reaches them:');
  for (const c of missing) console.log('  .' + c);
  console.log('');
  failures.push(`missing classes: ${missing.join(', ')}`);
}

console.log(pad('theme/palette', 22) + pad('header', 8) + pad('title', 7) + pad('font', 6) +
            pad('pager', 7) + pad('1280', 6) + pad('375', 6) + 'errors');
console.log('-'.repeat(72));
for (const r of rows) {
  console.log(pad(r.key, 22) + pad(yn(r.header), 8) + pad(yn(r.title), 7) + pad(yn(r.font), 6) +
              pad(yn(r.pager), 7) + pad(r.wide ? 'OVER' : '-', 6) + pad(r.narrow ? 'OVER' : '-', 6) +
              (r.errs || '-'));
}

console.log(failures.length
  ? `\n${failures.length} FAILURE(S)\n  ` + failures.join('\n  ')
  : `\nall ${rows.length} theme/palette combinations took the tokens; ${REQUIRED.length} classes present`);
process.exitCode = failures.length ? 1 : 0;

/*
 * Ask a real browser what the refactored tokens resolve to, and compare classic
 * against the literals the stylesheet shipped with. Offline arithmetic said the
 * split was lossless; this is the part that checks the browser agrees.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join as pjoin } from 'path';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SHOTS = pjoin(ROOT, 'test', 'screenshots');


// tokens.css first, exactly as the manifest loads it: style.css only consumes
// the vars, so injecting it alone would resolve nothing.
const CSS = ['tokens.css', 'style.css'].map(f => readFileSync(pjoin(ROOT, f), 'utf8')).join('\n');

// What these tokens were before the seed/derive split.
const BEFORE = {
  light: {
    '--hnes-surface-alt': '#eeeee4', '--hnes-surface-hi': '#e4e4d6',
    '--hnes-fg-subtle': '#95958c', '--hnes-link': '#1b1b19', '--hnes-visited': '#6a6a63',
    '--hnes-c5a': '#5a5a5a', '--hnes-c73': '#737373', '--hnes-c82': '#828282',
    '--hnes-c88': '#888888', '--hnes-c9c': '#9c9c9c', '--hnes-cae': '#aeaeae',
    '--hnes-cbe': '#bebebe', '--hnes-cce': '#cecece', '--hnes-cdd': '#dddddd',
    '--hnes-header-ink': 'rgba(255, 243, 233, 0.92)',
    '--hnes-header-ink-dim': 'rgba(255, 243, 233, 0.82)',
  },
  dark: {
    '--hnes-surface-alt': '#22221a', '--hnes-surface-hi': '#2b2b21',
    '--hnes-fg-subtle': '#6f6f66', '--hnes-link': '#ddddd2', '--hnes-visited': '#8d8d82',
    '--hnes-c5a': '#c6c6bc', '--hnes-c73': '#adada4', '--hnes-c82': '#9b9b92',
    '--hnes-c88': '#909087', '--hnes-c9c': '#81817a', '--hnes-cae': '#73736c',
    '--hnes-cbe': '#686861', '--hnes-cce': '#5c5c56', '--hnes-cdd': '#53534e',
    '--hnes-header-ink': 'rgba(255, 243, 233, 0.92)',
    '--hnes-header-ink-dim': 'rgba(255, 243, 233, 0.82)',
  },
};

const ALL = [
  '--hnes-bg','--hnes-surface','--hnes-surface-alt','--hnes-surface-hi',
  '--hnes-fg','--hnes-fg-muted','--hnes-fg-subtle','--hnes-link','--hnes-visited',
  '--hnes-border','--hnes-brand','--hnes-orange','--hnes-orange-ink',
  '--hnes-selection','--hnes-current',
  '--hnes-c00','--hnes-c5a','--hnes-c73','--hnes-c82','--hnes-c88',
  '--hnes-c9c','--hnes-cae','--hnes-cbe','--hnes-cce','--hnes-cdd',
  '--hnes-header-ink','--hnes-header-ink-dim',
];

const PALETTES = ['classic', 'newsprint', 'ember', 'slate', 'letterpress'];
const THEMES = ['light', 'dark'];

// --- colour helpers, on resolved rgb() strings ------------------------------
const parse = v => v;  // already {r,g,b,a} in 0..1, converted in-page
const hexParse = h => ({ r: parseInt(h.slice(1,3),16)/255, g: parseInt(h.slice(3,5),16)/255, b: parseInt(h.slice(5,7),16)/255, a: 1 });
const toLin = c => (c <= 0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4));
function oklab({r,g,b}) {
  const R=toLin(r),G=toLin(g),B=toLin(b);
  const l=Math.cbrt(0.4122214708*R+0.5363325363*G+0.0514459929*B);
  const m=Math.cbrt(0.2119034982*R+0.6806995451*G+0.1073969566*B);
  const s=Math.cbrt(0.0883024619*R+0.2817188376*G+0.6299787005*B);
  return [0.2104542553*l+0.7936177850*m-0.0040720468*s,
          1.9779984951*l-2.4285922050*m+0.4505937099*s,
          0.0259040371*l+0.7827717662*m-0.8086757660*s];
}
const dE = (a,b) => { const x=oklab(a), y=oklab(b); return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2]); };
const relLum = ({r,g,b}) => 0.2126*toLin(r)+0.7152*toLin(g)+0.0722*toLin(b);
const ratio = (a,b) => { const l1=relLum(a), l2=relLum(b); const [hi,lo]=l1>l2?[l1,l2]:[l2,l1]; return (hi+0.05)/(lo+0.05); };

const browser = await chromium.launch();
const results = {};

for (const theme of THEMES) {
  const ctx = await browser.newContext({ colorScheme: theme });
  const page = await ctx.newPage();
  await page.setContent('<!doctype html><html><body><div id=probe></div></body></html>');
  await page.addStyleTag({ content: CSS });

  for (const palette of PALETTES) {
    await page.evaluate(p => {
      const r = document.documentElement;
      if (p === 'classic') r.removeAttribute('data-hnes-palette');
      else r.setAttribute('data-hnes-palette', p);
    }, palette);

    // Two layers of indirection to get through. Custom properties are
    // substitution-only, so getPropertyValue hands back unresolved text — only
    // using one in a real property resolves light-dark() and color-mix(). And
    // the resolved value comes back as oklab()/color(srgb ...), so a canvas does
    // the final conversion to sRGB bytes rather than a regex guessing at units.
    results[`${palette}/${theme}`] = await page.evaluate(names => {
      const host = document.getElementById('probe');
      while (host.firstChild) host.removeChild(host.firstChild);

      const els = names.map(n => {
        const el = document.createElement('span');
        el.style.color = `var(${n})`;
        host.appendChild(el);
        return el;
      });

      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      const out = {};
      names.forEach((n, i) => {
        const resolved = getComputedStyle(els[i]).color;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = resolved;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        out[n] = { r: r / 255, g: g / 255, b: b / 255, a: a / 255, raw: resolved };
      });
      return out;
    }, ALL);
  }
  await ctx.close();
}
await browser.close();

// --- 1. did the refactor change classic? -----------------------------------
console.log('=== CLASSIC: derived vs the literals they replaced ===\n');
let worst = 0, worstName = '';
for (const theme of THEMES) {
  console.log(theme);
  for (const [tok, before] of Object.entries(BEFORE[theme])) {
    const after = results[`classic/${theme}`][tok];
    if (!after) { console.log(`  ${tok.padEnd(24)} MISSING`); continue; }
    const a = parse(after);
    const b = before.startsWith('#') ? hexParse(before) : parse(before);
    const d = dE(a, b);
    const alphaOff = Math.abs(a.a - b.a) > 0.005;
    if (d > worst) { worst = d; worstName = `${tok} (${theme})`; }
    const flag = alphaOff ? 'ALPHA' : d < 0.008 ? 'lossless' : d < 0.020 ? 'ok' : 'CHANGED';
    const hex = '#' + ['r','g','b'].map(k => Math.round(a[k]*255).toString(16).padStart(2,'0')).join('')
                + (a.a < 0.999 ? ` @${a.a.toFixed(2)}` : '');
    console.log(`  ${tok.padEnd(24)} ${before.padEnd(24)} -> ${hex.padEnd(16)} dE ${d.toFixed(4)}  ${flag}`);
  }
  console.log('');
}
console.log(`worst drift: ${worst.toFixed(4)} on ${worstName}\n`);

// --- 2. does every palette resolve, and is the ladder monotonic? ------------
console.log('=== LADDER MONOTONICITY (c00 -> cdd must fade toward bg) ===\n');
const LADDER = ['--hnes-c00','--hnes-c5a','--hnes-c73','--hnes-c82','--hnes-c88',
                '--hnes-c9c','--hnes-cae','--hnes-cbe','--hnes-cce','--hnes-cdd'];
for (const palette of PALETTES) {
  for (const theme of THEMES) {
    const r = results[`${palette}/${theme}`];
    const bg = parse(r['--hnes-bg']);
    const ratios = LADDER.map(t => ratio(parse(r[t]), bg));
    let ok = true;
    for (let i = 1; i < ratios.length; i++) if (ratios[i] > ratios[i-1] + 0.02) ok = false;
    console.log(`${(palette+'/'+theme).padEnd(22)} ${ratios.map(v=>v.toFixed(1).padStart(5)).join(' ')}  ${ok ? 'monotonic' : 'NOT MONOTONIC'}`);
  }
}

/*
 * --- 3. contrast, as the browser resolves it ------------------------------
 *
 * Each pair carries its own floor, because they are not all text. A pair judged
 * against the wrong floor is worse than no check: a harness that always prints
 * failures is one nobody reads, and a real regression hides in the noise.
 *
 * 4.5 is the WCAG AA floor for text below 18pt, which is everything HNES sets.
 * The two low floors are not exemptions granted to make the numbers work —
 * they are pairs that never carry words, so no text floor applies to them.
 */
console.log('\n=== CONTRAST, browser-resolved ===\n');
const HAIRLINE = 1.15;  // visible as a line at all, nothing more
const PAIRS = [
  ['fg / bg',            '--hnes-fg',         '--hnes-bg',      4.5, 'body text'],
  ['fg / surface',       '--hnes-fg',         '--hnes-surface', 4.5, 'body text on a card'],
  ['fg-muted / bg',      '--hnes-fg-muted',   '--hnes-bg',      4.5, 'subtext words, comment headers'],
  ['fg-muted / surface', '--hnes-fg-muted',   '--hnes-surface', 4.5, 'comment header on a card'],
  ['link / bg',          '--hnes-link',       '--hnes-bg',      4.5, 'story titles'],
  ['visited / surface',  '--hnes-visited',    '--hnes-surface', 4.5, 'visited titles'],
  ['orange / bg',        '--hnes-orange',     '--hnes-bg',      4.5, 'accent text'],
  ['orange-ink / brand', '--hnes-orange-ink', '--hnes-brand',   4.5, 'nav text on the header'],
  ['c5a / surface',      '--hnes-c5a',        '--hnes-surface', 4.5, 'least-faded comment'],
  // Not text. --hnes-fg-subtle is scoped to punctuation that carries no
  // information — "(" ")" "|" "[ ]" — and the border is a hairline. Both are
  // checked only for "still visible", see style.css.
  ['fg-subtle / bg',     '--hnes-fg-subtle',  '--hnes-bg',      HAIRLINE, 'punctuation only, not text'],
  ['border / bg',        '--hnes-border',     '--hnes-bg',      HAIRLINE, 'hairline rule, not text'],
];

const failures = [];
for (const palette of PALETTES) {
  console.log(palette);
  for (const [label, fg, bgTok, floor, why] of PAIRS) {
    const line = THEMES.map(theme => {
      const v = ratio(parse(results[`${palette}/${theme}`][fg]),
                      parse(results[`${palette}/${theme}`][bgTok]));
      const bad = v < floor;
      if (bad) failures.push(`${palette}/${theme} ${label} = ${v.toFixed(2)} (floor ${floor})`);
      return `${theme} ${v.toFixed(2).padStart(6)}${bad ? ' FAIL' : '     '}`;
    }).join('   ');
    console.log(`  ${label.padEnd(20)} ${line}  ${floor === HAIRLINE ? '' : 'AA'}  ${why}`);
  }
}
console.log(failures.length
  ? `\n${failures.length} FAILURES\n  ` + failures.join('\n  ')
  : `\nall ${PAIRS.length * PALETTES.length * THEMES.length} pair/palette/theme combinations meet their floor`);

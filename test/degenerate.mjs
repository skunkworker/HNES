/*
 * Degenerate-body tests. No network: every response is served by route
 * interception, so these are deterministic and immune to the rate limiting that
 * makes pages.mjs flaky.
 *
 * This is the shape of failure that matters most in this extension. HNES hides
 * the page at document_start and reveals it at the very end of the rewrite, so
 * anything that throws in between leaves the user on a blank Hacker News with
 * no clue why. The stylesheet's failsafe animation caps that at two seconds,
 * but two seconds of blank followed by a half-rewritten page is still a bug —
 * and the bodies that cause it are not exotic. A 429 while you are being rate
 * limited is a body with no form, and that is what broke /login.
 *
 * Each case asserts the extension leaves the page usable: revealed, and no
 * uncaught throw. It deliberately does NOT assert the rewrite succeeded —
 * against markup this broken, doing nothing is the correct outcome.
 */
import { chromium } from 'playwright';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const page404 = '<html><body>Unknown or expired link.</body></html>';
const rateLimited = '<html><body>Sorry, we\'re not able to serve your requests this quickly.</body></html>';
const emptyBody = '<html><body></body></html>';
const loginNoSubmit = '<html><body><b>Login</b><form action="login" method="post">' +
  '<input type="hidden" name="goto" value="news"><table><tr><td>username:</td>' +
  '<td><input type="text" name="acct"></td></tr></table></form></body></html>';
const loginOk = '<html><body><b>Login</b><form action="login" method="post">' +
  '<table><tr><td>username:</td><td><input type="text" name="acct"></td></tr></table>' +
  '<input type="submit" value="login"></form></body></html>';

/*
 * `redirects` marks the one case where leaving the page is the correct answer:
 * on an expired link HNES sets a flag and location.replace("/")s to the front
 * page, so the execution context is expected to be torn down.
 */
const CASES = [
  ['front: rate-limited body',   'https://news.ycombinator.com/',      rateLimited,   429],
  ['front: empty body',          'https://news.ycombinator.com/',      emptyBody,     200],
  ['item: expired link',         'https://news.ycombinator.com/item?id=1', page404,   200, true],
  ['login: rate-limited body',   'https://news.ycombinator.com/login', rateLimited,   429],
  ['login: form with no submit', 'https://news.ycombinator.com/login', loginNoSubmit, 200],
  ['login: well-formed',         'https://news.ycombinator.com/login', loginOk,       200],
  ['user: empty body',           'https://news.ycombinator.com/user?id=x', emptyBody, 200],
  ['threads: rate-limited body', 'https://news.ycombinator.com/threads?id=x', rateLimited, 429],
];

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'hnes-')), {
  channel: 'chromium',
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
});
const page = await ctx.newPage();

const results = [];
for (const [name, url, body, status, redirects] of CASES) {
  const errors = [];
  const onErr = e => errors.push(String(e).split('\n')[0]);
  page.on('pageerror', onErr);

  // Reset between cases: several cases reuse the same URL, and renavigating to
  // the current one races the evaluate below against the teardown.
  await page.goto('about:blank').catch(() => {});

  await page.route('**://news.ycombinator.com/**', r =>
    r.fulfill({ status, contentType: 'text/html; charset=utf-8', body }));

  // 'commit' rather than 'domcontentloaded': with a fulfilled route and the
  // extension attached, waiting for DOMContentLoaded hangs indefinitely. The
  // explicit timeout is deliberate — a harness that can hang forever is worse
  // than one that fails.
  await page.goto(url, { waitUntil: 'commit', timeout: 15000 })
            .catch(e => errors.push('goto: ' + e.message.split('\n')[0]));

  // Sample before the 2s failsafe: the point is that hn.js revealed the page
  // itself, not that the stylesheet bailed it out.
  await page.waitForTimeout(1200);
  let state = { pending: true, vis: 'hidden' };
  try {
    state = await page.evaluate(() => ({
      pending: document.documentElement.classList.contains('hnes-pending'),
      vis: document.body ? getComputedStyle(document.body).visibility : 'no-body',
    }));
  } catch (e) {
    errors.push('probe: ' + e.message.split('\n')[0]);
  }

  const landed = page.url();
  await page.unroute('**://news.ycombinator.com/**');
  page.off('pageerror', onErr);

  let revealedEarly, note = '';
  if (redirects) {
    // Success here is having left for the front page, not having revealed.
    revealedEarly = landed === 'https://news.ycombinator.com/';
    note = 'redirected to ' + landed;
    // The teardown that redirecting causes is expected, not a failure.
    const i = errors.findIndex(e => e.startsWith('probe:'));
    if (i >= 0) errors.splice(i, 1);
  } else {
    revealedEarly = !state.pending && state.vis === 'visible';
  }
  results.push({ name, revealedEarly, errors, note });
}
await ctx.close();

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('case', 30) + pad('handled <2s', 15) + 'uncaught error / note');
console.log('-'.repeat(78));
let failed = 0;
for (const r of results) {
  const ok = r.revealedEarly && r.errors.length === 0;
  if (!ok) failed++;
  console.log(pad(r.name, 30) + pad(r.revealedEarly ? 'yes' : 'NO', 15) + (r.errors[0] || r.note || '-'));
}
console.log(failed
  ? `\n${failed} of ${results.length} degenerate bodies leave the page broken`
  : `\nall ${results.length} degenerate bodies leave the page usable`);
process.exit(failed ? 1 : 0);

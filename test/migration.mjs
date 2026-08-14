/*
 * End-to-end test of the MV2 -> MV3 storage migration — the one step that
 * cannot be redone once a user updates.
 *
 * Chrome will not load an MV2 extension any more, so the MV2 half is simulated
 * where it actually matters: the legacy data lived in localStorage on the
 * extension origin, and that origin is unchanged across the upgrade. Seeding it
 * from an extension page is the same starting state the real upgrade sees.
 *
 * The upgrade itself is real: the version in the manifest is bumped between two
 * launches of the same profile, so Chrome fires onInstalled({reason:'update'}),
 * which is exactly the trigger the shipping code hangs off.
 */
import { chromium } from 'playwright';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname, join as pjoin } from 'path';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SHOTS = pjoin(ROOT, 'test', 'screenshots');


const SRC = ROOT;
// Outside the repo, not test/.migtest: the copy has to bump the manifest version
// between two launches, and cpSync refuses a destination inside its own source.
const WORK = pjoin(mkdtempSync(join(tmpdir(), 'hnes-work-')), 'HNES');
const PROFILE = mkdtempSync(join(tmpdir(), 'hnes-mig-'));

rmSync(WORK, { recursive: true, force: true });
cpSync(SRC, WORK, { recursive: true, filter: s => !s.includes('/.git') && !s.includes('/proposals') });

const manifestPath = join(WORK, 'manifest.json');
const setVersion = v => {
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  m.version = v;
  writeFileSync(manifestPath, JSON.stringify(m, null, 2));
};

const launch = () => chromium.launchPersistentContext(PROFILE, {
  channel: 'chromium',
  args: [`--disable-extensions-except=${WORK}`, `--load-extension=${WORK}`],
});

async function extensionPage(ctx) {
  // The service worker's URL carries the extension id.
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const id = new URL(sw.url()).host;
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${id}/offscreen.html`);
  return { page, id };
}

// What an MV2 user's localStorage actually looks like: everything is a string,
// vote counts in both the legacy bare-number form and the later object form,
// thread read-state with an expire stamp, and the odd bare flag.
const NOW = Date.now();
const LEGACY = {
  'etcet':        '1',                                              // legacy bare number
  'pg':           '7',                                              // legacy bare number
  'dang':         '{"votes":3,"tag":"moderator"}',                  // already migrated shape
  'patio11':      '{"votes":12}',
  '49274600':     JSON.stringify({ id: 49274600, num: 120, expire: NOW + 5 * 864e5 }),
  '11111111':     JSON.stringify({ id: 11111111, num: 8,  expire: NOW - 864e5 }),  // stale
  'update_profile': 'false',
  'expired':      'true',
};

console.log('=== launch 1: fresh install, seed the legacy store ===');
let ctx = await launch();
let { page } = await extensionPage(ctx);

// Let the fresh-install migration finish and claim the flag, then put the
// profile back into the state a real pre-upgrade user is in.
await page.waitForTimeout(1500);
await page.evaluate(async legacy => {
  for (const [k, v] of Object.entries(legacy)) localStorage.setItem(k, v);
  await chrome.storage.local.clear();
  // A key the v2 build already owns: the migration must not clobber it.
  await chrome.storage.local.set({ 'dang': '{"votes":99,"tag":"DO NOT CLOBBER"}' });
}, LEGACY);

const seeded = await page.evaluate(() => ({
  local: Object.keys(localStorage).length,
  sync: Object.keys(localStorage).sort(),
}));
console.log('seeded localStorage keys:', seeded.local, seeded.sync.join(', '));
await ctx.close();

console.log('\n=== launch 2: version bump -> onInstalled(update) -> migration ===');
setVersion('2.0.1');
ctx = await launch();
({ page } = await extensionPage(ctx));
await page.waitForTimeout(3000);

const after = await page.evaluate(async () => {
  const all = await chrome.storage.local.get(null);
  return { all, localStorageStillThere: Object.keys(localStorage).length };
});
await ctx.close();

// ---- assertions ----------------------------------------------------------
const a = after.all;
const checks = [
  ['migration flag set',            a.hnesMigratedFromLocalStorage === true],
  ['legacy "1" -> {"votes":1}',     a.etcet === '{"votes":1}'],
  ['legacy "7" -> {"votes":7}',     a.pg === '{"votes":7}'],
  ['object form untouched',         a.patio11 === '{"votes":12}'],
  ['existing key NOT clobbered',    a.dang === '{"votes":99,"tag":"DO NOT CLOBBER"}'],
  ['live thread read-state kept',   !!a['49274600'] && JSON.parse(a['49274600']).num === 120],
  ['stale entry swept',             a['11111111'] === undefined],
  ['string flag preserved',         a.update_profile === 'false'],
  ['"true" not eaten as a number',  a.expired === 'true'],
  ['localStorage left intact',      after.localStorageStillThere > 0],
];

console.log('');
let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
console.log('\nmigrated store:', JSON.stringify(a, null, 2));
console.log(failed ? `\n${failed} FAILED` : '\nall migration checks passed');

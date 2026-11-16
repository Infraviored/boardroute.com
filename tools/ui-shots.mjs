// UI screenshots of every state of the app, desktop + phone, for a UI/UX audit in one run.
//
//   node tools/ui-shots.mjs [--url http://localhost:4992] [--out ui-shots] [--only <substring>]
//                           [--device desktop|mobile|all]
//
// Needs a running site: `npm run build && npm run preview -- --port 4992` (the static pages under
// /how-it-works/, /parts/, /privacy/ exist only in a build), or any deployed URL.
// Playwright is NOT a dependency of this repo: playwright-core and a headless Chrome are taken from
// the paths below (override with PLAYWRIGHT_CORE / CHROME_PATH).
//
// Output: <out>/<device>/<NN>-<scenario>[-<part>].png and <out>/index.md (what each file shows,
// which scenarios failed). A failing scenario is logged and skipped; the run goes on.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeShare } from '../src/engine/share.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAYWRIGHT_CORE = process.env.PLAYWRIGHT_CORE || '/home/flo/repos/claude-code-voice/node_modules/playwright-core';
const CHROME_PATH = process.env.CHROME_PATH
  || path.join(homedir(), '.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell');
const { chromium } = createRequire(import.meta.url)(PLAYWRIGHT_CORE);

// ---------- arguments ----------
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(name); return i < 0 ? def : argv[i + 1]; };
const BASE = opt('--url', 'http://localhost:4992').replace(/\/$/, '');
const OUT = path.resolve(ROOT, opt('--out', 'ui-shots'));
const ONLY = opt('--only', '');
const DEVICE = opt('--device', 'all');
if (!['desktop', 'mobile', 'all'].includes(DEVICE)) { console.error('--device must be desktop, mobile or all'); process.exit(2); }

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const SOLVER_CAP_MS = 25000;

// ---------- test data ----------
const examples = JSON.parse(readFileSync(path.join(ROOT, 'public/examples.json'), 'utf8'));
const EXAMPLE_ID = 'relay-driver';
const ex = examples.find(e => e.id === EXAMPLE_ID) || examples[0];
// a finished, wired layout as a share link: loads instantly, no solver run needed
const WIRED_HASH = '#b=' + await encodeShare(ex.preview.components, ex.preview.wires);
// a hard example: Wire / Compact take long enough to catch the processing bar mid-run
const HARD = examples.find(e => e.id === 'caps-k5') || ex;
const EMPTY_BOARD = JSON.stringify({ components: [], wires: [], cols: 30, rows: 20 });
const STANDIN_CIRCUIT = {
  parts: { U1: 'Wemos D1 Mini', R1: 'resistor, 220', X1: 'ZX-9000 flux capacitor (VIN, GND, SIG)' },
  connections: [['U1.5V', 'X1.VIN'], ['U1.GND', 'X1.GND'], ['U1.D5', 'R1.1'], ['R1.2', 'X1.SIG']],
};
const STANDIN_HASH = '#circuit=' + encodeURIComponent(JSON.stringify(STANDIN_CIRCUIT));
const CIRCUIT_LINK_HASH = '#circuit=' + encodeURIComponent(JSON.stringify(HARD.circuit)); // long-running on purpose
const PHOTO = path.join(ROOT, 'public/og-image.png');

// ---------- helpers ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isMob = (page) => page.viewportSize().width <= 768 || page.viewportSize().height <= 500;

async function open(page, hash = '', search = '') {
  await page.goto(`${BASE}/${search}${hash}`, { waitUntil: 'load' });
  await page.waitForSelector('#topbar', { timeout: 15000 });
  await settle(page);
}
async function settle(page, ms = 700) {
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await sleep(ms);
}
const visible = (page, sel) => page.locator(sel).first().isVisible().catch(() => false);

// Phone: Parts and Inspector live in side drawers. Desktop: nothing to do.
async function openDrawer(page, which /* 'parts' | 'inspector' */) {
  if (!isMob(page)) return;
  await page.locator(`button[aria-label="Open ${which}"]`).first().click();
  await sleep(600);
}
async function closeDrawer(page) {
  if (!isMob(page)) return;
  const b = page.locator('.mobile-open .mobile-sheet-close').first();
  if (await b.count()) { await b.click(); await sleep(400); }
}
// topbar action on desktop, entry of the ⋮ sheet on the phone
async function topAction(page, desktopSel, sheetText) {
  if (isMob(page)) {
    await page.locator('.mobile-more-btn').click();
    await page.locator('.mobile-action-sheet').waitFor();
    await sleep(300);
    await page.locator('.mas-btn', { hasText: sheetText }).first().click();
  } else {
    await page.locator(desktopSel).first().click();
  }
  await sleep(500);
}
async function closeOverlay(page) {
  await page.keyboard.press('Escape');
  await sleep(300);
  if (await visible(page, '.overlay-bg')) {
    const x = page.locator('.overlay-bg .close-btn, .overlay-bg [aria-label^="Close"]').first();
    if (await x.count()) await x.click();
    await sleep(300);
  }
}
async function loadWired(page) { await open(page, WIRED_HASH); await page.waitForSelector('.comp-card, .pcb-comp', { state: 'attached', timeout: 10000 }); await settle(page, 1200); }
async function loadExampleViaUrl(page, id = EXAMPLE_ID) { await open(page, '', `?example=${id}`); await page.waitForSelector('.pcb-comp', { state: 'attached', timeout: 10000 }); await settle(page, 1200); }
async function seedEmpty(ctx) {
  await ctx.addInitScript((v) => { if (!localStorage.getItem('pcb_board_state')) localStorage.setItem('pcb_board_state', v); }, EMPTY_BOARD);
}
async function flow(page, name) { await page.locator('.flow-btn', { hasText: name }).click(); }
async function waitResultCard(page, ms = SOLVER_CAP_MS) {
  await page.waitForSelector('.result-card', { timeout: ms });
  await settle(page, 900);
}
// run Compact; if the search is still going after the cap, take its best so far
async function compactAndWait(page) {
  await flow(page, 'Compact');
  const t0 = Date.now();
  while (Date.now() - t0 < SOLVER_CAP_MS) {
    if (await visible(page, '.result-card.is-compact')) break;
    await sleep(500);
  }
  if (!(await visible(page, '.result-card.is-compact'))) {
    const apply = page.locator('.pb-btn-glass', { hasText: 'Apply current best' }).first();
    if (await apply.isEnabled().catch(() => false)) await apply.click();
    await page.waitForSelector('.result-card', { timeout: 8000 }).catch(() => {});
  }
  await settle(page, 1200);
}

// ---------- scenarios ----------
// shot(part?, description): one PNG. fn(page, ctx, shot)
const S = [];
const scenario = (name, devices, fn) => S.push({ name, devices, fn });
const BOTH = ['desktop', 'mobile'];

scenario('first-visit', BOTH, async (page, ctx, shot) => {
  await open(page);
  await page.waitForSelector('.examples-modal');
  await settle(page, 900);
  await shot('', 'Fresh first visit: the "Pick a circuit to start with" examples dialog over an empty board.');
});
scenario('first-visit-skipped', BOTH, async (page, ctx, shot) => {
  await open(page);
  await page.locator('.examples-modal .tplbtn', { hasText: 'Skip' }).click();
  await settle(page, 1200);
  await shot('', 'First visit, examples dialog skipped: the default template circuit loaded, unconnected, step "Load" done.');
});
scenario('empty-board', BOTH, async (page, ctx, shot) => {
  await seedEmpty(ctx);
  await open(page);
  await shot('', 'Returning visitor with an empty board: no parts, empty parts list, nothing to wire.');
});
scenario('example-unconnected', BOTH, async (page, ctx, shot) => {
  await loadExampleViaUrl(page);
  await shot('', `Example "${ex.title}" loaded via /?example=: parts placed, no wires yet, Wire is the highlighted next step.`);
  await openDrawer(page, 'parts');
  if (isMob(page)) await shot('parts-drawer', 'Same state, the Parts & Circuit drawer open (circuit card, parts list).');
});
scenario('json-editor', BOTH, async (page, ctx, shot) => {
  await loadExampleViaUrl(page);
  await openDrawer(page, 'parts');
  await page.locator('.cc-btn.wide').first().click();
  await page.waitForSelector('.json-drawer');
  await settle(page, 600);
  await shot('', 'The circuit JSON editor drawer open with the example circuit (valid JSON status line).');
  await page.locator('.jd-text').fill('{ "parts": [ { "id": "R1", ');
  await sleep(500);
  await shot('error', 'JSON editor with broken JSON: error status line, Load circuit disabled or erroring.');
});
scenario('after-wire', BOTH, async (page, ctx, shot) => {
  await loadExampleViaUrl(page);
  await flow(page, 'Wire');
  await sleep(2500);
  await shot('running', 'Wire running: processing bar with progress and the best-so-far preview.');
  await waitResultCard(page);
  await shot('', 'After Wire: every net connected, result card "Wired" with Compact / Share / Export actions.');
  const card = page.locator('.result-card').first();
  if (await card.isVisible()) await card.screenshot({ path: ctx.file('card'), animations: 'disabled' }), ctx.record('card', 'Close-up of the result card after Wire.');
});
scenario('after-compact', BOTH, async (page, ctx, shot) => {
  await loadExampleViaUrl(page, HARD.id);
  await flow(page, 'Wire');
  await waitResultCard(page);
  await flow(page, 'Compact');
  await sleep(3000);
  await shot('running', 'Compact running on the hard puzzle example (ten capacitors): processing bar (progress = time since last improvement), live view of the search.');
  // finish: wait for the result card of the compact run, else apply the best so far
  const t0 = Date.now();
  while (Date.now() - t0 < SOLVER_CAP_MS && !(await visible(page, '.result-card.is-compact'))) await sleep(500);
  if (!(await visible(page, '.result-card.is-compact'))) {
    const apply = page.locator('.pb-btn-glass', { hasText: 'Apply current best' }).first();
    if (await apply.isEnabled().catch(() => false)) await apply.click();
    await page.waitForSelector('.result-card', { timeout: 8000 }).catch(() => {});
  }
  await settle(page, 1200);
  await shot('', 'After Compact: smaller board, result card "Compacted"/"Perfect" with before/after delta.');
  const card = page.locator('.result-card').first();
  if (await card.isVisible()) await card.screenshot({ path: ctx.file('card'), animations: 'disabled' }), ctx.record('card', 'Close-up of the result card after Compact.');
});
scenario('part-selected', BOTH, async (page, ctx, shot) => {
  await loadWired(page);
  await openDrawer(page, 'parts');
  await page.locator('.comp-card').nth(1).click();
  await sleep(500);
  if (isMob(page)) await closeDrawer(page);
  await shot('board', 'A part selected: highlighted on the board (part action bar / rim).');
  await openDrawer(page, 'inspector');
  await shot('inspector', 'Inspector with the selected part: id, name, value, origin, pin list with nets, stats, board-size row.');
});
scenario('net-selected', BOTH, async (page, ctx, shot) => {
  await loadWired(page);
  await openDrawer(page, 'inspector');
  if (!(await visible(page, '.net-row'))) await page.locator('.rs-head').nth(1).click();
  await page.locator('.net-row').first().click();
  await sleep(400);
  await shot('inspector', 'Inspector with the Nets list, one net marked.');
  await closeDrawer(page);
  await shot('board', 'The marked net highlighted on the board.');
});
scenario('hole-coordinates', BOTH, async (page, ctx, shot) => {
  await loadWired(page);
  await page.keyboard.press('h');
  await sleep(600);
  await shot('', 'Hole coordinates on (key H): column letters / row numbers around the board.');
});
scenario('solder-side', BOTH, async (page, ctx, shot) => {
  await loadWired(page);
  await page.keyboard.press('b');
  await sleep(1200);
  await shot('', 'Solder side (key B): board mirrored, wires drawn on the underside.');
});
scenario('overlay-examples', BOTH, async (page, ctx, shot) => {
  await loadWired(page);
  await openDrawer(page, 'parts');
  await page.locator('.cc-btn', { hasText: 'Examples' }).click();
  await page.waitForSelector('.examples-modal');
  await settle(page, 900);
  await shot('', 'Examples dialog opened from the Circuit card ("Example circuits", cards with a preview of the best layout).');
});
scenario('overlay-library', BOTH, async (page, ctx, shot) => {
  await loadWired(page);
  await openDrawer(page, 'parts');
  await page.locator('.tplbtn', { hasText: 'Library' }).click();
  await page.waitForSelector('.lib-modal');
  await page.waitForFunction(() => !document.querySelector('.lib-count')?.textContent.includes('loading'), null, { timeout: 15000 });
  await settle(page, 700);
  await shot('curated', 'Component library, category All: curated parts first (thumbnails, pins, body), category chips with counts.');
  await page.locator('.lib-list').evaluate(el => { el.scrollTop = el.scrollHeight * 0.6; });
  await sleep(500);
  await shot('scrolled', 'Library scrolled down into the KiCad-generated footprints.');
  const cat = page.locator('.lib-cat').nth(3);
  await cat.click();
  await sleep(500);
  await shot('category', 'Library filtered to one category chip.');
  await page.locator('.lib-cat').first().click();
  await page.locator('.lib-search input').fill('esp32');
  await sleep(600);
  await shot('search', 'Library search "esp32": ranked results.');
  await page.locator('.lib-search input').fill('zzzzqq');
  await sleep(400);
  await shot('no-results', 'Library search without any result.');
});
scenario('overlay-editor', BOTH, async (page, ctx, shot) => {
  // a part with many pins (ESP32), so the pin list actually overflows and can be scrolled
  await open(page, '', '?example=esp32-io-panel');
  await page.waitForSelector('.pcb-comp', { state: 'attached', timeout: 10000 });
  await settle(page, 1000);
  await openDrawer(page, 'parts');
  const big = await page.locator('.comp-card').evaluateAll(cs => cs.map((c, i) => [i, parseInt(c.querySelector('.comp-pins-tag')?.textContent) || 0]).sort((x, y) => y[1] - x[1])[0][0]);
  await page.locator('.comp-card .edit-mini-btn').nth(big).click();
  await page.waitForSelector('.ce-modal');
  await settle(page, 900);
  await shot('', 'Component editor for an existing part: footprint grid, pin list, body, cable side, photo buttons, Save/Cancel.');
  // desktop: the side panel (and its pin list) scrolls; phone: the whole body
  await page.locator('.ce-modal').evaluate(el => { for (const n of el.querySelectorAll('.ce-body, .ce-side, .ce-pin-list')) n.scrollTop = n.scrollHeight; });
  await sleep(400);
  await shot('scrolled', 'Component editor scrolled to its lower part.');
});
scenario('library-add-editor', BOTH, async (page, ctx, shot) => {
  await loadWired(page);
  await openDrawer(page, 'parts');
  await page.locator('.tplbtn', { hasText: 'Library' }).click();
  await page.waitForSelector('.lib-item');
  await settle(page, 600);
  await page.locator('.lib-item').first().click();
  await page.waitForSelector('.ce-modal');
  await settle(page, 800);
  await shot('', 'A library part picked: the component editor in "add" mode (Back to library / Add to circuit).');
});
scenario('overlay-new-part', BOTH, async (page, ctx, shot) => {
  await loadWired(page);
  await openDrawer(page, 'parts');
  await page.locator('.tplbtn', { hasText: 'New' }).click();
  await page.waitForSelector('.ce-modal');
  await settle(page, 800);
  await shot('', 'Draw a new part: the component editor started empty.');
});
scenario('overlay-photo', BOTH, async (page, ctx, shot) => {
  await loadWired(page);
  await openDrawer(page, 'parts');
  await page.locator('.edit-mini-btn').first().click();
  await page.waitForSelector('.ce-modal');
  await page.locator('.ce-photo-fp').click();
  await page.waitForSelector('.pf-modal');
  await settle(page, 700);
  await shot('pick', 'Footprint from a photo, step 0: choose / paste / URL for the photo.');
  await page.locator('.pf-modal input[type=file]').setInputFiles(PHOTO);
  await page.waitForSelector('.pf-modal .ce-btn.primary:has-text("Next")', { timeout: 15000 });
  await settle(page, 1200);
  await shot('frame', 'Footprint from a photo, step 1 Frame: photo with the movable frame, turn handle and slider.');
  await page.locator('.pf-modal .ce-btn.primary', { hasText: 'Next' }).click();
  await settle(page, 1500);
  await shot('pins', 'Footprint from a photo, step 2 Pins: measure the pin row, grid over the photo, align / OCR / picture options.');
});
scenario('overlay-export', BOTH, async (page, ctx, shot) => {
  await loadWired(page);
  await topAction(page, '.export-btn', 'Export');
  await page.waitForSelector('.export-modal');
  await settle(page, 1200);
  await shot('', 'Export dialog: SVG/PNG preview of the board, options (size, pictures, actual size), project file, share link, Download / Print.');
});
scenario('overlay-prompt', BOTH, async (page, ctx, shot) => {
  await loadWired(page);
  await openDrawer(page, 'parts');
  await page.locator('.cc-btn.blu').click();
  await page.waitForSelector('.prompt-modal-shell');
  await settle(page, 700);
  await shot('', '"Get it from your AI" dialog: the prompt text to copy and the Copy button.');
});
scenario('overlay-account', BOTH, async (page, ctx, shot) => {
  await loadWired(page);
  await topAction(page, '.account-btn', 'Sign in');
  await page.waitForSelector('.acc-modal');
  await settle(page, 700);
  await shot('signin', 'Account dialog "Save & share" (not signed in): email field and Send link.');
  await page.locator('.acc-input').fill('florian@example.com');
  await page.locator('.acc-signin button[type=submit]').click();
  await sleep(1200);
  await shot('after-send', 'Account dialog after Send link, without a mail API behind it (the error or "link sent" state the visitor gets).');
});
scenario('overlay-account-signed-in', BOTH, async (page, ctx, shot) => {
  await page.route('**/api/me', r => r.request().method() === 'GET'
    ? r.fulfill({ json: { email: 'florian@example.com' } }) : r.fallback());
  await page.route('**/api/circuits', r => r.request().method() === 'GET'
    ? r.fulfill({ json: { circuits: [
      { id: 1, name: 'ESP32 door opener', updated: Date.now() - 3600e3, share: null },
      { id: 2, name: '555 blinker, v2', updated: Date.now() - 86400e3 * 3, share: 'abc123xyz' },
      { id: 3, name: 'Relay board', updated: Date.now() - 86400e3 * 30, share: null },
    ] } }) : r.fallback());
  await loadWired(page);
  await sleep(500);
  await topAction(page, '.account-btn', 'My circuits');
  await page.waitForSelector('.acc-modal');
  await settle(page, 900);
  await shot('', 'Account dialog "My circuits" signed in (mocked API): save field, list with Share / Link / Delete.');
});
scenario('confirm-delete-part', BOTH, async (page, ctx, shot) => {
  await loadWired(page);
  await openDrawer(page, 'parts');
  await page.locator('.comp-card').nth(1).click();
  await sleep(400);
  if (isMob(page)) await closeDrawer(page);
  if (isMob(page)) await openDrawer(page, 'inspector');
  await page.locator(isMob(page) ? '#rsb .part-actions button.danger' : '.part-actions button.danger:visible').first().click();
  await page.waitForSelector('.confirm-modal-shell');
  await settle(page, 500);
  await shot('', 'Confirm dialog for removing the selected part.');
});
scenario('confirm-reset', BOTH, async (page, ctx, shot) => {
  await loadWired(page);
  await topAction(page, '.reset-btn', 'Reset');
  await page.waitForSelector('.confirm-modal-shell');
  await settle(page, 500);
  await shot('', 'Confirm dialog for Reset Project.');
});
scenario('mobile-action-sheet', ['mobile'], async (page, ctx, shot) => {
  await loadWired(page);
  await page.locator('.mobile-more-btn').click();
  await page.waitForSelector('.mobile-action-sheet');
  await settle(page, 700);
  await shot('', 'Phone action sheet (the ⋮ menu): Sign in, Share, Export, Undo, Redo, Re-route, Clear wires, How it works, Reset.');
});
scenario('mobile-drawers', ['mobile'], async (page, ctx, shot) => {
  await loadWired(page);
  await openDrawer(page, 'parts');
  await shot('parts', 'Phone: Parts & Circuit drawer on a wired board.');
  await closeDrawer(page);
  await openDrawer(page, 'inspector');
  await shot('inspector', 'Phone: Inspector & stats drawer, no part selected.');
});
scenario('share-link-loaded', BOTH, async (page, ctx, shot) => {
  await open(page, WIRED_HASH);
  await settle(page, 1500);
  await shot('', 'Opened from a share link (#b=…): the wired layout appears at once, address hash cleaned, no first-visit dialog.');
});
scenario('share-link-broken', BOTH, async (page, ctx, shot) => {
  await open(page, '#b=1dnot-a-real-link');
  await settle(page, 1200);
  await shot('', 'A damaged share link: error notice "This share link could not be opened".');
});
scenario('circuit-link-standin', BOTH, async (page, ctx, shot) => {
  await open(page, STANDIN_HASH);
  await page.waitForSelector('.pcb-comp', { state: 'attached', timeout: 15000 });
  await sleep(6000);
  await shot('', 'Circuit link (#circuit=) with a part no library knows: auto Wire, "Check these parts" notice, stand-in part drawn dashed with "?" badge.');
  await openDrawer(page, 'parts');
  if (isMob(page)) await shot('parts', 'Phone: parts list with the "stand-in — check pins" marking.');
  await page.locator('.comp-card', { hasText: 'stand-in' }).first().click().catch(() => {});
  await sleep(400);
  if (isMob(page)) await closeDrawer(page);
  await openDrawer(page, 'inspector');
  await shot('inspector', 'Inspector for the stand-in part: warning and Pick from library / Footprint from a photo / Keep as pin header.');
});
scenario('circuit-link-auto', BOTH, async (page, ctx, shot) => {
  await open(page, CIRCUIT_LINK_HASH);
  // catch the processing bar while Wire / Compact are still running (poll fast, the solver is quick)
  await page.waitForSelector('#proc-bar.shown:not(.results)', { timeout: 15000 }).catch(() => {});
  await sleep(400);
  await shot('running', 'Circuit link of a hard circuit (ten capacitors): Wire, then Compact, run by themselves (processing bar).');
  await waitResultCard(page, 40000).catch(() => {});
  await sleep(4000);
  await shot('', 'Circuit link after the automatic Wire + Compact (or the state after 40 s if the search is still going).');
});
scenario('undo-redo-empty', ['desktop'], async (page, ctx, shot) => {
  await loadWired(page);
  await page.locator('.topbar-actions .btn-group .tbtn').first().click(); // Clear wires
  await sleep(600);
  await shot('', 'After "Delete all wires": parts only, ratsnest lines, Wire is next again.');
});

// static site pages (exist only in a build)
const PAGES = [
  ['page-how-it-works', '/how-it-works/', 'Static page: How it works hub (article list).'],
  ['page-article', '/how-it-works/perfboard-layout-explained/', 'Static page: one explainer article with a drawn board figure.'],
  ['page-article-faq', '/how-it-works/faq/', 'Static page: the FAQ article.'],
  ['page-parts', '/parts/', 'Static page: parts index.'],
  ['page-part', '/parts/wemos-d1-mini/', 'Static page: one part (pin table, footprint SVG, example circuit link).'],
  ['page-privacy', '/privacy/', 'Static page: privacy.'],
  ['page-imprint', '/imprint/', 'Static page: imprint.'],
];
for (const [name, p, desc] of PAGES) {
  scenario(name, BOTH, async (page, ctx, shot) => {
    const res = await page.goto(`${BASE}${p}`, { waitUntil: 'load' });
    if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status()} for ${p}`);
    await settle(page, 800);
    await shot('', desc);
    await shot('full', desc + ' (full page).', true);
  });
}

scenario('landscape-main', ['landscape'], async (page, ctx, shot) => {
  await loadWired(page);
  await shot('', 'Phone held sideways (844x390): the main screen with a wired board.');
  await page.locator('.mobile-more-btn').click().catch(() => {});
  await sleep(600);
  await shot('menu', 'Phone sideways: the action sheet.');
});

// ---------- runner ----------
const records = [];   // { device, file, desc }
const failures = [];  // { device, scenario, error }
const t0 = Date.now();

const devices = (DEVICE === 'all' ? ['desktop', 'mobile'] : [DEVICE]);
const picked = S.map((s, i) => ({ ...s, n: String(i + 1).padStart(2, '0') }))
  .filter(s => !ONLY || s.name.includes(ONLY));
if (!picked.length) { console.error(`no scenario matches --only ${ONLY}`); process.exit(2); }

rmSync(OUT, { recursive: true, force: true });
for (const d of ['desktop', 'mobile', 'landscape']) mkdirSync(path.join(OUT, d), { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME_PATH, args: ['--no-sandbox'] });

for (const s of picked) {
  for (const dev of s.devices) {
    // landscape runs together with "mobile"; "all" or an explicit match picks it up
    if (dev === 'landscape' ? DEVICE === 'desktop' : !devices.includes(dev)) continue;
    const label = `${dev}/${s.n}-${s.name}`;
    const ctx = await browser.newContext({ ...DEVICES[dev], locale: 'en-US', permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message || e)));
    const start = Date.now();
    const made = [];
    const fileFor = (part) => path.join(OUT, dev, `${s.n}-${s.name}${part ? '-' + part : ''}.png`);
    const record = (part, desc) => { const f = path.relative(OUT, fileFor(part)); made.push({ device: dev, file: f, desc }); };
    const helpers = {
      file: fileFor, record,
    };
    const shot = async (part, desc, fullPage = false) => {
      await page.mouse.move(0, 0).catch(() => {}); // no leftover hover tooltip
      await sleep(250);
      await page.screenshot({ path: fileFor(part), fullPage, animations: 'disabled' });
      record(part, desc);
    };
    try {
      await s.fn(page, Object.assign(ctx, helpers), shot);
      records.push(...made);
      console.log(`ok     ${label}  (${made.length} shots, ${((Date.now() - start) / 1000).toFixed(1)} s)`);
    } catch (err) {
      records.push(...made);
      const msg = String(err.message || err).split('\n')[0];
      failures.push({ device: dev, scenario: `${s.n}-${s.name}`, error: msg });
      console.log(`FAILED ${label}: ${msg}`);
      await page.screenshot({ path: fileFor('FAILED'), animations: 'disabled' }).catch(() => {});
    }
    if (errors.length) console.log(`       page errors: ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
}
await browser.close();

// ---------- index.md ----------
const okCount = picked.reduce((n, s) => n + s.devices.filter(d => (d === 'landscape' ? DEVICE !== 'desktop' : devices.includes(d))).length, 0) - failures.length;
const lines = [
  '# boardroute UI screenshots', '',
  `Base URL: ${BASE}  |  ${new Date().toISOString()}  |  ${((Date.now() - t0) / 1000).toFixed(0)} s`, '',
  `Scenarios ok: ${okCount}, failed: ${failures.length}, files: ${records.length}`, '',
];
if (failures.length) {
  lines.push('## Failed scenarios', '');
  for (const f of failures) lines.push(`- ${f.device}/${f.scenario}: ${f.error}`);
  lines.push('');
}
for (const dev of ['desktop', 'mobile', 'landscape']) {
  const rs = records.filter(r => r.device === dev);
  if (!rs.length) continue;
  lines.push(`## ${dev} (${DEVICES[dev].viewport.width}x${DEVICES[dev].viewport.height})`, '');
  for (const r of rs) lines.push(`- \`${r.file}\`: ${r.desc}`);
  lines.push('');
}
writeFileSync(path.join(OUT, 'index.md'), lines.join('\n'));
console.log(`\n${okCount} scenarios ok, ${failures.length} failed, ${records.length} files in ${path.relative(process.cwd(), OUT) || '.'}/ (${((Date.now() - t0) / 1000).toFixed(0)} s). Index: ${path.join(OUT, 'index.md')}`);
process.exit(failures.length ? 1 : 0);

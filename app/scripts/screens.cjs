/**
 * Captures every page and notable state of the app into docs/screens/.
 *
 * Runs against the dev server in demo mode, so no backend is needed:
 *   cd app && npm run dev
 *   CHROMIUM_PATH=/path/to/chromium NPM_GLOBAL=$(npm root -g) node scripts/screens.cjs
 *
 * Re-run after any UI change to refresh the documentation set.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require(
  process.env.NPM_GLOBAL ? path.join(process.env.NPM_GLOBAL, 'playwright') : 'playwright',
);

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const OUT = path.join(__dirname, '..', '..', 'docs', 'screens');

const PASSWORD = 'Tejo-Marmalade-77';
let n = 0;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  const page = await browser.newPage({
    viewport: { width: 460, height: 950 },
    deviceScaleFactor: 2,
  });
  page.on('pageerror', (e) => console.log('  PAGEERROR:', e.message));

  /** full=true un-sticks the header/nav so they don't overlay a tall capture. */
  const shot = async (name, full = false) => {
    await page.waitForTimeout(420);
    if (full) {
      await page.addStyleTag({
        content: '.topbar,.tabs{position:static !important}', id: 'unstick',
      });
      await page.waitForTimeout(100);
    }
    const file = `${String(++n).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: path.join(OUT, file), fullPage: full });
    if (full) await page.evaluate(() => document.getElementById('unstick')?.remove());
    console.log('  ' + file);
  };

  // ============ SIGNED OUT ============
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.features');
  await shot('welcome', true);

  await page.click('text=Start learning free');
  await page.waitForSelector('#confirm');
  await shot('signup-empty');

  await page.fill('#email', 'joana@example.com');
  await page.fill('#password', 'password123');
  await shot('signup-weak-password');

  await page.fill('#password', PASSWORD);
  await page.fill('#confirm', 'Tejo-Marmalade-78');
  await shot('signup-mismatch');

  await page.fill('#confirm', PASSWORD);
  await shot('signup-ready');

  await page.click('button[type=submit]');
  await page.waitForSelector('text=Confirm your email');
  await shot('confirm-email-gate');

  // sign-in + recovery, reached from the welcome page
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.click('text=I already have an account');
  await page.waitForSelector('text=Welcome back');
  await shot('signin');

  await page.click('text=Forgot your password?');
  await page.waitForSelector('text=Reset your password');
  await page.fill('#email', 'joana@example.com');
  await shot('forgot-password');

  await page.click('button[type=submit]');
  await page.waitForSelector('text=Check your inbox');
  await shot('forgot-password-sent');

  // recovery landing page (full load, which resets the demo store)
  await page.goto(`${BASE}/reset-password`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#np');
  await page.fill('#np', 'Rossio-Chestnut-42');
  await page.fill('#nc', 'Rossio-Chestnut-42');
  await shot('reset-password');

  // ============ ONBOARDING ============
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.click('text=Start learning free');
  await page.waitForSelector('#confirm');
  await page.fill('#email', 'joana@example.com');
  await page.fill('#password', PASSWORD);
  await page.fill('#confirm', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Simulate confirmation');
  await page.click('text=Simulate confirmation');

  await page.waitForSelector('#un');
  await page.fill('#un', 'joana');
  await page.click('.av >> nth=0');                        // cat avatar
  await page.locator('.chips').nth(0).locator('button', { hasText: 'Spanish' }).first().click();
  await page.locator('.chips').nth(1).locator('button', { hasText: 'English' }).first().click();
  await page.click('.chip >> text=Beginner');
  await shot('onboarding', true);

  // ============ SIGNED IN ============
  await page.click('button[type=submit]');
  await page.waitForSelector('.tabs');
  await shot('today', true);

  // ---- Plan ----
  await page.click('.tabs >> text=Plan');
  await page.waitForSelector('textarea');
  await shot('plan-empty', true);

  await page.click('.chip.hint >> nth=0');
  await page.click('text=Get my words');
  await page.waitForSelector('.notice', { timeout: 12000 });
  await shot('plan-generated', true);

  await page.click('.chip.hint >> nth=0');                 // same routine again
  await page.click('text=Get my words');
  await page.waitForTimeout(1700);
  await shot('plan-repeat-detected');

  await page.click('.chip.hint >> nth=2');                 // a different routine
  await page.click('text=Get my words');
  await page.waitForTimeout(1700);

  // ---- Words ----
  await page.click('.tabs >> text=Today');
  await page.click('text=See all');
  await page.waitForSelector('.word-card');
  await shot('words', true);

  await page.fill('input[aria-label="Search words"]', 'caf');
  await shot('words-search');
  await page.fill('input[aria-label="Search words"]', '');

  // ---- FRED ----
  await page.click('.tabs >> text=Talk');
  await page.waitForSelector('.mic');
  await shot('fred-ready');
  await page.click('.mic');
  await page.waitForSelector('.score', { timeout: 12000 });
  await shot('fred-scored', true);

  // ---- Games ----
  await page.click('.tabs >> text=Games');
  await page.waitForSelector('.game-card');
  await shot('games-hub', true);

  for (const [label, name] of [
    ['Word Match', 'game-word-match'],
    ['Quick Quiz', 'game-quick-quiz'],
    ['Echo Cat', 'game-echo-cat'],
    ['Sentence Builder', 'game-sentence-builder'],
  ]) {
    await page.click(`text=${label}`);
    await page.waitForSelector('.prompt-card, .answer-slot', { timeout: 8000 });
    await shot(name);
    await page.click('text=Quit');
    await page.waitForSelector('.game-card');
  }

  // play one through for the result screen
  await page.click('text=Quick Quiz');
  await page.waitForSelector('.opt');
  for (let i = 0; i < 5; i++) {
    await page.click('.opt >> nth=0');
    await page.waitForTimeout(1000);
  }
  await page.waitForSelector('.result-big', { timeout: 8000 });
  await shot('game-result');
  await page.click('text=Back to games');
  await page.waitForSelector('.game-card');

  // ---- Friends ----
  await page.click('.tabs >> text=Friends');
  await page.waitForSelector('text=Your friends');
  await shot('friends', true);

  await page.fill('#q', 'ma');
  await page.click('button[type=submit]');
  await page.waitForTimeout(700);
  await shot('friends-search', true);

  // ---- Challenges ----
  await page.click('.tabs >> text=Today');
  await page.waitForSelector('.tiles');
  await page.click('text=Challenges');
  await page.waitForSelector('text=New FRED sprint');
  await shot('challenges-new', true);

  await page.click('text=Send challenge');
  await page.waitForSelector('text=In progress', { timeout: 6000 });
  await shot('challenges-active', true);

  // ---- Den ----
  await page.click('button[aria-label="Your den"]');
  await page.waitForSelector('.avatars');
  await shot('den', true);

  // any language pairing
  await page.locator('.chips').nth(0).locator('button', { hasText: 'French' }).first().click();
  await page.locator('.chips').nth(1).locator('button', { hasText: 'Portuguese' }).first().click();
  await shot('den-language-pairing', true);

  // guard against learning what you already speak
  await page.locator('.chips').nth(1).locator('button', { hasText: 'French' }).first().click();
  await page.waitForTimeout(300);
  await shot('den-same-language-blocked', true);
  await page.locator('.chips').nth(1).locator('button', { hasText: 'Portuguese' }).first().click();

  // delete-account confirmation (not completed)
  await page.click('text=Delete my account');
  await page.waitForSelector('#confirm');
  await page.fill('#confirm', 'DELETE');
  await page.fill('#delpw', PASSWORD);
  await shot('den-delete-account', true);

  // ---- contact sheet: every page on one image ----
  // Images are inlined as data URIs: a page built with setContent has an
  // opaque origin, so it cannot load file:// resources.
  const files = fs.readdirSync(OUT)
    .filter((f) => /^\d\d-.*\.png$/.test(f))
    .sort();
  const cells = files.map((f) => {
    const b64 = fs.readFileSync(path.join(OUT, f)).toString('base64');
    const label = f.replace(/^\d\d-/, '').replace(/\.png$/, '').replace(/-/g, ' ');
    return `<figure><img src="data:image/png;base64,${b64}">
            <figcaption>${f.slice(0, 2)} · ${label}</figcaption></figure>`;
  }).join('');

  const sheet = await browser.newPage({ viewport: { width: 1680, height: 1200 } });
  await sheet.setContent(`
    <style>
      body{margin:0;padding:30px;background:#FDF5EA;
           font-family:system-ui,-apple-system,sans-serif}
      h1{font-size:28px;color:#3F2A1D;margin:0 0 24px;text-align:center;letter-spacing:-.02em}
      .grid{display:grid;grid-template-columns:repeat(6,1fr);gap:22px 20px}
      figure{margin:0;display:flex;flex-direction:column;align-items:center}
      .frame{width:100%;height:380px;border-radius:12px;overflow:hidden;background:#fff;
             border:1px solid #F0E2D0;box-shadow:0 2px 10px rgba(101,66,40,.09)}
      img{width:100%;display:block}
      figcaption{font-size:11.5px;color:#8B7361;margin-top:8px;font-weight:700;
                 text-align:center;line-height:1.35}
    </style>
    <h1>Cat's Tongue — every screen</h1>
    <div class="grid">${cells}</div>`);
  // wrap each image so tall captures crop from the top instead of squashing
  await sheet.evaluate(() => {
    document.querySelectorAll('figure').forEach((fig) => {
      const img = fig.querySelector('img');
      const frame = document.createElement('div');
      frame.className = 'frame';
      fig.insertBefore(frame, img);
      frame.appendChild(img);
    });
  });
  await sheet.waitForTimeout(1500);
  await sheet.screenshot({ path: path.join(OUT, 'all-screens.png'), fullPage: true });
  console.log('  all-screens.png (contact sheet)');

  await browser.close();
  console.log(`\n${n} screens captured into docs/screens/`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });

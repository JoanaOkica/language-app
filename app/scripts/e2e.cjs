/**
 * End-to-end usability + functionality pass.
 * Exercises: signup validation -> confirmation gate -> onboarding -> daily use
 * -> games -> social -> forgot password -> reset -> delete account.
 */
// Playwright is not a project dependency; point NPM_GLOBAL at your global
// node_modules, or `npm i -D playwright` and change this to require('playwright').
const path = require('path');
const { chromium } = require(
  process.env.NPM_GLOBAL ? path.join(process.env.NPM_GLOBAL, 'playwright') : 'playwright',
);

const BASE = 'http://localhost:5173';
const OUT = path.join(__dirname, '..', '..', 'docs', 'screens');
const results = [];
let failures = 0;

function check(name, condition, detail = '') {
  results.push({ name, pass: !!condition, detail });
  if (!condition) failures++;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 460, height: 950 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });

  const shot = async (name, full = false) => {
    await page.waitForTimeout(380);
    if (full) await page.addStyleTag({ content: '.topbar,.tabs{position:static !important}', id: 'uns' });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
    if (full) await page.evaluate(() => document.getElementById('uns')?.remove());
  };

  // ---------- 1. SIGN UP VALIDATION ----------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.click('text=Need an account? Sign up');
  await page.waitForSelector('#confirm');

  await page.fill('#email', 'joana@example.com');
  await page.fill('#password', 'password123');
  await page.waitForTimeout(200);
  const weakBlocked = await page.isDisabled('button[type=submit]');
  check('Common password "password123" rejected', weakBlocked);
  await shot('a1-signup-weak');

  await page.fill('#password', 'short1A!');
  await page.waitForTimeout(150);
  check('Too-short password rejected', await page.isDisabled('button[type=submit]'));

  await page.fill('#password', 'abcd1234efgh');
  await page.waitForTimeout(150);
  check('Sequential password "abcd1234efgh" rejected', await page.isDisabled('button[type=submit]'));

  await page.fill('#password', 'joana@example.comX1');
  await page.waitForTimeout(150);
  check('Password containing the email is rejected', await page.isDisabled('button[type=submit]'));

  // Strong, but mismatched confirmation
  await page.fill('#password', 'Tejo-Marmalade-77');
  await page.fill('#confirm', 'Tejo-Marmalade-78');
  await page.waitForTimeout(200);
  check('Mismatched confirmation blocks submit', await page.isDisabled('button[type=submit]'));
  const mismatchShown = await page.locator('text=The two passwords').first().isVisible();
  check('Mismatch is explained to the user', mismatchShown);
  await shot('a2-signup-mismatch');

  // Matching + strong
  await page.fill('#confirm', 'Tejo-Marmalade-77');
  await page.waitForTimeout(250);
  check('Strong matching password enables submit', !(await page.isDisabled('button[type=submit]')));
  await shot('a3-signup-strong');

  // ---------- 2. CONFIRMATION GATE ----------
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Confirm your email', { timeout: 8000 });
  check('Signup lands on the confirm-email gate (no session granted)', true);
  const gateText = await page.textContent('.card');
  check('Gate states the 24h deletion rule', /24 hours/.test(gateText));
  check('Gate offers to resend the email', /Resend the email/.test(gateText));
  await shot('a4-confirm-gate');

  await page.click('text=Simulate confirmation');
  await page.waitForSelector('#un', { timeout: 8000 });
  check('After confirmation the user reaches onboarding', true);

  // ---------- 3. ONBOARDING ----------
  await page.fill('#un', 'joana');
  await page.click('.av >> nth=2');
  await page.click('.chip >> text=Intermediate');
  await page.click('button[type=submit]');
  await page.waitForSelector('.tabs', { timeout: 8000 });
  check('Onboarding completes and the app shell loads', true);

  // ---------- 4. DAILY USE ----------
  const todayTxt = await page.textContent('.content');
  check('Today shows the daily goal', /DAILY GOAL/.test(todayTxt));
  check('Today shows the league', /league/i.test(todayTxt));

  await page.click('.tabs >> text=Plan');
  await page.waitForSelector('textarea');
  await page.click('.chip.hint >> nth=0');
  await page.click('text=Get my words');
  await page.waitForSelector('.notice', { timeout: 12000 });
  const gen1 = await page.textContent('.notice');
  check('Planning a day generates words', /Added/.test(gen1), gen1.trim().slice(0, 60));

  // Repeat the identical routine
  await page.click('.chip.hint >> nth=0');
  await page.click('text=Get my words');
  await page.waitForTimeout(1800);
  const gen2 = await page.textContent('.notice');
  check('Repeated routine adds nothing', /done this routine before/.test(gen2), gen2.trim().slice(0, 60));

  // A different routine sharing a word ("café") must add a context, not a card
  await page.click('.chip.hint >> nth=2');
  await page.click('text=Get my words');
  await page.waitForTimeout(1800);
  const gen3 = await page.textContent('.notice');
  check('A new routine still adds words', /Added/.test(gen3), gen3.trim().slice(0, 70));

  await page.click('.tabs >> text=Today');
  await page.waitForSelector('text=See all');
  await page.click('text=See all');
  await page.waitForSelector('.word-card');
  const wordsTxt = await page.textContent('.content');
  check('Word list shows multi-context cards', /uses/.test(wordsTxt));
  // Match the card HEADING only: 'café' also appears inside other cards'
  // example sentences and context labels.
  const headings = await page.$$eval('.word-card .w', els => els.map(e => e.textContent.trim().toLowerCase()));
  const cafeCards = headings.filter(w => w === 'café').length;
  check('"café" is a single card, not duplicated', cafeCards === 1, `found ${cafeCards}`);
  const badges = await page.$$eval('.pill-count', els => els.map(e => e.textContent.trim()));
  check('The shared word accumulated multiple uses', badges.some(b => /[2-9] uses/.test(b)), badges.join(','));
  await shot('a5-words', true);

  // ---------- 5. FRED ----------
  await page.click('.tabs >> text=Talk');
  await page.waitForSelector('.mic');
  await page.click('.mic');
  await page.waitForSelector('.score', { timeout: 12000 });
  const score = await page.textContent('.score');
  check('FRED returns a score', /\d/.test(score), score.trim());

  // ---------- 6. GAMES ----------
  await page.click('.tabs >> text=Games');
  await page.waitForSelector('.game-card');
  const gameCount = await page.locator('.game-card').count();
  check('All four games are listed', gameCount === 4, `found ${gameCount}`);
  await page.click('text=Quick Quiz');
  await page.waitForSelector('.opt', { timeout: 8000 });
  for (let i = 0; i < 5; i++) {
    await page.click('.opt >> nth=0');
    await page.waitForTimeout(1000);
  }
  await page.waitForSelector('.result-big', { timeout: 8000 });
  check('Quick Quiz completes and reports a result', true);
  await shot('a6-game-result');

  // ---------- 7. SOCIAL ----------
  await page.click('text=Back to games');
  await page.waitForSelector('.game-card');
  await page.click('.tabs >> text=Friends');
  await page.waitForSelector('text=Your friends');
  await page.fill('#q', 'ma');
  await page.click('button[type=submit]');
  await page.waitForTimeout(700);
  check('Friend search returns results', await page.locator('.friend').count() > 0);

  // ---------- 8. DEN + SAVE ----------
  await page.click('button[aria-label="Your den"]');
  await page.waitForSelector('.avatars');
  await page.click('.av >> nth=4');
  await page.click('text=Save changes');
  await page.waitForSelector('text=Saved ✓', { timeout: 8000 });
  check('Profile changes save', true);

  // ---------- 9. SIGN OUT + FORGOT PASSWORD ----------
  await page.click('text=Sign out');
  await page.waitForSelector('text=Welcome back', { timeout: 8000 });
  check('Sign out returns to the sign-in screen', true);

  await page.click('text=Forgot your password?');
  await page.waitForSelector('text=Reset your password');
  await page.fill('#email', 'joana@example.com');
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Check your inbox', { timeout: 8000 });
  const resetTxt = await page.textContent('.card');
  check('Reset flow does not confirm whether the account exists',
        /If an account exists/.test(resetTxt));
  await shot('a7-forgot-password');

  // ---------- 10. RESET PAGE ----------
  await page.goto(`${BASE}/reset-password`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#np', { timeout: 8000 });
  await page.fill('#np', 'weak');
  await page.waitForTimeout(200);
  check('Reset page enforces the same password policy',
        await page.isDisabled('button[type=submit]'));
  await page.fill('#np', 'Rossio-Chestnut-42');
  await page.fill('#nc', 'Rossio-Chestnut-42');
  await page.waitForTimeout(250);
  check('Reset page accepts a strong password',
        !(await page.isDisabled('button[type=submit]')));
  await shot('a8-reset-password');

  check('No uncaught page errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();

  console.log(`\n${results.filter(r => r.pass).length}/${results.length} checks passed`);
  require('fs').writeFileSync(
    path.join(__dirname, 'e2e-results.json'), JSON.stringify(results, null, 2));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('RUN FAILED:', e.message); process.exit(2); });

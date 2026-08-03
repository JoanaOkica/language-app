/**
 * Renders the Cat's Tongue mark into the Android launcher icons.
 *
 * Uses the headless browser that already ships with the project rather than an
 * image library, so there is no extra native dependency to install.
 *
 *   NPM_GLOBAL=$(npm root -g) node scripts/make-icons.cjs
 *
 * Re-run whenever public/favicon.svg changes.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require(
  process.env.NPM_GLOBAL ? path.join(process.env.NPM_GLOBAL, 'playwright') : 'playwright',
);

const SVG = path.join(__dirname, '..', 'public', 'favicon.svg');
const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

// Android launcher densities. `foreground` is the adaptive-icon layer, which
// must leave a safe margin because the launcher masks it to its own shape.
const TARGETS = [
  { dir: 'mipmap-mdpi', size: 48 },
  { dir: 'mipmap-hdpi', size: 72 },
  { dir: 'mipmap-xhdpi', size: 96 },
  { dir: 'mipmap-xxhdpi', size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

const page = (svg, size, { round = false, padded = false } = {}) => `
<!doctype html><html><head><style>
  html,body{margin:0;padding:0;background:transparent}
  #wrap{width:${size}px;height:${size}px;display:grid;place-items:center;overflow:hidden;
        ${round ? `border-radius:50%;` : ''}}
  svg{width:${padded ? size * 0.62 : size}px;height:${padded ? size * 0.62 : size}px;display:block}
  ${padded ? '#wrap{background:#FDF5EA}' : ''}
  ${round || padded ? 'svg rect:first-of-type{display:none}' : ''}
</style></head><body><div id="wrap">${svg}</div></body></html>`;

(async () => {
  const svg = fs.readFileSync(SVG, 'utf8');
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );

  for (const { dir, size } of TARGETS) {
    const out = path.join(RES, dir);
    if (!fs.existsSync(out)) continue;

    for (const [file, opts] of [
      ['ic_launcher.png', {}],
      ['ic_launcher_round.png', { round: true }],
      ['ic_launcher_foreground.png', { padded: true }],
    ]) {
      const p = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      });
      await p.setContent(page(svg, size, opts));
      await p.screenshot({
        path: path.join(out, file),
        omitBackground: !opts.padded,
      });
      await p.close();
    }
    console.log(`  ${dir}  ${size}x${size}`);
  }

  await browser.close();
  console.log('launcher icons written');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });

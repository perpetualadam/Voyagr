/* Real template/CSS hit testing only; no live GPS or routing verification. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { chromium } = require('@playwright/test');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const doc = new JSDOM(read('templates/index.html')).window.document;
const sheet = doc.getElementById('bottomSheet');
const wrapper = sheet.parentElement.cloneNode(false);
for (const id of ['bottomSheet', 'navigationOverlayLayout', 'speedWidget']) {
    if (!wrapper.querySelector('#' + id)) wrapper.appendChild(doc.getElementById(id).cloneNode(true));
}
(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
        args: ['--no-sandbox']
    });
    try {
        for (const [width, height] of [[360, 800], [576, 900], [844, 390], [1280, 800]]) {
            for (const dark of [false, true]) {
                const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
                await page.route('**/*', route => route.abort());
                await page.setContent(`<html class="${dark ? 'dark-mode' : ''}"><head><style>${read('static/css/voyagr.css')}</style></head><body>${wrapper.outerHTML}</body></html>`);
                await page.evaluate(() => {
                    document.getElementById('speedWidget').style.display = 'block';
                    document.getElementById('bottomSheet').classList.add('expanded');
                });
                await page.waitForTimeout(550);
                const covered = await page.evaluate(() => {
                    const widget = document.getElementById('speedWidget');
                    const panel = document.getElementById('bottomSheet');
                    const w = widget.getBoundingClientRect(), s = panel.getBoundingClientRect();
                    const x = (Math.max(w.left, s.left) + Math.min(w.right, s.right)) / 2;
                    const y = (Math.max(w.top, s.top) + Math.min(w.bottom, s.bottom)) / 2;
                    return w.right > s.left && w.left < s.right && w.bottom > s.top && w.top < s.bottom
                        && panel.contains(document.elementFromPoint(x, y));
                });
                assert.equal(covered, true, `${width} ${dark}: widget covers expanded panel`);
                await page.evaluate(() => document.getElementById('bottomSheet').classList.remove('expanded'));
                await page.waitForTimeout(550);
                assert.equal(await page.locator('#speedWidget').evaluate(el => {
                    const r = el.getBoundingClientRect();
                    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
                }), true, 'Collapsed panel obstructs speed widget');
                await page.evaluate(() => { document.getElementById('speedWidget').style.display = 'none'; });
                assert.equal(await page.locator('#speedWidget').isVisible(), false, 'Disabled widget made visible');
                await page.close();
                console.log(`PASS ${width}x${height} ${dark ? 'dark' : 'light'}: expanded panel hit target, collapsed widget, disabled preference`);
            }
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

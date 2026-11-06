/* Isolated browser UI check: production markup/CSS/controllers, fixture map only.
 * No GPS, routing server, live WebGL map or production acceptance is claimed.
 * Run: node scripts/check-preview-player.cjs
 * Optional PLAYER_SCREENSHOT_DIR saves layout captures outside the repository.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('@playwright/test');
const root = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'templates/index.html'), 'utf8');
const panel = template.match(/<section id="simulationControls"[\s\S]*?<\/section>/)[0];
const css = fs.readFileSync(path.join(root, 'static/css/voyagr.css'), 'utf8');

(async () => {
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
    const browser = await chromium.launch({executablePath, headless: true, args: ['--no-sandbox']});
    try {
        for (const [width, height] of [[320, 640], [390, 844], [844, 390], [1280, 800]]) {
            for (const theme of ['light', 'dark']) {
                const page = await browser.newPage({viewport: {width, height}, reducedMotion: 'reduce'});
                await page.route('**/*', route => route.abort());
                await page.setContent(`<html class="${theme === 'dark' ? 'dark-mode' : ''}"><head><style>${css}</style></head><body>${panel}</body></html>`);
                for (const file of ['static/js/modules/navigation/avoidance-integrity.js', 'static/js/modules/navigation/journey-plan.js', 'static/js/app/journey-modes.js']) {
                    await page.addScriptTag({content: fs.readFileSync(path.join(root, file), 'utf8')});
                }
                assert.equal(await page.evaluate(() => {
                    window.fixtureRemovable = true;
                    const route = {geometry: [[53, -1], [53.01, -1]], duration_minutes: 2,
                        maneuvers: [{instruction: 'Continue along Frances Street', begin_shape_index: 0}, {instruction: 'Arrive at the planned destination', begin_shape_index: 1}]};
                    window.VoyagrJourneyModes.bind({selected: () => route, isLive: () => false, stopGps: () => {}, showStatus: () => {},
                        map: () => ({isStyleLoaded: () => true}),
                        helpers: () => ({addPolyline: () => ({remove: () => {}}), isPolylineLayerMounted: () => true, isPolylineLayerRemoved: () => window.fixtureRemovable}),
                        simulationMarker: () => {
                            const el = document.createElement('i'); document.body.append(el);
                            return {setLngLat: () => {}, remove: () => el.remove(), getElement: () => el};
                        }});
                    return window.VoyagrJourneyModes.startSimulation();
                }), true);
                const bounds = await page.locator('#simulationControls').evaluate(el => {
                    const b = el.getBoundingClientRect();
                    return {left: b.left, right: b.right, top: b.top, bottom: b.bottom, overflows: el.scrollWidth > el.clientWidth};
                });
                assert(bounds.left >= 0 && bounds.right <= width && bounds.top >= 0 && bounds.bottom <= height);
                assert.equal(bounds.overflows, false, `${width}px ${theme}: horizontal overflow`);
                for (const selector of ['#simulationPause', '#simulationRestart', '#simulationExit', '#simulationSpeed', '.simulation-follow-label']) {
                    const size = await page.locator(selector).boundingBox();
                    assert(size.width >= 48 && size.height >= 48, `${selector}: small target`);
                }
                if (process.env.PLAYER_SCREENSHOT_DIR) {
                    fs.mkdirSync(process.env.PLAYER_SCREENSHOT_DIR, {recursive: true});
                    await page.screenshot({path: path.join(process.env.PLAYER_SCREENSHOT_DIR, `player-${width}-${theme}.png`)});
                }
                await page.getByRole('button', {name: 'Pause route preview', exact: true}).focus();
                await page.keyboard.press('Enter');
                assert.equal(await page.locator('#simulationState').textContent(), 'Paused');
                assert.equal(await page.locator('#simulationResume').evaluate(el => el === document.activeElement), true);
                assert.equal(await page.locator('#simulationResume').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
                await page.keyboard.press('Enter');
                assert.equal(await page.locator('#simulationState').textContent(), 'Playing');
                await page.getByLabel('Playback speed').selectOption('20');
                await page.getByRole('checkbox', {name: 'Follow vehicle', exact: true}).uncheck();
                assert.equal(await page.locator('#simulationFollow').isChecked(), false);
                await page.locator('#simulationPosition').evaluate(el => {el.value = '100'; el.dispatchEvent(new Event('input', {bubbles: true}));});
                assert.equal(await page.locator('#simulationState').textContent(), 'Preview complete');
                assert.equal(await page.locator('#simulationResume').isDisabled(), true);
                await page.getByRole('button', {name: 'Restart route preview', exact: true}).click();
                assert.equal(await page.locator('#simulationState').textContent(), 'Playing');
                await page.locator('.simulation-details summary').click();
                assert.equal(await page.locator('#simulationTiming').isVisible(), true);
                await page.evaluate(() => {window.fixtureRemovable = false;});
                await page.getByRole('button', {name: 'Exit route preview', exact: true}).click();
                assert.equal(await page.locator('#simulationRecovery').isVisible(), true);
                assert.equal(await page.locator('#simulationRestart').isDisabled(), true);
                await page.evaluate(() => {window.fixtureRemovable = true;});
                await page.getByRole('button', {name: 'Exit route preview', exact: true}).click();
                assert.equal(await page.locator('#simulationControls').isVisible(), false);
                await page.close();
                console.log(`PASS ${width}x${height} ${theme}: layout, targets, keyboard, playback and recovery`);
            }
        }
    } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});

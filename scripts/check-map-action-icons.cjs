/* Production markup/CSS and UI controllers with fixture device/map actions.
 * No GPS, provider, camera permission or live navigation acceptance is claimed.
 * Run: node scripts/check-map-action-icons.cjs
 * Optional MAP_ACTION_SCREENSHOT_DIR saves screenshots outside the repository.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('@playwright/test');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const template=read('templates/index.html'),css=read('static/css/voyagr.css');
const menu=template.split('<!-- Map action menu (bottom-right hamburger) -->')[1].split('<div id="mapControlsHintModal"')[0];
const poi=template.split('<!-- Quick Search Buttons -->')[1].split('<div id="alongRouteSearch"')[0];
const guidance=template.split('<!-- Turn-by-Turn Navigation Display Widget -->')[1].split('<section id="journeyModeChooser"')[0];
const intersects=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
(async()=>{
    const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
    try{
        for(const [width,height] of [[320,640],[390,844],[844,390],[1280,800]])for(const theme of ['light','dark']){
            for(const live of [false,true]){
                const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
                await page.route('**/*',route=>route.request().url()==='https://voyagr-fixture.test/'?route.fulfill({contentType:'text/html',body:'<!doctype html>'}):route.abort());
                await page.goto('https://voyagr-fixture.test/');
                await page.setContent(`<html class="${theme==='dark'?'dark-mode':''}" style="--safe-area-inset-bottom:12px;--safe-area-inset-right:6px"><head><style>${css}</style></head><body class="${live?'voyagr-journey-summary-visible':''}">${guidance}${menu}</body></html>`);
                for(const file of ['static/js/modules/ui/nav-menu.js','static/js/modules/ui/toggle-ui.js','static/js/modules/map/map-controls.js','static/js/app/nav-menu-orchestration.js','static/js/app/map-recenter-orchestration.js','static/js/app/journey-overview-orchestration.js'])await page.addScriptTag({content:read(file)});
                await page.evaluate(live=>{
                    window.uiCalls=[];
                    const T=window.VoyagrToggleUI,R=window.VoyagrMapRecenterOrchestration,O=window.VoyagrJourneyOverviewOrchestration;
                    R.bind({mapControls:()=>window.VoyagrMapControls});O.bind({mapControls:()=>window.VoyagrMapControls});
                    for(const name of ['startGPSTracking','startNavigation','recenterOnVehicle','getCurrentLocation','toggleVoiceInput','openRoadReportModal','openMapControlsHintModal','stopTurnByTurnNavigation'])window[name]=()=>window.uiCalls.push(name);
                    window.toggleZoomAndFollow=()=>{const el=document.getElementById('zoomFollowToggle');R.applyZoomFollowButtonUi(el,el.getAttribute('aria-pressed')!=='true');};
                    window.toggleJourneyOverview=()=>{const el=document.getElementById('journeyOverviewBtn');O.applyJourneyOverviewButtonUi(el,el.getAttribute('aria-pressed')!=='true');};
                    window.toggleShowCameras=()=>{const el=document.getElementById('showCamerasFab');T.applyToggleButton(el,el.getAttribute('aria-pressed')!=='true');};
                    for(const id of ['startNavBtn','zoomFollowToggle','recenterVehicleFab','journeyOverviewBtn','endNavigationBtn'])if(live)document.getElementById(id).style.display='flex';
                    if(live){document.getElementById('turnInstructionWidget').style.display='block';document.getElementById('speedWidget').style.display='block';document.getElementById('laneGuidanceDisplay').classList.add('show');document.getElementById('laneGuidanceText').textContent='Fixture lane guidance';}
                    window.VoyagrNavMenuOrchestration.initNavMenu();
                },live);
                const toggle=page.locator('#navMenuToggle');
                if(live){
                    const speed=await page.locator('#speedWidget').boundingBox(),turn=await page.locator('#turnInstructionWidget').boundingBox();
                    for(const selector of ['#navMenuToggle','#endNavigationBtn']){
                        const b=await page.locator(selector).boundingBox();assert.equal(intersects(b,speed),false);assert.equal(intersects(b,turn),false);
                    }
                }
                await toggle.focus();await page.keyboard.press('Enter');
                assert.equal(await toggle.getAttribute('aria-expanded'),'true');
                assert.equal(await page.locator('#startTrackingBtn').evaluate(el=>el===document.activeElement),true);
                const bounds=await page.locator('#navControlButtons').boundingBox();
                assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=height);
                assert.equal(await page.locator('#navControlButtons').evaluate(el=>el.scrollWidth>el.clientWidth),false);
                if(live){
                    const end=page.getByRole('button',{name:'End navigation',exact:true});
                    assert.equal(intersects(bounds,await end.boundingBox()),false);
                    for(const selector of ['#speedWidget','#turnInstructionWidget'])assert.equal(intersects(bounds,await page.locator(selector).boundingBox()),false,`Open actions obscure ${selector}`);
                    assert.equal(await end.evaluate(el=>{const b=el.getBoundingClientRect();return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2).closest('button')===el;}),true);
                }
                if(process.env.MAP_ACTION_SCREENSHOT_DIR){fs.mkdirSync(process.env.MAP_ACTION_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.MAP_ACTION_SCREENSHOT_DIR,`map-${width}-${theme}-${live?'live':'planning'}.png`)});}
                for(const button of await page.locator('#navControlButtons button:visible').all()){
                    await button.scrollIntoViewIfNeeded();const b=await button.boundingBox();
                    assert(b.width>=48&&b.height>=48);assert(b.y>=bounds.y-1&&b.y+b.height<=bounds.y+bounds.height+1);
                    assert.equal(await button.locator('svg').count(),1);
                }
                await page.getByRole('button',{name:'Show speed cameras on map',exact:true}).click();
                assert.equal(await page.locator('#showCamerasFab').getAttribute('aria-pressed'),'false');
                assert.equal(await page.locator('#showCamerasFab svg').count(),1);
                if(live){
                    await page.getByRole('button',{name:'Follow vehicle',exact:true}).click();
                    assert.equal(await page.locator('#zoomFollowToggle').getAttribute('aria-pressed'),'false');
                    await page.getByRole('button',{name:'Journey overview',exact:true}).click();
                    assert.equal(await page.locator('#journeyOverviewBtn').getAttribute('aria-pressed'),'true');
                    assert.equal(await page.locator('#journeyOverviewBtn svg').count(),1);
                    await page.getByRole('button',{name:'End navigation',exact:true}).click();
                    assert.deepEqual(await page.evaluate(()=>window.uiCalls),['stopTurnByTurnNavigation']);
                }
                await page.locator('#showCamerasFab').focus();await page.keyboard.press('Escape');
                assert.equal(await toggle.getAttribute('aria-expanded'),'false');
                assert.equal(await toggle.evaluate(el=>el===document.activeElement),true);
                assert.equal(await toggle.locator('svg').count(),2);
                // Exercise the real pointer path as well as keyboard entry.
                await page.waitForTimeout(450);await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');
                await page.keyboard.press('Escape');assert.equal(await page.locator('#navControlButtons').isVisible(),false);
                await page.close();console.log(`PASS ${width}x${height} ${theme} ${live?'live fixture':'planning'}: bounds, targets, state, keyboard, pointer and stop access`);
            }
            const page=await browser.newPage({viewport:{width,height}});
            await page.route('**/*',route=>route.abort());
            await page.setContent(`<html class="${theme==='dark'?'dark-mode':''}"><head><style>${css}</style></head><body><div class="bottom-sheet expanded" style="max-width:440px"><div class="bottom-sheet-content">${poi}</div></div></body></html>`);
            await page.evaluate(()=>{window.categories=[];window.VoyagrPoiSearchOrchestration={quickSearch:type=>window.categories.push(type)};});
            const entry=read('static/js/voyagr-app.js').match(/function quickSearch\(type\) \{[^\n]+/)[0];await page.addScriptTag({content:entry});
            assert.equal(await page.locator('.map-poi-shortcuts').evaluate(el=>el.scrollWidth>el.clientWidth),false);
            for(const button of await page.locator('.map-poi-shortcuts button').all()){await button.scrollIntoViewIfNeeded();const b=await button.boundingBox();assert(b.width>=48&&b.height>=48);await button.click();}
            assert.deepEqual(await page.evaluate(()=>window.categories),['parking','fuel','food','charging','pharmacy','hospital','groceries']);
            await page.close();console.log(`PASS ${width}x${height} ${theme} POI shortcuts: targets, labels and category dispatch`);
        }
    }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

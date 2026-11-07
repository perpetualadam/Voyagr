/* Isolated UI check with production toolbar markup/CSS and sheet/tab controllers.
 * Page loaders and Premium are fixtures; no provider/account/device calls are made.
 * Run: node scripts/check-sheet-toolbar.cjs
 * Optional SHEET_TOOLBAR_SCREENSHOT_DIR saves captures outside the repository.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('@playwright/test');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const template=read('templates/index.html'),css=read('static/css/voyagr.css');
const header=template.split('<div class="bottom-sheet-header">')[1].split('<div class="bottom-sheet-content">')[0];
const tabNames=['navigation','settings','tripHistory','routeComparison','routeSharing','routeAnalytics','savedRoutes','routePreview','dashcam'];
function contrast(a,b){
    const luminance=value=>value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
(async()=>{
    const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
    try{
        for(const [width,height] of [[320,640],[390,844],[844,390],[1280,800]])for(const theme of ['light','dark'])for(const textScale of [1,2]){
            const page=await browser.newPage({viewport:{width,height},hasTouch:true,reducedMotion:'reduce'});
            await page.route('**/*',route=>route.abort());
            await page.setContent(`<html class="${theme==='dark'?'dark-mode':''}" style="font-size:${textScale*100}%;--safe-area-inset-bottom:12px"><head><style>${css}</style></head><body><div id="bottomSheet" class="bottom-sheet" style="max-width:440px"><div class="bottom-sheet-handle"></div><div class="bottom-sheet-header">${header}<div class="bottom-sheet-content">${tabNames.map(name=>`<section id="${name}Tab" style="display:${name==='navigation'?'block':'none'}"><h3>${name}</h3><p>Fixture page content</p></section>`).join('')}</div></div></body></html>`);
            for(const file of ['static/js/modules/ui/dom-helpers.js','static/js/modules/navigation/units.js','static/js/app/bottom-sheet-orchestration.js','static/js/app/tab-navigation-orchestration.js'])await page.addScriptTag({content:read(file)});
            await page.evaluate(()=>{
                const Sheet=window.VoyagrBottomSheetOrchestration,Tab=window.VoyagrTabNavigationOrchestration;
                window.toolbarCalls=[];const calls={};
                for(const name of ['loadRoutePreferences','loadMultiDropPreferences','loadVoicePreferences','loadPorcupineWakeUi','loadCameraAlertPreferences','loadAvoidancePreferences','loadHazardCameraTogglesFromApi','loadPromoEntitlementStatus','loadTripHistory','displayRouteComparison','prepareRouteSharing','loadRouteAnalytics','loadSavedRoutes','applyDomSelectsFromPlan'])calls[name]=()=>window.toolbarCalls.push(name);
                Tab.bind({call:calls,units:()=>window.VoyagrUnits,getDistanceUnit:()=> 'mi',getCurrencyUnit:()=> 'GBP',getSpeedUnit:()=> 'mph',getTemperatureUnit:()=> 'celsius'});
                Sheet.bind({domHelpers:()=>window.VoyagrDomHelpers,getRouteInProgress:()=>false});
                window.switchTab=tab=>Tab.switchTab(tab);window.expandBottomSheet=()=>Sheet.expandBottomSheet();window.collapseBottomSheet=()=>Sheet.collapseBottomSheet();
                window.openVoyagerPremiumSection=()=>window.toolbarCalls.push('premium');
                Sheet.initBottomSheet();
            });
            const toolbar=page.locator('.sheet-toolbar'),sheet=page.locator('#bottomSheet');
            const assertLayout=async(expanded)=>{
                await page.waitForTimeout(30);
                assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
                assert.equal(await sheet.evaluate(el=>el.classList.contains('expanded')),expanded);
                const buttons=await toolbar.locator('button').all();assert.equal(buttons.length,9);
                for(const button of buttons){
                    await button.focus();await page.waitForTimeout(30);
                    const b=await button.boundingBox(),t=await toolbar.boundingBox();
                    assert(b.width>=48&&b.height>=48);
                    assert(b.x>=t.x-1&&b.x+b.width<=t.x+t.width+1,`Focused tool clipped: ${await button.getAttribute('aria-label')} ${JSON.stringify({b,t})}`);
                    assert(b.y>=0&&b.y+b.height<=height+1,'Tool is outside visible sheet peek');
                    assert.equal(await button.locator('svg').count(),1);
                    const colours=await button.evaluate(el=>{const s=getComputedStyle(el);return [s.color,s.backgroundColor];});
                    assert(contrast(...colours)>=4.5,'Toolbar label contrast is below 4.5:1');
                }
                const font=await toolbar.locator('.sheet-tool-label').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
                assert.equal(font,12*textScale);
                if(expanded){const b=await page.locator('.bottom-sheet-content').boundingBox();assert(b.height>=48,'Toolbar leaves no usable content area');}
                if(process.env.SHEET_TOOLBAR_SCREENSHOT_DIR){fs.mkdirSync(process.env.SHEET_TOOLBAR_SCREENSHOT_DIR,{recursive:true});await toolbar.evaluate(el=>{el.scrollLeft=0;});await page.screenshot({path:path.join(process.env.SHEET_TOOLBAR_SCREENSHOT_DIR,`toolbar-${width}-${theme}-${textScale}-${expanded?'expanded':'collapsed'}.png`)});}
            };
            await assertLayout(false);
            // Real native keyboard navigation should reveal each next button.
            await toolbar.locator('button').first().focus();await page.keyboard.press('Tab');
            assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Analytics');
            assert.equal(await toolbar.locator('button').nth(1).evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
            await page.keyboard.press('Enter');await assertLayout(true);
            assert.equal(await toolbar.locator('[aria-current="page"]').getAttribute('data-sheet-tab'),'routeAnalytics');
            for(const tab of ['savedRoutes','routeSharing','routeComparison','tripHistory','dashcam','settings']){
                await toolbar.locator(`[data-sheet-tab="${tab}"]`).click();
                assert.equal(await page.locator('#'+tab+'Tab').isVisible(),true);
                assert.equal(await toolbar.locator('[aria-current="page"]').getAttribute('data-sheet-tab'),tab);
            }
            await toolbar.locator('.sheet-icon-btn--premium').click();
            assert.equal(await page.evaluate(()=>window.toolbarCalls.includes('premium')),true);
            // Toolbar blank space must not toggle the parent sheet.
            await toolbar.dispatchEvent('click');assert.equal(await sheet.evaluate(el=>el.classList.contains('expanded')),true);
            if(width===320&&theme==='light'&&textScale===1){
                await toolbar.evaluate(el=>{el.scrollLeft=0;});
                const b=await toolbar.boundingBox(),cdp=await page.context().newCDPSession(page),y=b.y+b.height/2;
                await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width-20,y}]});
                for(let step=1;step<=6;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width-20-step*(b.width-40)/6,y}]});await page.waitForTimeout(25);}
                await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(100);
                assert(await toolbar.evaluate(el=>el.scrollLeft)>0,'Touch swipe did not scroll tools');
                assert.equal(await sheet.evaluate(el=>el.classList.contains('expanded')),true);
            }
            await toolbar.locator('.sheet-icon-btn--collapse').click();assert.equal(await sheet.evaluate(el=>el.classList.contains('expanded')),false);
            await page.locator('.bottom-sheet-handle').click();assert.equal(await sheet.evaluate(el=>el.classList.contains('expanded')),true);
            await page.close();console.log(`PASS ${width}x${height} ${theme} ${textScale*100}% text: peek, targets, contrast, focus, scroll, tabs and collapse`);
        }
    }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

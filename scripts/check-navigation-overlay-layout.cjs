/* Production HUD markup/CSS in combined long-content fixtures. No live GPS,
 * route/provider evidence, legal speed or lane applicability is established.
 * Run: node scripts/check-navigation-overlay-layout.cjs
 * Optional NAVIGATION_LAYOUT_SCREENSHOT_DIR saves captures outside the repository.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),{chromium}=require('@playwright/test');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const doc=new JSDOM(read('templates/index.html')).window.document,css=read('static/css/voyagr.css');
const hud=doc.getElementById('navigationOverlayLayout').outerHTML,summary=doc.getElementById('journeySummaryBar').outerHTML,menu=doc.querySelector('.nav-control-menu').outerHTML;
const overlaps=(a,b)=>a.x<b.x+b.width-1&&a.x+a.width>b.x+1&&a.y<b.y+b.height-1&&a.y+a.height>b.y+1;
(async()=>{
    const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
    try{
        for(const [width,height] of [[320,640],[390,844],[844,390],[1280,800]])for(const theme of ['light','dark'])for(const scale of [1,2]){
            const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
            await page.route('**/*',route=>route.abort());
            await page.setContent(`<html class="${theme==='dark'?'dark-mode':''}" style="font-size:${scale*100}%;--safe-area-inset-top:20px;--safe-area-inset-bottom:12px;--safe-area-inset-right:6px;--safe-area-inset-left:6px"><head><style>${css}</style></head><body class="voyagr-journey-summary-visible ${theme==='dark'?'dark-mode':''}">${hud}<div class="bottom-sheet" id="bottomSheet"></div>${summary}${menu}</body></html>`);
            await page.addScriptTag({content:read('static/js/modules/navigation/lane-guidance.js')});
            await page.evaluate(()=>{
                for(const id of ['turnInstructionWidget','speedWidget','roadNameBar'])document.getElementById(id).style.display='block';
                for(const id of ['nextTurnThen','journeySummaryBar','endNavigationBtn'])document.getElementById(id).style.display='flex';
                document.getElementById('bestEffortWarning').hidden=false;
                document.getElementById('laneGuidanceDisplay').classList.add('show');
                const text={nextTurnDistance:'250 m',nextTurnInstruction:'At the roundabout, take the third exit towards the city centre and railway station',nextTurnStreet:'Extremely Long Named Road towards the Central Railway Station',
                    nextTurnThenText:'Turn right at the next junction towards the hospital',laneGuidanceText:'Mapped lanes — route applicability unverified',
                    speedValue:'70',speedLimitValue:'70',currentRoadName:'Extremely Long Named Road towards the Central Railway Station',remainingDistance:'26.3 mi',remainingTime:'1h 12m',etaTime:'12:45'};
                for(const [id,value] of Object.entries(text))document.getElementById(id).textContent=value;
                const visual=document.getElementById('laneVisual');
                for(let i=0;i<5;i++){const lane=document.createElement('div');lane.className='lane-indicator has-direction';lane.innerHTML=window.VoyagrLaneGuidance.buildLaneIndicatorHtml(i===4?'↗':'↑');visual.appendChild(lane);}
                document.getElementById('laneGuidanceBadge').textContent='Mapped';
                document.getElementById('speedLimitMappedLabel').hidden=false;
                document.getElementById('speedLimitMappedLabel').textContent='Route est.';
                document.getElementById('speedLimitCircle').style.borderColor='#757575';
                window.stopped=0;window.stopTurnByTurnNavigation=()=>{window.stopped++;};
            });
            await page.addScriptTag({content:read('static/js/app/navigation-safety-ux.js')});
            await page.evaluate(()=>{document.getElementById('dismissBestEffortWarning').onclick=()=>window.VoyagrNavigationSafetyUX.dismiss();});
            const check=async()=>{
                await page.waitForTimeout(100);
                assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Horizontal page overflow');
                const ids=['turnInstructionWidget','speedWidget','roadNameBar','journeySummaryBar','endNavigationBtn'];
                if(await page.locator('#bestEffortWarning').isVisible())ids.push('bestEffortWarning');
                const rects={};for(const id of ids){
                    const b=await page.locator('#'+id).boundingBox();assert(b&&b.width>0&&b.height>0,`${id}: no visible area`);
                    assert(b.x>=0&&b.y>=0&&b.x+b.width<=width+1&&b.y+b.height<=height+1,`${id}: outside viewport ${JSON.stringify(b)}`);rects[id]=b;
                }
                for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)assert.equal(overlaps(rects[ids[i]],rects[ids[j]]),false,`${ids[i]} overlaps ${ids[j]}`);
                for(const id of ['turnInstructionWidget','speedWidget','bestEffortWarning'])if(await page.locator('#'+id).isVisible()){
                    assert.equal(await page.locator('#'+id).evaluate(el=>el.scrollWidth>el.clientWidth),false,`${id}: horizontal content overflow`);
                }
                const circle=await page.locator('#speedLimitCircle').boundingBox(),speed=rects.speedWidget;
                assert(circle.x>=speed.x&&circle.x+circle.width<=speed.x+speed.width+1,'Posted limit clipped horizontally');
                assert(circle.y>=speed.y&&circle.y+circle.height<=speed.y+speed.height+1,`Posted limit clipped vertically ${JSON.stringify({width,height,scale,circle,speed,offline:await page.evaluate(()=>document.body.className)})}`);
                for(const label of await page.locator('#journeySummaryBar .journey-summary-value, #journeySummaryBar .journey-summary-label').all()){
                    const b=await label.boundingBox(),bar=rects.journeySummaryBar;
                    assert(b.x>=bar.x&&b.x+b.width<=bar.x+bar.width+1&&b.y>=bar.y&&b.y+b.height<=bar.y+bar.height+1,'Journey progress text overflows its bar');
                }
                const end=page.locator('#endNavigationBtn');assert.equal(await end.evaluate(el=>{const b=el.getBoundingClientRect();return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2).closest('button')===el;}),true,'End control obstructed');
            };
            await check();
            if(process.env.NAVIGATION_LAYOUT_SCREENSHOT_DIR){fs.mkdirSync(process.env.NAVIGATION_LAYOUT_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.NAVIGATION_LAYOUT_SCREENSHOT_DIR,`navigation-${width}-${theme}-${scale}.png`)});}
            const warning=page.locator('#bestEffortWarning');await warning.focus();
            assert.equal(await warning.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
            await page.keyboard.press('End');await page.waitForTimeout(150);assert.equal(await warning.evaluate(el=>el.scrollHeight<=el.clientHeight||el.scrollTop>0),true,'Long limitations cannot be scrolled');
            await page.locator('#turnInstructionWidget').focus();await page.keyboard.press('End');await page.waitForTimeout(150);
            const turn=page.locator('#turnInstructionWidget');assert.equal(await turn.evaluate(el=>el.scrollHeight<=el.clientHeight||el.scrollTop>0),true,'Long guidance cannot be scrolled');
            await page.locator('#dismissBestEffortWarning').click();assert.equal(await warning.isVisible(),false);
            await check();
            await page.locator('#endNavigationBtn').click();assert.equal(await page.evaluate(()=>window.stopped),1);
            await page.evaluate(()=>{document.body.classList.add('voyagr-has-offline-banner');const el=document.getElementById('bestEffortWarning');el.hidden=false;el.scrollTop=0;});
            await check();
            await page.close();console.log(`PASS ${width}x${height} ${theme} ${scale*100}% text: combined HUD, offline space, source label, scroll, dismiss and stop access`);
        }
    }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

/* Isolated UI acceptance: production markup/CSS, panel hydration and route cards.
 * Device/map/provider actions use fixtures; this is not live navigation acceptance.
 * Run: node scripts/check-route-preview-panel.cjs
 * Optional PREVIEW_SCREENSHOT_DIR saves captures outside the repository.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('@playwright/test');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const template=read('templates/index.html');
const panel=template.split('<!-- ROUTE PREVIEW TAB (NEW FEATURE) -->')[1].split('<!-- JOURNEY SUMMARY MODAL (NEW) -->')[0];
const app=read('static/js/voyagr-app.js');
const entrypoints=['startNavigation','startNavigationFromPreview'].map(name=>app.match(new RegExp('function '+name+'\\(\\) \\{[^\\n]+'))[0]).join('\n');
(async()=>{
    const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
    const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
    try{
        for(const [width,height,zoom] of [[320,640,1],[390,844,1],[844,390,1],[1280,800,1],[640,900,2]]){
            for(const theme of ['light','dark']){
                const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
                await page.route('**/*',route=>route.abort());
                await page.setContent(`<html class="${theme==='dark'?'dark-mode':''}"><head><style>${read('static/css/voyagr.css')}</style></head><body style="zoom:${zoom}"><div class="bottom-sheet expanded" style="max-width:440px"><div class="bottom-sheet-content">${panel}</div></div></body></html>`);
                for(const file of ['static/js/modules/map/map-theme.js','static/js/modules/navigation/route-selection.js','static/js/app/route-preview-orchestration.js'])await page.addScriptTag({content:read(file)});
                await page.addScriptTag({content:entrypoints});
                await page.evaluate(()=>{
                    const RS=window.VoyagrRouteSelection,Preview=window.VoyagrRoutePreviewOrchestration;
                    const routes=[{id:'a',name:'Fastest',distance_km:20,duration_minutes:35,fuel_cost:4,toll_cost:2,caz_cost:10,cameras_near_route:2},
                        {id:'b',name:'Quiet',distance_km:22,duration_minutes:40,fuel_cost:5,toll_cost:0,caz_cost:0,cameras_near_route:0}];
                    window.previewUiCalls=[];
                    window.showStatus=()=>{};
                    window.VoyagrJourneyModes={PROTOCOL:1,startNavigation:()=>{window.previewUiCalls.push('choose');return false;},startSimulation:()=>window.previewUiCalls.push('play')};
                    const render=index=>{
                        Preview.applyRoutePreviewPanelDomFromPlan(RS.buildRoutePreviewPanelDomApplyPlan(RS.buildRoutePreviewPanelApplyPlan({
                            routeData:routes[index],currencySymbol:'£',distanceText:index?'13.7 mi':'12.4 mi',startLabel:'Sheffield',endLabel:'Doncaster NCP',
                            routingMode:'auto',vehicleType:'petrol_diesel',routeOptionsCount:2,preferencesApplied:true
                        })));
                    };
                    Preview.bind({routeSelection:()=>RS,call:{selectRoute:index=>window.previewUiCalls.push('select:'+index),useRoute:render}});
                    document.getElementById('routePreviewTab').style.display='block';
                    document.getElementById('routePlanningNotice').textContent='Planning preview. Live navigation needs your current location.';
                    document.getElementById('routeAvoidanceNotice').textContent='Navigation refused: mandatory avoidance is unresolved.';
                    render(0);
                    const mount=RS.buildAlternativeRoutesPreviewMountPlans(routes,{currencySymbol:'£',distUnit:'mi',fuelUnit:'L',convertDistance:km=>(km*.621371).toFixed(1),routeColors:['#56328a','#164eaa']});
                    Preview.applyAlternativeRoutesPreviewDomFromPlan(RS.buildAlternativeRoutesPreviewDomApplyPlan(mount));
                    window.overviewRoute=()=>window.previewUiCalls.push('overview');
                    window.showRouteComparison=()=>window.previewUiCalls.push('compare');
                    window.findParkingNearDestination=()=>{window.previewUiCalls.push('parking');document.getElementById('parkingSection').style.display='block';document.getElementById('parkingList').textContent='Fixture parking result';};
                    window.showAllRoutes=()=>window.previewUiCalls.push('all');
                    window.switchTab=name=>window.previewUiCalls.push(name);
                    window.clearParkingSelection=()=>{document.getElementById('parkingSection').style.display='none';};
                });
                const overflow=()=>page.locator('.bottom-sheet-content').evaluate(el=>el.scrollWidth>el.clientWidth);
                assert.equal(await overflow(),false,`${width}px ${zoom}x ${theme}: horizontal overflow`);
                const info=page.locator('#previewRouteInfo');
                assert.equal(await info.evaluate(el=>el.open),false);
                for(const id of ['routePlanningNotice','routeAvoidanceNotice']) assert.equal(await page.locator('#'+id).isVisible(),false);
                await info.locator('summary').focus();await page.keyboard.press('Enter');
                for(const id of ['routePlanningNotice','routeAvoidanceNotice']) assert.equal(await page.locator('#'+id).isVisible(),true);
                await info.locator('summary').focus();await page.keyboard.press('Enter');
                assert.equal(await info.evaluate(el=>el.open),false);
                const safetyIds=['cazStatusContainer','hazardInfoContainer'];
                for(const id of safetyIds){
                    assert.equal(await page.locator('#'+id).isVisible(),true);
                    assert.equal(await page.locator('#'+id).evaluate(el=>el.closest('details')===null),true);
                }
                assert.equal(await page.locator('#previewTotalCost').textContent(),'£16.00');
                assert.equal(await page.locator('#previewFuelCost').isVisible(),false);
                for(const button of await page.locator('.preview-primary-actions button, .preview-quick-actions button').all()){
                    const b=await button.boundingBox();assert(b.width>=48&&b.height>=48);
                }
                if(process.env.PREVIEW_SCREENSHOT_DIR){
                    fs.mkdirSync(process.env.PREVIEW_SCREENSHOT_DIR,{recursive:true});
                    await page.screenshot({path:path.join(process.env.PREVIEW_SCREENSHOT_DIR,`route-preview-${width}-${zoom}-${theme}.png`)});
                }
                const nav=page.getByRole('button',{name:'Navigate',exact:true});
                await nav.focus();await page.keyboard.press('Enter');
                assert.deepEqual(await page.evaluate(()=>window.previewUiCalls),['choose']);
                assert.equal(await nav.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
                await page.getByRole('button',{name:'Play route preview',exact:true}).click();
                await page.getByRole('button',{name:'Parking',exact:true}).click();
                assert.equal(await page.locator('#parkingList').isVisible(),true);
                await page.getByRole('button',{name:'Clear parking selection',exact:true}).click();
                assert.equal(await page.locator('#parkingSection').isVisible(),false);
                await page.getByRole('button',{name:'Overview',exact:true}).click();
                await page.getByRole('button',{name:'Compare',exact:true}).click();
                const more=page.locator('#previewMoreTools summary');
                await more.focus();await page.keyboard.press('Enter');
                assert.equal(await page.getByRole('button',{name:'Route settings',exact:true}).isVisible(),true);
                await page.getByRole('button',{name:'Route settings',exact:true}).click();
                await page.getByRole('button',{name:'Modify route',exact:true}).click();
                await page.getByRole('button',{name:'Show all routes on map',exact:true}).click();
                await page.locator('#previewCostDetails summary').click();
                assert.equal(await page.locator('#previewFuelCost').isVisible(),true);
                await page.locator('#previewAlternativeRoutesList > div').nth(1).click();
                assert.equal(await page.locator('#previewDuration').textContent(),'40 min');
                assert.equal(await page.locator('#previewTotalCost').textContent(),'£5.00');
                assert.equal(await page.locator('#cazStatusContainer').isVisible(),false);
                assert.equal(await page.locator('#previewCostDetails').evaluate(el=>el.open),true);
                assert.equal(await page.locator('#routeAvoidanceNotice').textContent(),'Navigation refused: mandatory avoidance is unresolved.');
                assert.equal(await overflow(),false);
                assert.deepEqual(await page.evaluate(()=>window.previewUiCalls),['choose','play','parking','overview','compare','settings','navigation','all','select:1']);
                await page.close();
                console.log(`PASS ${width}x${height} ${zoom}x ${theme}: layout, disclosures, keyboard, actions and selected route hydration`);
            }
        }
    }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

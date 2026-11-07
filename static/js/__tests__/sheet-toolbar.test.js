const fs=require('fs'),path=require('path');
const template=fs.readFileSync(path.join(__dirname,'../../../templates/index.html'),'utf8');
const header=template.split('<div class="bottom-sheet-header">')[1].split('<div class="bottom-sheet-content">')[0];
const tabs=['navigation','settings','tripHistory','routeComparison','routeSharing','routeAnalytics','savedRoutes','routePreview','dashcam'];
let Sheet,Tab,Dom,calls;
beforeEach(()=>{
    jest.resetModules();
    document.body.innerHTML='<div id="bottomSheet" class="bottom-sheet"><div class="bottom-sheet-handle"></div><div class="bottom-sheet-header">'+header+'<div class="bottom-sheet-content">'+tabs.map(name=>`<div id="${name}Tab" style="display:${name==='navigation'?'block':'none'}"></div>`).join('')+'</div></div>';
    Dom=require('../modules/ui/dom-helpers.js');Sheet=require('../app/bottom-sheet-orchestration.js');Tab=require('../app/tab-navigation-orchestration.js');
    calls={};for(const name of ['loadRoutePreferences','loadMultiDropPreferences','loadVoicePreferences','loadPorcupineWakeUi','loadCameraAlertPreferences','loadAvoidancePreferences','loadHazardCameraTogglesFromApi','loadPromoEntitlementStatus','loadTripHistory','displayRouteComparison','prepareRouteSharing','loadRouteAnalytics','loadSavedRoutes','applyDomSelectsFromPlan'])calls[name]=jest.fn();
    Tab.bind({call:calls,units:()=>require('../modules/navigation/units.js'),getDistanceUnit:()=> 'mi',getCurrencyUnit:()=> 'GBP',getSpeedUnit:()=> 'mph',getTemperatureUnit:()=> 'celsius'});
    Sheet.bind({domHelpers:()=>Dom,getRouteInProgress:()=>false});
    global.switchTab=tab=>Tab.switchTab(tab);global.expandBottomSheet=()=>Sheet.expandBottomSheet();global.collapseBottomSheet=()=>Sheet.collapseBottomSheet();global.openVoyagerPremiumSection=jest.fn();
    document.querySelectorAll('[onclick]').forEach(el=>{el.onclick=new Function('event',el.getAttribute('onclick'));});
    Sheet.initBottomSheet();
});
afterEach(()=>{for(const name of ['switchTab','expandBottomSheet','collapseBottomSheet','openVoyagerPremiumSection'])delete global[name];jest.restoreAllMocks();});

test('all nine toolbar actions have named SVG controls and retain their existing handlers',()=>{
    const buttons=[...document.querySelectorAll('.sheet-toolbar button')];
    expect(buttons.map(button=>button.getAttribute('onclick'))).toEqual(["switchTab('savedRoutes')","switchTab('routeAnalytics')","switchTab('routeSharing')","switchTab('routeComparison')","switchTab('tripHistory')","switchTab('dashcam')",'openVoyagerPremiumSection()',"switchTab('settings')",'collapseBottomSheet()']);
    buttons.forEach(button=>{expect(button.type).toBe('button');expect(button.getAttribute('aria-label')).toBeTruthy();expect(button.querySelector('svg').getAttribute('aria-hidden')).toBe('true');expect(button.querySelector('.sheet-tool-label').textContent).toBeTruthy();});
});

test('selecting a toolbar page reveals it, updates the current-page marker and retains collapse',()=>{
    document.querySelector('[data-sheet-tab="savedRoutes"]').click();
    expect(document.getElementById('bottomSheet').classList.contains('expanded')).toBe(true);
    expect(document.getElementById('savedRoutesTab').style.display).toBe('block');expect(calls.loadSavedRoutes).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[aria-current="page"]').dataset.sheetTab).toBe('savedRoutes');
    document.querySelector('[data-sheet-tab="tripHistory"]').click();
    expect(document.getElementById('savedRoutesTab').style.display).toBe('none');expect(calls.loadTripHistory).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(document.querySelector('[aria-current="page"]').dataset.sheetTab).toBe('tripHistory');
    Tab.switchTab('navigation');expect(document.querySelector('[aria-current="page"]')).toBeNull();
    document.querySelector('.sheet-icon-btn--collapse').click();expect(document.getElementById('bottomSheet').classList.contains('expanded')).toBe(false);
});

test('toolbar surfaces and SVG targets are excluded from sheet drag/tap gestures while handle still works',()=>{
    const selector=Dom.buildBottomSheetFullInitOrchestrationPlan(true,true).headerButtonIgnoreSelector;
    const toolbar=document.querySelector('.sheet-toolbar'),svg=toolbar.querySelector('svg path');
    expect(Dom.closest(toolbar,selector)).toBe(toolbar);expect(Dom.closest(svg,selector)).not.toBeNull();
    toolbar.click();expect(document.getElementById('bottomSheet').classList.contains('expanded')).toBe(false);
    document.querySelector('.bottom-sheet-handle').click();expect(document.getElementById('bottomSheet').classList.contains('expanded')).toBe(true);
    toolbar.click();expect(document.getElementById('bottomSheet').classList.contains('expanded')).toBe(true);
});

test('Share, route options, Dashcam, Settings and Premium keep their distinct action paths',()=>{
    for(const name of ['routeSharing','routeComparison','dashcam','settings']){
        document.querySelector(`[data-sheet-tab="${name}"]`).click();
        expect(document.getElementById(name+'Tab').style.display).toBe('block');
        expect(document.querySelector('[aria-current="page"]').dataset.sheetTab).toBe(name);
    }
    expect(calls.prepareRouteSharing).toHaveBeenCalledTimes(1);expect(calls.displayRouteComparison).toHaveBeenCalledTimes(1);
    expect(calls.loadPromoEntitlementStatus).toHaveBeenCalledTimes(1);
    document.querySelector('.sheet-icon-btn--premium').click();expect(global.openVoyagerPremiumSection).toHaveBeenCalledTimes(1);
});

const fs=require('fs'),path=require('path');
const template=fs.readFileSync(path.join(__dirname,'../../../templates/index.html'),'utf8');
const menu=template.split('<!-- Map action menu (bottom-right hamburger) -->')[1].split('<div id="mapControlsHintModal"')[0];
const poi=template.split('<!-- Quick Search Buttons -->')[1].split('<div id="alongRouteSearch"')[0];
let Nav,T,MC,Recenter,Overview;
beforeEach(()=>{
    jest.resetModules();jest.useFakeTimers();jest.spyOn(Date,'now').mockReturnValue(1000);
    document.body.innerHTML=menu+poi;
    global.VoyagrNavMenu=require('../modules/ui/nav-menu.js');
    Nav=require('../app/nav-menu-orchestration.js');T=require('../modules/ui/toggle-ui.js');MC=require('../modules/map/map-controls.js');
    Recenter=require('../app/map-recenter-orchestration.js');Recenter.bind({mapControls:()=>MC});
    Overview=require('../app/journey-overview-orchestration.js');Overview.bind({mapControls:()=>MC});
});
afterEach(()=>{jest.restoreAllMocks();jest.useRealTimers();delete global.VoyagrNavMenu;delete global.VoyagrMapOverlayOrchestration;delete global.VoyagrVoiceControlOrchestration;});

test('opening the menu reflects restored owner states without toggling preferences',()=>{
    const cameras=jest.fn(()=>false),voice=jest.fn(()=>true);
    global.VoyagrMapOverlayOrchestration={getShowCamerasEnabled:cameras};
    global.VoyagrVoiceControlOrchestration={getIsListening:voice};
    Recenter.setZoomAndFollowEnabled(false);Overview.setJourneyOverviewActive(true);
    Nav.initNavMenu();document.getElementById('navMenuToggle').click();
    expect(document.getElementById('showCamerasFab').getAttribute('aria-pressed')).toBe('false');
    expect(document.getElementById('zoomFollowToggle').getAttribute('aria-pressed')).toBe('false');
    expect(document.getElementById('journeyOverviewBtn').getAttribute('aria-pressed')).toBe('true');
    expect(document.getElementById('voiceFab').getAttribute('aria-pressed')).toBe('true');
    expect(cameras).toHaveBeenCalledTimes(1);expect(voice).toHaveBeenCalledTimes(1);
    expect(Recenter.getZoomAndFollowEnabled()).toBe(false);
    expect(Overview.getJourneyOverviewActive()).toBe(true);
});

test('production SVG disclosure enters visible actions by keyboard and Escape restores toggle focus',()=>{
    Nav.initNavMenu();const toggle=document.getElementById('navMenuToggle');
    const icons=toggle.querySelector('[data-nav-menu-icons]');
    toggle.focus();toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Close map actions');
    expect(toggle.querySelector('[data-nav-menu-label]').textContent).toBe('Close');
    expect(toggle.querySelector('[data-nav-menu-icons]')).toBe(icons);
    expect(document.activeElement.id).toBe('startTrackingBtn');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    expect(document.getElementById('navControlButtons').hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.querySelector('[data-nav-menu-label]').textContent).toBe('Map');
    expect(document.activeElement).toBe(toggle);
    expect(toggle.querySelectorAll('svg')).toHaveLength(2);
});

test('toggle states preserve SVGs and labels through camera, follow and overview updates',()=>{
    const camera=document.getElementById('showCamerasFab'),follow=document.getElementById('zoomFollowToggle'),overview=document.getElementById('journeyOverviewBtn');
    const icons=[camera,follow,overview].map(button=>button.querySelector('svg'));
    T.applyToggleButton(camera,false);Recenter.applyZoomFollowButtonUi(follow,false);Overview.applyJourneyOverviewButtonUi(overview,true);
    expect(camera.getAttribute('aria-pressed')).toBe('false');
    expect(follow.getAttribute('aria-pressed')).toBe('false');
    expect(overview.getAttribute('aria-pressed')).toBe('true');
    expect(overview.title).toBe('Return to Navigation View');
    T.applyToggleButton(camera,true);Recenter.applyZoomFollowButtonUi(follow,true);Overview.applyJourneyOverviewButtonUi(overview,false);
    expect(camera.getAttribute('aria-pressed')).toBe('true');expect(follow.getAttribute('aria-pressed')).toBe('true');
    expect(overview.getAttribute('aria-pressed')).toBe('false');
    [camera,follow,overview].forEach((button,index)=>{
        expect(button.querySelector('svg')).toBe(icons[index]);
        expect(button.querySelector('.map-action-label').textContent.length).toBeGreaterThan(0);
    });
    const action=document.getElementById('currentLocationFab');T.applyToggleButton(action,true);
    expect(action.hasAttribute('aria-pressed')).toBe(false);
});

test('map action visibility and existing handlers survive the icon refresh',()=>{
    const handlers={startTrackingBtn:'startGPSTracking()',startNavBtn:'startNavigationFromPreview()',zoomFollowToggle:'toggleZoomAndFollow()',
        recenterVehicleFab:'recenterOnVehicle()',journeyOverviewBtn:'toggleJourneyOverview()',currentLocationFab:'getCurrentLocation()',
        voiceFab:'toggleVoiceInput()',showCamerasFab:'toggleShowCameras()',roadReportFab:'openRoadReportModal()',
        mapControlsHintFab:'openMapControlsHintModal()',endNavigationBtn:'stopTurnByTurnNavigation()'};
    Object.entries(handlers).forEach(([id,handler])=>{
        const button=document.getElementById(id);
        expect(button.getAttribute('onclick')).toBe(handler);expect(button.type).toBe('button');
        expect(button.getAttribute('aria-label')).toBeTruthy();
        expect(button.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    });
    ['startNavBtn','zoomFollowToggle','recenterVehicleFab','journeyOverviewBtn','endNavigationBtn'].forEach(id=>expect(document.getElementById(id).style.display).toBe('none'));
    expect(document.getElementById('endNavigationBtn').closest('#navControlButtons')).toBeNull();
    expect(document.getElementById('startNavBtn').closest('#navControlButtons')).toBeNull();
    expect(document.getElementById('startNavBtn').getAttribute('onclick')).toBe('startNavigationFromPreview()');
    expect(document.getElementById('startNavBtn').getAttribute('aria-controls')).toBe('journeyModeChooser');
    expect(document.getElementById('startNavBtn').hasAttribute('data-journey-choose')).toBe(true);
});

test('nearby Parking and every POI category remain labelled direct buttons',()=>{
    const buttons=[...document.querySelectorAll('.map-poi-shortcuts button')];
    expect(buttons.map(button=>button.getAttribute('onclick'))).toEqual(['parking','fuel','food','charging','pharmacy','hospital','groceries'].map(category=>`quickSearch('${category}')`));
    expect(buttons[0].textContent.trim()).toBe('Parking');
    buttons.forEach(button=>{expect(button.type).toBe('button');expect(button.closest('details')).toBeNull();expect(button.querySelector('svg').getAttribute('aria-hidden')).toBe('true');});
});

test('floating Start remains outside collapsed actions and uses the preview journey chooser guard',()=>{
    Nav.initNavMenu();
    const button=document.getElementById('startNavBtn');
    button.style.display='flex';
    const app=fs.readFileSync(path.join(__dirname,'../voyagr-app.js'),'utf8');
    const declarations=['startNavigation','startNavigationFromPreview'].map(name=>app.match(new RegExp('function '+name+'\\(\\) \\{[^\\n]+'))[0]).join('\n');
    const choose=jest.fn(()=>false),showStatus=jest.fn();
    global.VoyagrJourneyModes={PROTOCOL:1,choose};
    global.startNavigationFromPreview=new Function('showStatus',declarations+';return startNavigationFromPreview;')(showStatus);
    button.onclick=new Function(button.getAttribute('onclick'));
    button.click();
    expect(choose).toHaveBeenCalledTimes(1);
    expect(document.getElementById('navControlButtons').hidden).toBe(true);
    expect(button.style.display).toBe('flex');
    delete global.VoyagrJourneyModes;
    button.click();
    expect(choose).toHaveBeenCalledTimes(1);
    expect(showStatus).toHaveBeenCalledWith(expect.stringMatching(/unavailable/),'warning');
    delete global.startNavigationFromPreview;
});

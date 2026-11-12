const fs=require('fs'),path=require('path');
const RS=require('../modules/navigation/route-selection.js');
const Preview=require('../app/route-preview-orchestration.js');
const template=fs.readFileSync(path.join(__dirname,'../../../templates/index.html'),'utf8');
const panel=template.split('<!-- ROUTE PREVIEW TAB (NEW FEATURE) -->')[1].split('<!-- JOURNEY SUMMARY MODAL (NEW) -->')[0];
function apply(route,options={}){
    Preview.applyRoutePreviewPanelDomFromPlan(RS.buildRoutePreviewPanelDomApplyPlan(RS.buildRoutePreviewPanelApplyPlan({
        routeData:route,currencySymbol:'£',distanceText:'12.4 mi',startLabel:'Sheffield',endLabel:'Doncaster',
        routingMode:'auto',vehicleType:'petrol_diesel',routeOptionsCount:2,preferencesApplied:true,...options
    })));
}
beforeEach(()=>{
    document.body.innerHTML=panel;
    Preview.bind({routeSelection:()=>RS});
});
afterEach(()=>{delete global.startNavigationFromPreview;delete global.VoyagrJourneyModes;});

test('selected-route metrics and all costs hydrate while details remain collapsed',()=>{
    apply({distance_km:20,duration_minutes:35,fuel_cost:4,toll_cost:2,caz_cost:10,fuel_litres:2.5});
    expect(document.getElementById('previewDuration').textContent).toBe('35 min');
    expect(document.getElementById('previewDistance').textContent).toBe('12.4 mi');
    expect(document.getElementById('previewDistance').dataset.km).toBe('20');
    expect(document.getElementById('previewRoute').textContent).toBe('Sheffield → Doncaster');
    expect(document.getElementById('previewTotalCost').textContent).toBe('£16.00');
    expect(document.getElementById('previewFuelCost').textContent).toBe('£4.00');
    expect(document.getElementById('previewTollCost').textContent).toBe('£2.00');
    expect(document.getElementById('previewCAZCost').textContent).toBe('£10.00');
    expect(document.getElementById('previewRoutingMode').textContent).toBe('Auto');
    expect(document.getElementById('previewVehicleType').textContent).toBe('Petrol Diesel');
    expect(document.getElementById('previewCostDetails').open).toBe(false);
    expect(document.getElementById('previewTotalCost').closest('summary')).not.toBeNull();
    document.getElementById('previewCostDetails').open=true;
    apply({distance_km:22,duration_minutes:38,fuel_cost:5,toll_cost:0,caz_cost:0},{distanceText:'13.7 mi'});
    expect(document.getElementById('previewTotalCost').textContent).toBe('£5.00');
    expect(document.getElementById('previewDuration').textContent).toBe('38 min');
    expect(document.getElementById('previewCostDetails').open).toBe(true);
    expect(document.getElementById('cazStatusContainer').style.display).toBe('none');
    expect(document.getElementById('previewRoutingEngineRow').style.display).toBe('none');
});

test('technical route information is collapsed while costs, preferences and actions remain accessible',()=>{
    const planning=document.getElementById('routePlanningNotice'),avoidance=document.getElementById('routeAvoidanceNotice');
    planning.textContent='Planning only';avoidance.textContent='Navigation refused: mandatory avoidance unresolved';
    apply({fuel_cost:1,caz_cost:10,provider_limitations:['Requested preference unavailable'],
        avoidance_assessment:{status:'NO_COMPLIANT_ROUTE'}});
    document.querySelectorAll('details').forEach(el=>{el.open=false;});
    const info=document.getElementById('previewRouteInfo');
    expect(info.open).toBe(false);
    expect(info.querySelector('summary').getAttribute('aria-label')).toBe('Route information');
    for(const id of ['routePlanningNotice','routeTrafficLightStatus','routeMapRenderStatus','routeSpeedLimitStatus','routeAvoidanceNotice','arrivalEndpointPreview']){
        expect(document.getElementById(id).closest('details')).toBe(info);
    }
    info.open=true;
    apply({fuel_cost:1,caz_cost:10,provider_limitations:['Requested preference unavailable'],avoidance_assessment:{status:'NO_COMPLIANT_ROUTE'}});
    expect(info.open).toBe(true);
    for(const id of ['cazStatusContainer','hazardInfoContainer','parkingSection','previewAlternativeRoutesContainer']){
        expect(document.getElementById(id).closest('details')).toBeNull();
    }
    expect(avoidance.textContent).toMatch(/Navigation refused/);
    expect(planning.textContent).toBe('Planning only');
    expect(document.getElementById('cazStatusContainer').textContent).toMatch(/CAZ charge included/);
    expect(document.getElementById('cazStatusContainer').style.display).toBe('block');
    expect(document.querySelector('#hazardInfoContainer h4').textContent).toMatch(/preferences limited/);
    expect(document.getElementById('hazardInfoContainer').style.display).toBe('block');
});

test('Navigate uses the immediate startup owner rather than granting live permission',()=>{
    const app=fs.readFileSync(path.join(__dirname,'../voyagr-app.js'),'utf8');
    const declarations=['startNavigation','startNavigationFromPreview'].map(name=>app.match(new RegExp('function '+name+'\\(\\) \\{[^\\n]+'))[0]).join('\n');
    const start=jest.fn(()=>false),showStatus=jest.fn();
    global.VoyagrJourneyModes={PROTOCOL:1,startNavigation:start};
    global.startNavigationFromPreview=new Function('showStatus',declarations+';return startNavigationFromPreview;')(showStatus);
    const button=document.querySelector('#routePreviewTab [data-journey-choose]');
    button.onclick=new Function(button.getAttribute('onclick'));
    button.click();expect(start).toHaveBeenCalledTimes(1);expect(showStatus).not.toHaveBeenCalled();
    delete global.VoyagrJourneyModes;
    button.click();expect(start).toHaveBeenCalledTimes(1);
    expect(showStatus).toHaveBeenCalledWith(expect.stringMatching(/unavailable/),'warning');
});

test('secondary tools retain their handlers and parking and route choices remain outside More',()=>{
    const more=document.getElementById('previewMoreTools');
    expect(more.open).toBe(false);
    expect([...more.querySelectorAll('button')].map(b=>b.getAttribute('onclick'))).toEqual([
        'showAllRoutes()',"switchTab('settings')","switchTab('navigation')"
    ]);
    expect(document.querySelector('[onclick="findParkingNearDestination()"]')).not.toBeNull();
    expect(document.querySelector('[onclick="showRouteComparison()"]')).not.toBeNull();
    expect(document.querySelector('[onclick="overviewRoute()"]')).not.toBeNull();
    const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);
    expect(new Set(ids).size).toBe(ids.length);
    Preview.applyAlternativeRoutesPreviewDomFromPlan({showContainer:true,containerDisplay:'block',cardPlans:[{
        containerStyle:'',html:'<span>Alternative route</span>',hoverStyle:{},restStyle:{}
    }]});
    expect(document.getElementById('previewAlternativeRoutesList').textContent).toBe('Alternative route');
    expect(document.getElementById('previewAlternativeRoutesContainer').style.display).toBe('block');
    apply({distance_km:1},{routeOptionsCount:1});
    expect(document.getElementById('previewAlternativeRoutesContainer').style.display).toBe('none');
});

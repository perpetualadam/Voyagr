const Toggles=require('../modules/map/map-layer-toggles.js');
const Recovery=require('../modules/map/map-recovery.js');
const Selection=require('../modules/navigation/route-selection.js');
let Layers,map,style,sources,layers,handlers,baseSource,routeSource;
beforeEach(()=>{
    jest.useFakeTimers();jest.setSystemTime(1000000);localStorage.clear();
    jest.spyOn(console,'log').mockImplementation(()=>{});jest.spyOn(console,'warn').mockImplementation(()=>{});
    jest.isolateModules(()=>{Layers=require('../app/map-layers-orchestration.js');});
    baseSource={type:'vector'};routeSource={type:'geojson',data:{}};
    sources=new Map([['openmaptiles',baseSource],['route-source-0',routeSource]]);
    layers=new Map([['road_label',{id:'road_label'}],['route-layer-0',{id:'route-layer-0'}]]);
    handlers={};
    style={version:8,name:'main',sources:{openmaptiles:baseSource},layers:[{id:'road_label',type:'symbol',layout:{'text-field':'name'}}]};
    map={getStyle:()=>style,isStyleLoaded:()=>false,getSource:id=>sources.get(id),getLayer:id=>layers.get(id),
        addSource:jest.fn((id,spec)=>sources.set(id,spec)),addLayer:jest.fn(spec=>layers.set(spec.id,spec)),
        removeSource:jest.fn(id=>sources.delete(id)),removeLayer:jest.fn(id=>layers.delete(id)),
        once:(event,callback)=>{handlers[event]=callback;}};
    window.VoyagrMapRecovery=Recovery;window.VOYAGR_TOMTOM_TRAFFIC_PROXY=true;
    window[Toggles.TRAFFIC_PENDING_GUARD_PROPERTY]=false;
    Layers.bind({getMap:()=>map,mapLayerToggles:()=>Toggles,routeSelection:()=>Selection,
        toggleUI:()=>({applyToggleButton:jest.fn(),writeBoolPref:jest.fn()}),
        call:{bringRoutesToTop:jest.fn(),showStatus:jest.fn(),saveAllSettings:jest.fn()}});
});
afterEach(()=>{jest.clearAllTimers();jest.useRealTimers();jest.restoreAllMocks();delete window.VoyagrMapRecovery;delete window.VOYAGR_TOMTOM_TRAFFIC_PROXY;});
function throttle(){for(let i=0;i<3;i++)window.voyagrOnTrafficTileLoadError(429);}

test('rate limiting removes only traffic and blocks reinitialization until the full cooldown',()=>{
    Layers.addTrafficLayer();throttle();
    expect(map.removeSource).toHaveBeenCalledWith('traffic-source');
    expect(map.removeLayer).toHaveBeenCalledWith('traffic-layer');
    expect(sources.get('openmaptiles')).toBe(baseSource);expect(sources.get('route-source-0')).toBe(routeSource);
    expect(layers.has('road_label')).toBe(true);expect(layers.has('route-layer-0')).toBe(true);
    map.addSource.mockClear();map.addLayer.mockClear();
    Layers.addTrafficLayer();Layers.initTrafficLayer();
    jest.advanceTimersByTime(119999);Layers.addTrafficLayer();
    expect(map.addSource).not.toHaveBeenCalled();expect(map.addLayer).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(map.addSource).toHaveBeenCalledTimes(1);expect(map.addLayer).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(120000);expect(map.addLayer).toHaveBeenCalledTimes(1);
});
test('traffic disabled during cooldown stays off when retry becomes due',()=>{
    Layers.addTrafficLayer();throttle();map.addLayer.mockClear();
    Layers.toggleTrafficLayer();jest.advanceTimersByTime(120000);
    expect(Layers.getShowTrafficEnabled()).toBe(false);expect(map.addLayer).not.toHaveBeenCalled();
});
test('off/on toggling during cooldown cannot bypass the pause',()=>{
    Layers.addTrafficLayer();throttle();map.addLayer.mockClear();
    Layers.toggleTrafficLayer();Layers.toggleTrafficLayer();
    expect(Layers.getShowTrafficEnabled()).toBe(true);expect(map.addLayer).not.toHaveBeenCalled();
    jest.advanceTimersByTime(120000);expect(map.addLayer).toHaveBeenCalledTimes(1);
});
test('a previously queued style callback cannot recreate traffic during cooldown',()=>{
    const ready=style;style=undefined;Layers.addTrafficLayer();
    expect(map.addLayer).not.toHaveBeenCalled();throttle();style=ready;
    handlers['style.load']();jest.advanceTimersByTime(119999);
    expect(map.addLayer).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);expect(map.addLayer).toHaveBeenCalledTimes(1);
});
test('late errors do not shorten the active cooldown or create duplicate retry timers',()=>{
    Layers.addTrafficLayer();throttle();map.addLayer.mockClear();
    jest.advanceTimersByTime(60000);throttle();throttle();
    jest.advanceTimersByTime(59999);expect(map.addLayer).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);expect(map.addLayer).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(120000);expect(map.addLayer).toHaveBeenCalledTimes(1);
});
test('unrelated HTTP errors do not disable the traffic layer',()=>{
    Layers.addTrafficLayer();for(let i=0;i<4;i++)window.voyagrOnTrafficTileLoadError(404);
    expect(map.removeLayer).not.toHaveBeenCalled();expect(layers.has('traffic-layer')).toBe(true);
});

test('late errors from removed tiles do not poison the next traffic retry',()=>{
    Layers.addTrafficLayer();throttle();jest.advanceTimersByTime(1000);
    throttle();jest.advanceTimersByTime(119000);
    expect(layers.has('traffic-layer')).toBe(true);
    window.voyagrOnTrafficTileLoadError(429);
    expect(layers.has('traffic-layer')).toBe(true);
    window.voyagrOnTrafficTileLoadError(429);
    expect(layers.has('traffic-layer')).toBe(true);
    window.voyagrOnTrafficTileLoadError(429);
    expect(layers.has('traffic-layer')).toBe(false);
});

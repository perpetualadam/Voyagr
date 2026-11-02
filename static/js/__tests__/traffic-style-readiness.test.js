const Layers=require('../app/map-layers-orchestration.js');
const Toggles=require('../modules/map/map-layer-toggles.js');
const Recovery=require('../modules/map/map-recovery.js');
const Selection=require('../modules/navigation/route-selection.js');
let map,style,handlers,sources,layers;
beforeEach(()=>{
    jest.useFakeTimers();localStorage.clear();
    jest.spyOn(console,'log').mockImplementation(()=>{});
    jest.spyOn(console,'warn').mockImplementation(()=>{});
    handlers={};sources=new Map();layers=new Map();
    style={version:8,name:'main-map',sources:{openmaptiles:{type:'vector',tiles:['/map/data/gb/{z}/{x}/{y}.pbf']}},layers:[{id:'road_label',type:'symbol',layout:{'text-field':'name'}}]};
    map={getStyle:()=>style,isStyleLoaded:()=>false,getSource:id=>sources.get(id),getLayer:id=>layers.get(id),
        addSource:jest.fn((id,spec)=>sources.set(id,spec)),addLayer:jest.fn(spec=>layers.set(spec.id,spec)),
        removeSource:jest.fn(id=>sources.delete(id)),removeLayer:jest.fn(id=>layers.delete(id)),
        once:(event,callback)=>{handlers[event]=callback;}};
    window.VoyagrMapRecovery=Recovery;window.VOYAGR_TOMTOM_TRAFFIC_PROXY=true;
    window[Toggles.TRAFFIC_PENDING_GUARD_PROPERTY]=false;
    Layers.setTrafficLayer(null);Layers.setShowTrafficEnabled(true);
    Layers.bind({getMap:()=>map,mapLayerToggles:()=>Toggles,routeSelection:()=>Selection,
        toggleUI:()=>({applyToggleButton:jest.fn()}),call:{bringRoutesToTop:jest.fn()}});
});
afterEach(()=>{jest.clearAllTimers();jest.useRealTimers();jest.restoreAllMocks();delete window.VoyagrMapRecovery;delete window.VOYAGR_TOMTOM_TRAFFIC_PROXY;});
test('traffic mounts once on a usable definition while base tiles are still loading',()=>{
    Layers.addTrafficLayer();
    expect(map.addSource).toHaveBeenCalledWith('traffic-source',expect.objectContaining({type:'raster'}));
    expect(map.addLayer).toHaveBeenCalledTimes(1);
    expect(map.addLayer.mock.calls[0][0].id).toBe('traffic-layer');
    jest.advanceTimersByTime(60000);
    expect(map.addLayer).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
});
test('bootstrap style never receives an early traffic source or layer',()=>{
    style={version:8,name:'voyagr-bootstrap',sources:{},layers:[{id:'background',type:'background'}]};
    Layers.initTrafficLayer();jest.advanceTimersByTime(60000);
    expect(map.addSource).not.toHaveBeenCalled();expect(map.addLayer).not.toHaveBeenCalled();
});
test('a style-load callback can mount traffic even while isStyleLoaded remains false',()=>{
    style=undefined;Layers.addTrafficLayer();
    expect(map.addSource).not.toHaveBeenCalled();
    style={version:8,sources:{},layers:[{id:'background',type:'background'}]};
    handlers['style.load']();jest.advanceTimersByTime(60000);
    expect(map.addLayer).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
});
test('an absent style is still deferred rather than adding layers prematurely',()=>{
    style=undefined;Layers.addTrafficLayer();
    expect(map.addSource).not.toHaveBeenCalled();expect(map.addLayer).not.toHaveBeenCalled();
});

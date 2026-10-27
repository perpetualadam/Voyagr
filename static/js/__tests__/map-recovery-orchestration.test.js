const fs=require('fs');
const vm=require('vm');
const parser=require('@babel/parser');
const source=fs.readFileSync(require.resolve('../voyagr-core.js'),'utf8');
const body=parser.parse(source).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='initializeMap').body.body;
function harness(){
    const handlers={};
    const sources=Object.fromEntries(['openmaptiles','natural_earth_shaded_relief','traffic-source'].map(id=>[id,{setTiles:jest.fn()}]));
    const style={sources:Object.fromEntries(Object.keys(sources).map(id=>[id,{type:'raster',tiles:['/tiles/{z}/{x}/{y}']} ])),layers:[{id:'route'},{id:'camera'},{id:'traffic'}]};
    const map={getStyle:()=>style,getSource:id=>sources[id],resize:jest.fn(),triggerRepaint:jest.fn(),jumpTo:jest.fn(),getCenter:()=>({lng:0,lat:0}),getZoom:()=>10,getBearing:()=>0,getPitch:()=>0,isStyleLoaded:()=>true,areTilesLoaded:()=>true,loaded:()=>true,setStyle:jest.fn(),on:(event,fn)=>{(handlers[event]||=[]).push(fn);},once:(event,fn)=>{(handlers[event]||=[]).push(fn);}};
    const context={map,window:{VoyagrMapRecovery:require('../modules/map/map-recovery.js')},document:{visibilityState:'visible'},console,Date,Map,Set,setTimeout,clearTimeout,requestAnimationFrame:fn=>setTimeout(fn,16),voyagrMapShouldSkipAggressiveRecovery:()=>false,voyagrMapIsBootstrapStyle:()=>false,voyagrMapCameraRecoveryOpts:()=>({isMapMoving:false,msSinceLastMapMove:10000}),getMapRenderDiagnostics:()=>({}),maybeFallbackToRasterStyle:jest.fn()};
    vm.createContext(context);
    const selected=[];
    for(const n of body){
        const fn=n.type==='FunctionDeclaration' && /^voyagrMap(ResizeAndRepaint|ForceReloadAllSources|RecoverAfterNetworkEvent|SoftStyleReload|InvalidateRecovery)$/.test(n.id.name);
        const vars=n.type==='VariableDeclaration' && n.declarations.some(d=>['_mapErrorCount','_MAX_LOGGED_ERRORS','__MAP_STYLE_RELOAD_MIN_GAP_MS','__MAP_MAX_STYLE_RELOADS'].includes(d.id.name));
        const on=n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&source.slice(n.start,n.end).startsWith("map.on('error'");
        const invalidator=n.type==='ExpressionStatement'&&source.slice(n.start,n.end).includes("map.on('style.load', voyagrMapInvalidateRecovery)");
        if(fn||vars||on||invalidator)selected.push(source.slice(n.start,n.end));
    }
    vm.runInContext(selected.join('\n'),context);
    return {context,map,sources,style,emit:(event,data)=>(handlers[event]||[]).forEach(fn=>fn(data))};
}
beforeEach(()=>{jest.useFakeTimers();jest.setSystemTime(1000000);jest.spyOn(console,'log').mockImplementation(()=>{});jest.spyOn(console,'warn').mockImplementation(()=>{});jest.spyOn(console,'debug').mockImplementation(()=>{});});
afterEach(()=>{jest.useRealTimers();jest.restoreAllMocks();});
test('healthy focus/visibility/network burst never resets any tile source or style',()=>{
    const h=harness();
    for(const reason of ['focus','visible','networkinformation']){h.context.voyagrMapRecoverAfterNetworkEvent(reason);jest.advanceTimersByTime(800);}
    jest.advanceTimersByTime(15000);
    Object.values(h.sources).forEach(s=>expect(s.setTiles).not.toHaveBeenCalled());
    expect(h.map.setStyle).not.toHaveBeenCalled();
    expect(h.map.getStyle()).toBe(h.style);
    expect(console.log.mock.calls.filter(c=>String(c[0]).includes('recover after connectivity'))).toHaveLength(1);
});
test('only failed tile source reloads, expected abort does not hide a genuine HTTP failure',()=>{
    const h=harness();
    h.emit('error',{sourceId:'traffic-source',error:{name:'Error',message:'HTTP (503)'}});
    h.context.voyagrMapRecoverAfterNetworkEvent('online');jest.advanceTimersByTime(300);
    expect(h.sources['traffic-source'].setTiles).toHaveBeenCalledTimes(1);
    expect(h.sources.openmaptiles.setTiles).not.toHaveBeenCalled();
    expect(h.style.layers.map(layer=>layer.id)).toEqual(['route','camera','traffic']);
    console.warn.mockClear();
    h.emit('error',{sourceId:'traffic-source',error:{name:'AbortError',message:'aborted'}});
    expect(console.warn).not.toHaveBeenCalled();
    h.emit('error',{sourceId:'traffic-source',error:{name:'Error',message:'HTTP (500)'}});
    expect(console.warn).toHaveBeenCalled();
});
test('style change invalidates queued recovery work',()=>{
    const h=harness();h.context.voyagrMapRecoverAfterNetworkEvent('online');
    h.emit('style.load');jest.advanceTimersByTime(15000);
    Object.values(h.sources).forEach(s=>expect(s.setTiles).not.toHaveBeenCalled());
    expect(h.map.jumpTo).not.toHaveBeenCalled();
});
test('resize burst yields one resize rather than twenty',()=>{
    const h=harness();for(let i=0;i<20;i++)h.context.voyagrMapResizeAndRepaint();
    jest.advanceTimersByTime(40);expect(h.map.resize).toHaveBeenCalledTimes(1);
});
test('unrelated or expired aborts remain visible',()=>{
    const h=harness();
    h.emit('error',{sourceId:'openmaptiles',error:{name:'AbortError',message:'unexpected abort'}});
    expect(console.warn).toHaveBeenCalled();console.warn.mockClear();
    h.emit('error',{sourceId:'traffic-source',error:{name:'Error',message:'HTTP (503)'}});
    h.context.voyagrMapRecoverAfterNetworkEvent('online');jest.advanceTimersByTime(2500);console.warn.mockClear();
    h.emit('error',{sourceId:'traffic-source',error:{name:'AbortError',message:'late abort'}});
    expect(console.warn).toHaveBeenCalled();
});
test('superseded map configuration cannot be overwritten by queued recovery',()=>{
    const h=harness();h.context.voyagrMapRecoverAfterNetworkEvent('online');
    h.style.sources.openmaptiles.tiles=['/new-style/{z}/{x}/{y}'];jest.advanceTimersByTime(15000);
    Object.values(h.sources).forEach(s=>expect(s.setTiles).not.toHaveBeenCalled());
    expect(h.map.setStyle).not.toHaveBeenCalled();
});
test('soft reload never restores a stale camera after user movement',()=>{
    const h=harness();h.context.voyagrMapSoftStyleReload('broken style');
    h.emit('style.load');expect(h.map.jumpTo).not.toHaveBeenCalled();
});
test('confirmed unloaded-source retry excludes healthy sources and geojson overlays',()=>{
    const h=harness();h.map.isSourceLoaded=id=>id!=='openmaptiles';
    h.style.sources.route={type:'geojson',data:{}};
    h.context.voyagrMapForceReloadAllSources('confirmed stuck',true);
    expect(h.sources.openmaptiles.setTiles).toHaveBeenCalledTimes(1);
    expect(h.sources['traffic-source'].setTiles).not.toHaveBeenCalled();
    expect(h.map.setStyle).not.toHaveBeenCalled();
});

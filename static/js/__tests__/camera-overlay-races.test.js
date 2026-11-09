const OT=require('../modules/map/map-overlay-toggles');
const HM=require('../modules/map/hazard-map-markers');
const CAM=require('../modules/map/camera-map-markers');
let owner,map,bounds,move,mounted;
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const response=()=>({ok:true,status:200,json:async()=>({success:true,cameras:[{lat:53.5,lon:-1.19,type:'red_light'}]})});
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
beforeEach(()=>{
 jest.resetModules();jest.useFakeTimers();localStorage.clear();delete window.__voyagrCameraLayerInitialized;window.cameraMarkers=[];
 jest.spyOn(console,'log').mockImplementation(()=>{});jest.spyOn(console,'warn').mockImplementation(()=>{});
 bounds={getNorth:()=>53.51,getSouth:()=>53.49,getEast:()=>-1.18,getWest:()=>-1.2};
 map={getBounds:()=>bounds,getZoom:()=>16,on:(_event,handler)=>{move=handler;}};
 mounted=[];global.fetch=jest.fn();owner=require('../app/map-overlay-orchestration');
 owner.bind({getMap:()=>map,mapOverlayToggles:()=>OT,hazardMapMarkers:()=>HM,cameraMapMarkers:()=>CAM,
 toggleUI:()=>({writeBoolPref:jest.fn(),applyToggleButton:jest.fn(),applyLabeledToggleButton:jest.fn()}),
 getMapLibreHelpers:()=>({createMarker:()=>({addTo(){mounted.push(this);return this;},remove:jest.fn()})}),call:{saveAllSettings:jest.fn()}});
 owner.setShowOsmTrafficLightsEnabled(false);owner.setShowOsmRailwayCrossingsEnabled(false);
});
afterEach(()=>{delete global.fetch;jest.clearAllTimers();jest.useRealTimers();jest.restoreAllMocks();});
test.each(['toggle','setting','bounds','map','rebind'])('late camera response cannot restore markers after %s change',async action=>{
 const pending=deferred();fetch.mockReturnValue(pending.promise);owner.initializeCameraLayer();expect(fetch).toHaveBeenCalledTimes(1);
 if(action==='toggle')owner.toggleShowCameras();
 if(action==='setting')owner.setShowCamerasEnabled(false);
 if(action==='bounds')bounds={...bounds,getNorth:()=>54};
 if(action==='map')map={...map};
 if(action==='rebind')owner.bind({getMap:()=>map});
 pending.resolve(response());await settle();expect(mounted).toHaveLength(0);
});
test('newer viewport camera response wins and toggle-off removes it',async()=>{
 const old=deferred(),fresh=deferred();fetch.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
 owner.initializeCameraLayer();move();jest.advanceTimersByTime(1000);
 fresh.resolve(response());await settle();expect(mounted).toHaveLength(1);
 old.resolve(response());await settle();expect(mounted).toHaveLength(1);
 owner.toggleShowCameras();expect(mounted[0].remove).toHaveBeenCalledTimes(1);expect(window.cameraMarkers).toHaveLength(0);
});

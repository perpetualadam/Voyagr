const SG=require('../modules/navigation/speed-gps');
const SL=require('../modules/navigation/speed-limit-widget');
let widget,tracking,route,unit,starts;
beforeEach(()=>{
 jest.resetModules();localStorage.clear();tracking=false;route=false;unit='mph';starts=0;
 document.body.innerHTML='<div id="speedWidget" style="display:none"><span id="speedValue">0</span><span id="speedUnitDisplay"></span><div id="speedLimitCircle"><span id="speedLimitValue">…</span><span id="speedLimitUnit"></span><span id="speedLimitMappedLabel" hidden></span></div><span id="speedWidgetState"></span><button id="speedWidgetUseGps">Use GPS</button></div>';
 global.VoyagrGpsOrchestration={startGPSTracking:()=>{starts++;tracking=true;}};
 widget=require('../app/speed-widget-orchestration');
 widget.bind({speedGps:()=>SG,speedLimitWidget:()=>SL,getSpeedUnit:()=>unit,getIsTrackingActive:()=>tracking,getRouteInProgress:()=>route,call:{getSpeedUnit:()=>unit}});
});
afterEach(()=>{delete global.VoyagrGpsOrchestration;delete global.VoyagrSpeedWidgetOrchestration;});
test.each(['mph','km/h'])('idle map displays the widget with %s units and no invented speed or limit',selected=>{
 unit=selected;widget.updateSpeedWidgetVisibility();
 expect(document.querySelector('#speedWidget').style.display).toBe('block');
 expect(document.querySelector('#speedValue').textContent).toBe('—');expect(document.querySelector('#speedLimitValue').textContent).toBe('—');
 expect(document.querySelector('#speedLimitUnit').textContent).toBe(selected);
 expect(document.querySelector('#speedWidgetState').textContent).toBe('GPS off');expect(starts).toBe(0);
});
test('Use GPS starts the existing tracker once and never starts navigation or toggles tracking off',()=>{
 widget.useGpsForSpeedWidget();widget.useGpsForSpeedWidget();
 expect(tracking).toBe(true);expect(starts).toBe(1);expect(route).toBe(false);
 expect(document.querySelector('#speedWidgetUseGps').hidden).toBe(true);expect(document.querySelector('#speedWidgetState').textContent).toBe('Waiting for GPS');
});
test('live mapped limits display before a route exists, then clear when GPS stops',()=>{
 tracking=true;widget.updateSpeedWidget(0,30,{applicable:true,evidence_state:'MAPPED_POSTED'});
 expect(document.querySelector('#speedLimitValue').textContent).toBe('30');expect(widget.getCurrentSpeedLimitMph()).toBe(30);expect(route).toBe(false);
 tracking=false;widget.updateSpeedWidgetVisibility();
 expect(document.querySelector('#speedWidget').style.display).toBe('block');expect(document.querySelector('#speedLimitValue').textContent).toBe('—');expect(widget.getCurrentSpeedLimitMph()).toBeNull();
});
test('mapped observations retain their label and cannot become legal speeding-alert evidence',()=>{
 tracking=true;widget.updateSpeedWidget(0,null,null,{applicable:false,evidence_state:'MAPPED_OBSERVATION',speed_limit_mph:20});
 expect(document.querySelector('#speedLimitValue').textContent).toBe('20');expect(document.querySelector('#speedLimitMappedLabel').textContent).toBe('Mapped');expect(widget.getCurrentSpeedLimitMph()).toBeNull();
 widget.updateSpeedWidget(0,null);expect(document.querySelector('#speedWidgetState').textContent).toBe('Limit unavailable');
});
test('the existing user preference still hides the widget everywhere',()=>{
 widget.setSpeedWidgetEnabled(false);widget.updateSpeedWidgetVisibility();expect(document.querySelector('#speedWidget').style.display).toBe('none');
 tracking=true;route=true;widget.updateSpeedWidgetVisibility();expect(document.querySelector('#speedWidget').style.display).toBe('none');
});

const Units=require('../modules/navigation/units');
const Preferences=require('../app/units-preferences-orchestration');
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../../../templates/index.html'),'utf8').split('<div id="settingsTab"')[1].split('<!-- TRIP HISTORY TAB')[0];
beforeEach(()=>{document.body.innerHTML='<div id="settingsTab"'+html;});
test('compact actions retain exact existing commands and visible labels',()=>{
 const handlers=['goBackToPreviousTab()','manualTrafficUpdate()','showCAZInfo()','clearDepartureTime()','analysebestTimeToLeave()','refreshApp()','checkForUpdates()','recalculateRouteWithPreferences()',"switchTab('navigation')",'voyagrShowSafetyNotice && voyagrShowSafetyNotice()'];
 handlers.forEach(command=>{const b=[...document.querySelectorAll('.settings-action')].find(el=>el.getAttribute('onclick')===command);expect(b).toBeDefined();expect(b.type).toBe('button');expect(b.textContent.trim().length).toBeGreaterThan(0);expect(b.querySelector('svg').getAttribute('aria-hidden')).toBe('true');expect(b.style.width).toBe('');});
});
test('unit selects retain values, handlers and help with associated visible labels',()=>{
 for(const [id,values,handler] of [['distanceUnit',['km','mi'],'updateDistanceUnit()'],['speedUnit',['kmh','mph'],'updateSpeedUnit()'],['temperatureUnit',['celsius','fahrenheit'],'updateTemperatureUnit()'],['currencyUnit',['GBP','USD','EUR'],'updateCurrencyUnit()']]){
  const el=document.getElementById(id);expect([...el.options].map(o=>o.value)).toEqual(values);expect(el.getAttribute('onchange')).toBe(handler);expect(document.querySelector('label[for="'+id+'"]').textContent.trim()).not.toBe('');
 }
 expect(document.getElementById('costCurrencyHelp').textContent).toContain('does not convert amounts');
 expect(document.getElementById('temperatureUnit').getAttribute('aria-describedby')).toBe('temperatureUnitHelp');
});
test('toggle labels and target markup preserve controller class ownership and hazard command',()=>{
 const buttons=[...document.querySelectorAll('.toggle-switch')];expect(buttons.length).toBeGreaterThan(25);
 buttons.forEach(b=>{expect(b.type).toBe('button');expect(b.getAttribute('aria-label').trim()).not.toBe('');expect(b.hasAttribute('onclick')).toBe(true);});
 const speed=document.getElementById('speedWidgetToggle');expect(speed.classList.contains('active')).toBe(true);expect(speed.getAttribute('onclick')).toBe('toggleSpeedWidget()');
 expect(document.querySelector('[data-hazard-type="camera_speed"]').getAttribute('onclick')).toBe("toggleHazardPreferenceApi('camera_speed', event)");
});
test('account, premium visibility, privacy destination and avoidance refusal remain intact',()=>{
 for(const id of ['accountSignedIn','accountSignedOut','supportVoyagrSection','supportStripePremiumBtn','promoCodeFormWrap'])expect(document.getElementById(id).style.display).toBe('none');
 expect(document.getElementById('authPassword').getAttribute('autocomplete')).toBe('current-password');
 const link=document.querySelector('a.settings-action');expect(link.getAttribute('href')).toBe('/privacy');expect(link.rel).toBe('noopener');expect(link.textContent).toContain('new tab');
 expect(document.getElementById('avoidanceMode').getAttribute('onchange')).toContain('VoyagrAvoidanceIntegrity.invalidate()');
 expect(document.body.textContent).toContain('Unresolved mandatory requirements prevent navigation');
});

test('native distance control still drives the production preference controller and persistence',()=>{
 global.fetch=()=>Promise.resolve({ok:true});
 Preferences.bind({units:()=>Units,call:{saveAllSettings:()=>{},showStatus:()=>{}}});
 const select=document.getElementById('distanceUnit');select.value='km';
 Function('updateDistanceUnit',select.getAttribute('onchange'))(()=>Preferences.updateDistanceUnit());
 expect(localStorage.getItem('unit_distance')).toBe('km');expect(Preferences.getDistanceUnitValue()).toBe('km');
 select.value='mi';Preferences.updateDistanceUnit();
 expect(localStorage.getItem('unit_distance')).toBe('mi');expect(Preferences.convertDistance(10)).toBe('6.21');
 delete global.fetch;
});

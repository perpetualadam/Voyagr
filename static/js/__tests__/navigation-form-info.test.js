const Plan=require('../modules/navigation/journey-plan');
const fs=require('fs');
const html=fs.readFileSync(require('path').join(__dirname,'../../../templates/index.html'),'utf8');
beforeEach(()=>{document.body.innerHTML=html;});
test('navigation explanations are optional Info while labels and dynamic feedback remain outside',()=>{
 for(const id of ['navigationArrivalInfo','navigationWaypointInfo','navigationGpsInfo','navigationVoiceInfo']) {
  const info=document.getElementById(id);expect(info.tagName).toBe('DETAILS');expect(info.open).toBe(false);expect(info.querySelector('summary').getAttribute('aria-label')).toMatch(/information/);
 }
 for(const selector of ['#arrivalIntentHelp','#drivingArrivalHelp','#arrivalParkingHelp','.waypoints-hint','#navigationGpsInfo .settings-inline-help','.voice-card__hint','#voiceEngineHelp'])expect(document.querySelector(selector).closest('.navigation-info')).not.toBeNull();
 for(const id of ['arrivalSearchContext','status','navigationStartExplanation','voiceStatus','fuelPricingHelp','start','end','drivingArrival','autoGpsToggle','voiceBtn'])expect(document.getElementById(id).closest('.navigation-info')).toBeNull();
 for(const id of ['drivingArrival','arrivalIntent','voiceRecognitionProvider'])for(const ref of document.getElementById(id).getAttribute('aria-describedby').split(' '))expect(document.getElementById(ref)).not.toBeNull();
});

test('arrival owner refreshes choices without opening Info or discarding the destination',()=>{
 const end=document.getElementById('end'),arrival=document.getElementById('drivingArrival'),info=document.getElementById('navigationArrivalInfo');
 end.value='Destination';arrival.value='Parking';Object.assign(arrival.dataset,{lat:'53',lon:'-1',displayName:'Parking'});
 Plan.syncArrivalSummary();expect(document.getElementById('arrivalOptionsSummary').textContent).toContain('Driving arrival: Parking');expect(info.open).toBe(false);
 info.open=true;Plan.clearArrival();expect(info.open).toBe(true);expect(arrival.value).toBe('');expect(end.value).toBe('Destination');expect(document.getElementById('arrivalOptionsSummary').textContent).toBe('Use destination');
});

const ETA=require('../modules/navigation/eta');
const Summary=require('../app/journey-summary-orchestration');
const RS=require('../modules/navigation/route-selection');
const Codec=require('../modules/navigation/polyline-codec');
const capture=require('./fixtures/sheffield-doncaster-20261101.json');
test.each([
 [{fuel_cost:4.5,toll_cost:2,caz_cost:10},'£16.50'],
 [{fuel_cost:'4.50',toll_cost:'2.00',caz_cost:'10.00',total_cost:0},'£16.50'],
 [{fuel_cost:4.5,toll_cost:0,caz_cost:0},'£4.50'],
 [{fuel_cost:0,toll_cost:0,caz_cost:0},'£0.00'],
 [{total_cost:12.5},'£12.50'],
 [{},'—'],
 [{fuel_cost:'invalid',toll_cost:-2,caz_cost:null},'—'],
])('completed summary formats estimated components without inventing missing costs: %j',(costs,expected)=>{
 const route={distance_km:10,duration_minutes:20,...costs},before=JSON.stringify(route);
 expect(ETA.buildJourneySummaryModalApplyPlan(route,{currencySymbol:'£'}).costText).toBe(expected);
 expect(JSON.stringify(route)).toBe(before);
});
test('selected API route retains fuel, toll and CAZ estimate through traveled patch and actual summary DOM',()=>{
 const payload=JSON.parse(JSON.stringify(capture));Object.assign(payload.routes[0],{fuel_cost:4.5,toll_cost:2,caz_cost:10});
 const route=RS.buildRouteOptionsFromApiResponse(payload,Codec.decodePolyline)[0],before=JSON.stringify(route);
 document.body.innerHTML='<div id="journeySummaryModal" style="display:none"><span id="summaryCost"></span><span id="summaryDistance"></span><span id="summaryTime"></span><span id="summaryAvgSpeed"></span></div>';
 const expand=jest.fn();
 Summary.bind({eta:()=>ETA,getNavTraveledMeters:()=>10000,getNavStartedAt:()=>Date.now()-1200000,call:{convertDistance:km=>km.toFixed(1),getDistanceUnit:()=> 'km',convertSpeed:x=>Math.round(x),getSpeedUnit:()=> 'mph',getCurrencySymbol:()=> '£',adjustCostForUnits:x=>x,expandBottomSheet:expand}});
 const completed=Summary.buildTraveledJourneyRoute(route);Summary.showJourneySummary(completed);
 expect(document.getElementById('summaryCost').textContent).toBe('£16.50');
 expect(document.getElementById('journeySummaryModal').style.display).toBe('block');
 expect(document.getElementById('summaryDistance').textContent).toBe('10.0 km');
 expect(expand).toHaveBeenCalledTimes(1);expect(JSON.stringify(route)).toBe(before);
});

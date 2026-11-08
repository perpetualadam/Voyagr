const fs=require('fs'),path=require('path');
const History=require('../modules/navigation/trip-history');
const Controller=require('../app/trip-history-orchestration');
const Units=require('../modules/navigation/units');
const markup='<div id="routeAnalyticsTab"'+fs.readFileSync(path.join(__dirname,'../../../templates/index.html'),'utf8').split('<div id="routeAnalyticsTab"')[1].split('<!-- SAVED ROUTES TAB')[0];
const data={total_trips:5,total_distance_km:120,total_cost:42.5,avg_duration:25,total_fuel_cost:30,total_toll_cost:10,total_caz_cost:2.5,total_time_minutes:125,avg_speed:80,frequent_routes:[{start:'Home & <Work>',end:'Long street',count:3,avg_distance:10,avg_cost:4.5}]};
beforeEach(()=>{document.body.innerHTML=markup;});
function bind(unit='mi',speed='mph') {Controller.bind({tripHistory:()=>History,getSpeedUnit:()=>speed,call:{getCurrencySymbol:()=>Units.getCostCurrencyPresentation('EUR').symbol,convertDistance:km=>Units.convertDistance(km,unit),getDistanceUnit:()=>unit,getSpeedUnitLabel:()=>speed==='mph'?'mph':'km/h'}});}
test('production controller fills every summary and breakdown with existing calculations and canonical metadata',()=>{
 bind();const before=JSON.stringify(data);Controller.displayAnalytics(data);
 for(const [id,text] of Object.entries({totalTrips:'5',totalDistance:'74.56 mi',totalCost:'£42.50',avgDuration:'25 min',totalFuelCost:'£30.00',totalTollCost:'£10.00',totalCAZCost:'£2.50',totalTime:'2h 5m',avgSpeed:'49.7 mph'}))expect(document.getElementById(id).textContent).toBe(text);
 expect(document.getElementById('totalDistance').dataset.distanceMeters).toBe('120000');expect(document.getElementById('avgSpeed').dataset.speedKmh).toBe('80');
 expect(document.querySelector('.analytics-route [data-distance-meters]').dataset.distanceMeters).toBe('10000');expect(JSON.stringify(data)).toBe(before);
 bind('km','kmh');Controller.displayAnalytics(data);expect(document.getElementById('totalDistance').textContent).toBe('120.00 km');expect(document.getElementById('avgSpeed').textContent).toBe('80.0 km/h');
});
test('frequent route cards escape stored text and retain ranking, count, distance and average cost',()=>{
 document.getElementById('frequentRoutesList').innerHTML=History.buildFrequentRoutesListHtml([{...data.frequent_routes[0],count:'3 <img src=x>'}],{currencySymbol:'£',distanceTexts:['6.21'],distUnit:'mi'});
 expect(document.querySelector('#frequentRoutesList img')).toBeNull();expect(document.querySelector('.analytics-route h5').textContent).toBe('1. Home & <Work> → Long street');
 expect(document.querySelector('.analytics-route').textContent).toContain('3 <img src=x> trips');expect(document.querySelector('.analytics-route').textContent).toContain('6.21 mi');expect(document.querySelector('.analytics-route').textContent).toContain('£4.50');
});
test('semantic summaries retain IDs and the compact Map action retains its existing command',()=>{
 const ids=['totalTrips','totalDistance','totalCost','avgDuration','totalFuelCost','totalTollCost','totalCAZCost','totalTime','avgSpeed'];
 for(const id of ids){expect(document.querySelectorAll('#'+id)).toHaveLength(1);expect(document.getElementById(id).tagName).toBe('DD');}
 const b=document.querySelector('button');const navigate=jest.fn();Function('switchTab',b.getAttribute('onclick'))(navigate);expect(navigate).toHaveBeenCalledWith('navigation');expect(b.type).toBe('button');expect(b.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
});
test('empty state and authentication/premium refusal paths stay separate from display',()=>{
 bind();Controller.displayAnalytics({});expect(document.getElementById('frequentRoutesList').textContent).toBe('No trip history yet');expect(document.querySelector('#frequentRoutesList [role=status]')).not.toBeNull();
 const orch=History.buildLoadRouteAnalyticsOrchestrationPlan();for(const [res,body] of [[{status:401},{}],[{status:403},{code:'premium_required'}]])expect(History.buildLoadRouteAnalyticsResponseExecutePlan(res,body,orch).shouldDisplay).toBe(false);
});

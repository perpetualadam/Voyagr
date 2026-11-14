const fs=require('fs'),parser=require('@babel/parser');
const Form=require('../app/form-clear-orchestration'),Plan=require('../modules/navigation/journey-plan');
const source=fs.readFileSync(require.resolve('../voyagr-app.js'),'utf8');
const node=parser.parse(source).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='stopTurnByTurnNavigation');
let live,Nav,end,events;
beforeEach(()=>{
 live=true;events=[];
 document.body.innerHTML='<input id="start" value="Origin"><input id="end" value="Destination"><input id="drivingArrival" value="Parking"><input id="viaPointAddress" value="Via"><input id="stopAddress" value="Stop"><div id="autocomplete_start" class="show">Result</div><span id="summaryCost">£16.50</span>';
 for(const input of document.querySelectorAll('input')) Object.assign(input.dataset,{lat:'53',lon:'-1',displayName:input.value,journeySource:'searched',journeySearchEvidence:'old',unrelated:'keep'});
 Nav={getRouteInProgress:()=>live,stopTurnByTurnNavigation:jest.fn(()=>{events.push({summaryOrigin:document.getElementById('start').value,summaryDestination:document.getElementById('end').value});live=false;})};
 global.VoyagrNavigationLifecycleOrchestration=Nav;global.VoyagrLocationOrchestration={invalidateEndpointRequests:jest.fn(()=>events.push('cancel-input-requests'))};global.VoyagrJourneyPlan=Plan;
 end=new Function('VoyagrNavigationLifecycleOrchestration','VoyagrFormClearOrchestration',source.slice(node.start,node.end)+';return stopTurnByTurnNavigation;')(Nav,Form);
});
afterEach(()=>{delete global.VoyagrNavigationLifecycleOrchestration;delete global.VoyagrLocationOrchestration;delete global.VoyagrJourneyPlan;});
test('End clears visible inputs and stale coordinates after capturing the summary without changing its cost',()=>{
 end();expect(events[0]).toEqual({summaryOrigin:'Origin',summaryDestination:'Destination'});
 for(const input of document.querySelectorAll('input')){expect(input.value).toBe('');expect(input.dataset.lat).toBeUndefined();expect(input.dataset.lon).toBeUndefined();expect(input.dataset.displayName).toBeUndefined();expect(input.dataset.journeySource).toBeUndefined();expect(input.dataset.journeySearchEvidence).toBeUndefined();if(input.id!=='drivingArrival')expect(input.dataset.unrelated).toBe('keep');}
 expect(document.getElementById('autocomplete_start').textContent).toBe('');expect(document.getElementById('autocomplete_start').classList.contains('show')).toBe(false);
 expect(document.getElementById('summaryCost').textContent).toBe('£16.50');expect(global.VoyagrLocationOrchestration.invalidateEndpointRequests).toHaveBeenCalledTimes(1);
});
test('an unsuccessful stop or idle End cannot erase a current or newly entered plan',()=>{
 Nav.stopTurnByTurnNavigation.mockImplementation(()=>false);expect(end()).toBe(false);expect(document.getElementById('start').value).toBe('Origin');
 live=false;end();expect(document.getElementById('end').value).toBe('Destination');expect(global.VoyagrLocationOrchestration.invalidateEndpointRequests).not.toHaveBeenCalled();
});
test('input-only reset refuses an active journey and does not need map or GPS runtime',()=>{
 expect(Form.clearJourneyInputs()).toBe(false);expect(document.getElementById('start').value).toBe('Origin');
 live=false;expect(Form.clearJourneyInputs()).toBe(true);expect(document.getElementById('end').value).toBe('');
});

test('completed history captures addresses and estimates before inputs clear even when sign-in lookup is pending',async()=>{
 const History=require('../app/trip-history-orchestration');let allow,pending,rows=[];
 global.VoyagrLocalData={capture:()=>({owner:'guest',epoch:1}),historyEnabled:()=>new Promise(resolve=>{allow=resolve;}),update:async(category,fn)=>{rows=fn(rows);},report:jest.fn()};
 History.bind({tripHistory:()=>require('../modules/navigation/trip-history'),getRoutePolyline:()=>[[53,-1],[53.1,-1]],getCurrentRoutingMode:()=> 'auto',call:{getSupabaseAccessToken:()=>{throw Error('No cloud lookup');}}});
 Nav.stopTurnByTurnNavigation.mockImplementation(()=>{pending=History.persistCompletedTrip({distance_km:10,duration_minutes:20,fuel_cost:4.5,toll_cost:2,caz_cost:10});live=false;});
 end();expect(document.getElementById('start').value).toBe('');allow(true);await pending;
 expect(rows[0]).toMatchObject({start_address:'Origin',end_address:'Destination',fuel_cost:4.5,toll_cost:2,caz_cost:10});
 delete global.VoyagrLocalData;
});

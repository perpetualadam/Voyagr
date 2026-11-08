const fs=require('fs'),path=require('path');
const Sharing=require('../modules/navigation/route-sharing');
const History=require('../modules/navigation/trip-history');
const template=fs.readFileSync(path.join(__dirname,'../../../templates/index.html'),'utf8');
const saved={id:17,name:'Home <img src=x> & work',start:'A & B',end:'C <script>',distance_km:10,duration_minutes:'20 min',fuel_cost:5,toll_cost:1,caz_cost:0,geometry:'original'};
const trip={id:-23,_localOnly:true,start_address:'A & B',end_address:'C <img>',distance_km:10,duration_minutes:20,routing_mode:'auto',fuel_cost:5,toll_cost:1,caz_cost:0};
const fmt={startAddr:'A &amp; B',endAddr:'C &lt;img&gt;',dateStr:'8 Nov',distance:'6.21',distUnit:'mi',symbol:'£',totalCost:'6.00'};
function activate(button,callbacks){Function(...Object.keys(callbacks),button.getAttribute('onclick'))(...Object.values(callbacks));}
beforeEach(()=>{document.body.innerHTML='';});

test('saved cards escape stored names/endpoints and preserve view/delete identifiers',()=>{
    document.body.innerHTML=Sharing.buildSavedRoutesListHtml([saved],{distanceTexts:['6.21'],distUnit:'mi',currencySymbol:'£'});
    expect(document.querySelector('img,script')).toBeNull();
    expect(document.body.textContent).toContain('Home <img src=x> & work');expect(document.body.textContent).toContain('A & B → C <script>');
    const view=jest.fn(),remove=jest.fn();
    activate(document.querySelector('[aria-label="View saved journey"]'),{useSavedRoute:view});
    activate(document.querySelector('[aria-label="Delete saved route"]'),{deleteSavedRoute:remove});
    expect(view).toHaveBeenCalledWith(17);expect(remove).toHaveBeenCalledWith(17);
    expect(document.querySelector('[data-distance-meters]').dataset.distanceMeters).toBe('10000');expect(document.body.textContent).toContain('£6.00');
    document.querySelectorAll('button').forEach(button=>{expect(button.type).toBe('button');expect(button.querySelector('svg').getAttribute('aria-hidden')).toBe('true');expect(button.style.width).toBe('');});
});

test('quoted saved-route IDs stay literal data and malformed IDs cannot create handler code',()=>{
    const id='x");window.injected=true;//';
    document.body.innerHTML=Sharing.buildSavedRoutesListHtml([{...saved,id}],{});
    const view=jest.fn();activate(document.querySelector('[aria-label="View saved journey"]'),{useSavedRoute:view});
    expect(view).toHaveBeenCalledWith(id);expect(window.injected).toBeUndefined();
    document.body.innerHTML=Sharing.buildSavedRoutesListHtml([{...saved,id:{bad:true}}],{});
    expect([...document.querySelectorAll('button')].every(button=>button.disabled&&!button.hasAttribute('onclick'))).toBe(true);
});

test('history retains local trip IDs, dates, costs, raw labels and both actions without double escaping',()=>{
    document.body.innerHTML=History.buildTripHistoryRowHtml(trip,fmt);
    expect(document.querySelector('img,script')).toBeNull();expect(document.body.textContent).toContain('A & B → C <img>');
    expect(document.body.textContent).not.toContain('&amp;');expect(document.body.textContent).toContain('(this device)');expect(document.body.textContent).toContain('8 Nov');expect(document.body.textContent).toContain('£6.00');
    const recalculate=jest.fn(),remove=jest.fn();
    activate(document.querySelector('[aria-label="Recalculate route"]'),{recalculateTrip:recalculate});
    activate(document.querySelector('[aria-label="Delete trip"]'),{deleteTripHistory:remove});
    expect(recalculate).toHaveBeenCalledWith(-23);expect(remove).toHaveBeenCalledWith(-23);
    expect(document.querySelector('[data-distance-meters]').dataset.distanceMeters).toBe('10000');
});

test('malformed history IDs and duration/mode markup cannot become executable handlers or content',()=>{
    document.body.innerHTML=History.buildTripHistoryRowHtml({...trip,id:'1);alert(1)',duration_minutes:'<img>',routing_mode:'<script>'},fmt);
    expect(document.querySelector('img,script')).toBeNull();
    expect([...document.querySelectorAll('button')].every(button=>button.disabled&&!button.hasAttribute('onclick'))).toBe(true);
});

test('compact tab controls retain save/back/search entrypoints and explicit input labels',()=>{
    const savedTab=template.split('<!-- SAVED ROUTES TAB (NEW FEATURE) -->')[1].split('<!-- ROUTE PREVIEW TAB')[0];
    const historyTab=template.split('<!-- TRIP HISTORY TAB (NEW FEATURE) -->')[1].split('<!-- DASHCAM TAB')[0];
    document.body.innerHTML=savedTab+historyTab;
    expect(document.querySelector('label[for="routeName"]')).not.toBeNull();expect(document.querySelector('label[for="tripSearchInput"]')).not.toBeNull();
    const save=jest.fn(),back=jest.fn();activate(document.querySelector('[aria-label="Save current route"]'),{saveCurrentRoute:save});
    document.querySelectorAll('[aria-label="Back to navigation"]').forEach(button=>activate(button,{switchTab:back}));
    expect(save).toHaveBeenCalledTimes(1);expect(back.mock.calls).toEqual([['navigation'],['navigation']]);
    expect(document.getElementById('tripSearchInput').type).toBe('search');
});

test('empty lists and saved previews preserve existing storage, confirmation and navigation guards',()=>{
    expect(Sharing.buildSavedRoutesListHtml([],{})).toContain('No saved routes yet');
    expect(History.buildDisplayTripHistoryExecutePlan({trips:[]})).toMatchObject({bindSearch:true,listInnerHtml:expect.stringContaining('No trips found')});
    const before=JSON.stringify(saved),plan=Sharing.buildUseSavedRoutePlan(17,[saved]);
    expect(plan.lastCalculatedRoutePatch.navigation_resume_requires_fresh_gps).toBe(true);expect(plan.lastCalculatedRoutePatch.geometry).toBe('original');
    expect(Sharing.buildDeleteSavedRoutePlan(17).confirmMessage).toContain('Delete');expect(JSON.stringify(saved)).toBe(before);
});

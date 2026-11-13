const fs=require('fs'),path=require('path');
const Plan=require('../modules/navigation/journey-plan.js');
const template=fs.readFileSync(path.join(__dirname,'../../../templates/index.html'),'utf8');
const markup=template.slice(template.indexOf('<details id="arrivalOptions"'),template.indexOf('<!-- VIA-POINTS'));
beforeEach(()=>{document.body.innerHTML='<input id="end" value="Doncaster">'+markup;});
test('optional controls and arrival guidance have separate closed accessible disclosures',()=>{
    const details=document.getElementById('arrivalOptions');
    expect(details.open).toBe(false);
    expect(details.querySelector('#drivingArrival')).not.toBeNull();
    const info=document.getElementById('navigationArrivalInfo');
    expect(info.open).toBe(false);
    expect(info.querySelector('summary').getAttribute('aria-label')).toBe('Arrival and parking information');
    expect(document.getElementById('arrivalIntentHelp').closest('details')).toBe(info);
    expect(document.getElementById('drivingArrivalHelp').closest('details')).toBe(info);
    expect(document.getElementById('arrivalParkingHelp').closest('details')).toBe(info);
    expect(details.querySelector('#arrivalIntentHelp')).toBeNull();
    expect(document.getElementById('arrivalIntentHelp').textContent).toContain('preview only');
    expect(document.getElementById('drivingArrivalHelp').textContent).toContain('onward connection is not included');
});
test('summary distinguishes typed text from a selected arrival and uses safe text',()=>{
    const input=document.getElementById('drivingArrival'),summary=document.getElementById('arrivalOptionsSummary');
    input.value='<img src=x onerror=alert(1)> parking';Plan.syncArrivalSummary();
    expect(summary.textContent).toContain('Select a result: <img');expect(summary.children).toHaveLength(0);
    Object.assign(input.dataset,{displayName:input.value,lat:'53',lon:'-1'});Plan.syncArrivalSummary();
    expect(summary.textContent).toContain('Driving arrival: <img');
    document.getElementById('arrivalIntent').value='roadside';document.getElementById('arrivalParkingPrice').value='free';Plan.syncArrivalSummary();
    expect(summary.textContent).toContain('Roadside — preview only');expect(summary.textContent).toContain('Parking search: reported free');
});
test('clear and saved arrival restore update the summary without changing the disclosure state or destination',()=>{
    const end=document.getElementById('end'),input=document.getElementById('drivingArrival');
    Plan.restoreArrival({arrival_intent:{version:1,mode:'vehicle_entrance'},arrival_choice:{version:1,target:[53,-1],requested_destination:{label:'Doncaster',coordinates:[54,-2],kind:'searched'}},destination:{label:'NCP',coordinates:[53,-1],kind:'searched'}},end,input);
    expect(document.getElementById('arrivalOptionsSummary').textContent).toBe('Driving arrival: NCP · Vehicle entrance — preview only');
    expect(input.dataset.arrivalFor).toBe(Plan.destinationKey(end));expect(document.getElementById('arrivalOptions').open).toBe(false);
    Plan.clearArrival();expect(document.getElementById('arrivalOptionsSummary').textContent).toBe('Use destination');expect(end.value).toBe('Doncaster');expect(input.value).toBe('');
});
test('unsupported saved intent stays visible even without a restorable arrival choice',()=>{
    Plan.restoreArrival({arrival_intent:{version:2,mode:'future'}},null,null);
    expect(document.getElementById('arrivalOptionsSummary').textContent).toContain('Unsupported intent — choose again');
});

test('actual autocomplete selection and editing refresh the closed summary while invalidating old coordinates',async()=>{
    const Geo=require('../app/geocoding-orchestration.js'),Search=require('../modules/navigation/search-autocomplete.js');
    global.VoyagrJourneyPlan=Plan;
    Geo.bind({searchAutocomplete:()=>Search,call:{showStatus:jest.fn()}});
    const log=jest.spyOn(console,'log').mockImplementation(()=>{});
    try{
        Geo.selectAutocompleteResult('drivingArrival',53,-1,'NCP');
        expect(document.getElementById('arrivalOptionsSummary').textContent).toBe('Driving arrival: NCP');
        document.getElementById('drivingArrival').value='N';
        await Geo.showAutocomplete('drivingArrival',true);
        expect(document.getElementById('arrivalOptionsSummary').textContent).toBe('Select a result: N');
        expect(document.getElementById('drivingArrival').dataset.lat).toBeUndefined();
    }finally{log.mockRestore();}
});

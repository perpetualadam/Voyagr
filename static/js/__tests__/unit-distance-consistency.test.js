const U=require('../modules/navigation/units.js');
const Pref=require('../app/units-preferences-orchestration.js');
const POI=require('../modules/navigation/poi-search.js');
const Geo=require('../app/geocoding-orchestration.js');
const Search=require('../modules/navigation/search-autocomplete.js');
const Plan=require('../modules/navigation/journey-plan.js');
let oldFetch,save,notice;
beforeEach(()=>{
    oldFetch=global.fetch;global.fetch=jest.fn().mockResolvedValue({ok:true});save=jest.fn();notice=jest.fn();
    Pref.setDistanceUnitValue('km');
    Pref.bind({units:()=>U,call:{saveAllSettings:save,showStatus:notice}});
    document.body.innerHTML='<select id="distanceUnit"><option value="km">km</option><option value="mi">mi</option></select>';
});
afterEach(()=>{global.fetch=oldFetch;localStorage.clear();Pref.setDistanceUnitValue('mi');delete global.VoyagrJourneyPlan;jest.restoreAllMocks();});
function change(unit){document.getElementById('distanceUnit').value=unit;Pref.updateDistanceUnit();}
test.each([[0,'0 ft','0 m'],[1609.344,'1.0 mi','1.6 km'],[100,'328 ft','100 m']])('canonical metres %s format consistently', (meters,imperial,metric)=>{
    expect(U.formatDistanceLabelMeters(meters,'mi')).toBe(imperial);
    expect(U.formatDistanceLabelMeters(meters,'km')).toBe(metric);
});
test.each([null,'',' ',true,{},NaN,Infinity,-1])('invalid canonical value %s stays unknown',value=>{
    expect(U.formatDistanceLabelMeters(value,'mi')).toBe('—');
});
test('real settings action refreshes POI rows, popup and distance elements without route mutations',()=>{
    const item={name:'Fuel',lat:53.5,lon:-1.2,type:'fuel',distance_m:1609.344};
    document.body.insertAdjacentHTML('beforeend',POI.buildPoiResultsModalHtml([item],'fuel',{distanceTexts:['1.6 km'],userLat:53.5,userLon:-1.2}));
    document.body.insertAdjacentHTML('beforeend',POI.buildPoiMapMarkerPopupHtml(item,{distanceText:'1.6 km'}));
    document.body.insertAdjacentHTML('beforeend','<div id="distance" data-km="1.609344">1.61 km</div><div id="previewDistance" data-km="1.609344">1.61 km</div>');
    const canonical=[...document.querySelectorAll('[data-distance-meters]')].map(e=>e.dataset.distanceMeters);
    change('mi');
    expect(document.getElementById('distance').textContent).toBe('1.00 mi');
    expect(document.getElementById('previewDistance').textContent).toBe('1.00 mi');
    expect(document.getElementById('poiModal').textContent).toContain('1.0 mi');
    expect(document.body.textContent).toContain('1.0 mi away');
    expect(localStorage.getItem('unit_distance')).toBe('mi');expect(save).toHaveBeenCalledTimes(1);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).distance_unit).toBe('mi');
    change('km');change('mi');
    expect([...document.querySelectorAll('[data-distance-meters]')].map(e=>e.dataset.distanceMeters)).toEqual(canonical);
    expect(item.distance_m).toBe(1609.344);expect(global.fetch.mock.calls.every(([url])=>url==='/api/app-settings')).toBe(true);
});
test('distance labels update even when main route totals are absent',()=>{
    document.body.insertAdjacentHTML('beforeend','<p data-distance-meters="2000" data-distance-prefix="Within " data-distance-suffix=" of destination">Within 2.0 km of destination</p>');
    change('mi');expect(document.querySelector('p').textContent).toBe('Within 1.2 mi of destination');
});
test('real arrival result renderer uses current settings and refreshes without replacing selection',()=>{
    global.VoyagrJourneyPlan=Plan;
    Geo.bind({searchAutocomplete:()=>Search,call:{formatPoiDistance:m=>U.formatDistanceLabelMeters(m,Pref.getDistanceUnitValue())}});
    document.body.insertAdjacentHTML('beforeend','<input id="drivingArrival" value="car park"><input id="end" value="Town" data-lat="53.5" data-lon="-1.2" data-display-name="Town"><div id="autocomplete_drivingArrival"></div>');
    const point={lat:53.51,lon:-1.2,name:'Parking',type:'parking',class:'amenity'};
    Geo.displayAutocompleteResults('drivingArrival',[point]);
    const row=document.querySelector('.autocomplete-item');const label=row.querySelector('[data-distance-meters]');
    expect(label.textContent).toContain('km from destination');
    const metres=label.dataset.distanceMeters,click=row.onclick;
    change('mi');expect(label.textContent).toContain('ft from destination');
    expect(label.dataset.distanceMeters).toBe(metres);expect(row.onclick).toBe(click);
    expect(document.getElementById('end').value).toBe('Town');
});

test('a previously closed POI popup formats using the latest units when opened',()=>{
    const Orch=require('../app/poi-search-orchestration.js');
    const previousMap=window.map,previousLibrary=global.maplibregl;let popup;
    global.maplibregl={
        Popup:class {constructor(){popup=this;this.events={};}setHTML(html){this.html=html;return this;}on(name,fn){this.events[name]=fn;return this;}},
        Marker:class {setLngLat(){return this;}setPopup(){return this;}addTo(){return this;}remove(){}}
    };
    window.map={};
    Orch.bind({poiSearch:()=>POI,call:{formatPoiDistance:meters=>U.formatDistanceLabelMeters(meters,Pref.getDistanceUnitValue())}});
    try{
        Orch.addPOIMarkersToMap([{name:'Station',lat:53.5,lon:-1.2,distance_m:1609.344}],'fuel');
        expect(popup.html).toContain('1.6 km');change('mi');popup.events.open();
        expect(popup.html).toContain('1.0 mi');expect(popup.html).not.toContain('1.6 km');
    }finally{Orch.clearPOIMarkers();window.map=previousMap;global.maplibregl=previousLibrary;}
});

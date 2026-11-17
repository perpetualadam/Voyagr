const POI=require('../modules/navigation/poi-search');
const kinds=['camping','motorhome','drinking_water','toilets','showers','waste_disposal','laundry'];
test.each(kinds)('%s has a distinct filter title and marker',kind=>{
    expect(POI.isCampingType(kind)).toBe(true);
    expect(POI.formatPoiTypeTitle(kind)).not.toContain('_');
    expect(POI.getPoiTypeIcon(kind)).not.toBe(POI.getPoiTypeIcon('unknown'));
    expect(POI.buildAlongRouteSearchBody([[53.5,-1.2],[53.5,-1.18]],kind,1000).type).toBe(kind);
});
test('camping result escapes mapped facilities and plans without assuming overnight permission',()=>{
    const html=POI.buildPoiResultsModalHtml([{type:'motorhome',lat:53.5,lon:-1.2,name:'<img onerror=bad>',
        camping_kind_label:'Motorhome / caravan site',operator:'<script>bad</script>',
        reported_details:[{label:'Height restriction',value:'2.1 m'},{label:'Seasonal',value:'<img>'}],
        fee_category:'unknown',access_category:'restricted'}],'motorhome',{distanceText:'100 m',userLat:53.5,userLon:-1.2});
    expect(html).not.toContain('<img');expect(html).not.toContain('<script>');
    expect(html).toContain('2.1 m');expect(html).toContain('Facilities &amp; access');
    expect(html).toContain('Fee unknown');expect(html).toContain('Restricted/private');
    expect(html).toContain('Parking alone does not grant permission');
    expect(html).toContain('Plan route here');
    expect(html).toContain('selectPOI');
});
test('empty camping results keep coverage qualified',()=>{
    const html=POI.buildPoiResultsModalHtml([],'camping',{});
    expect(html).toContain('No mapped candidates returned');
    expect(html).toContain('coverage may be incomplete');
});

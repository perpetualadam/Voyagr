const Presentation=require('../modules/navigation/routing-presentation');
const RS=require('../modules/navigation/route-selection');
const RR=require('../modules/navigation/routing-request');
const fs=require('fs'),path=require('path');
const providers=[['GraphHopper','Route source A',6],['Valhalla','Route source B',6],['OSRM','Route source C',5]];
test.each(providers)('%s is distinguishable without branding in public route cards', (source,label,precision)=>{
 const route={id:'r',source,name:source+' Fastest',geometry:'_w{~eB~b`|@_pR?',geometry_precision:precision,distance_km:10,duration_minutes:15,fuel_cost:2,toll_cost:0,caz_cost:0,avoidance_assessment:{status:'SATISFIED'}};
 const before=JSON.stringify(route);expect(RS.routeEngineLabel(route)).toBe(label);expect(RS.buildRouteEvidenceText(route)).toContain(label);
 document.body.innerHTML=RS.buildPreviewAlternativeRouteCardHtml(route,0,{distanceText:'10',distUnit:'km',currencySymbol:'£'})+RS.buildRouteComparisonCardHtml(route,0,{distanceText:'10',distUnit:'km',currencySymbol:'£'});
 expect(document.body.textContent).toContain(label);expect(document.body.textContent).toContain('Fastest');expect(document.body.textContent).not.toMatch(/graphhopper|valhalla|osrm/i);
 expect(JSON.stringify(route)).toBe(before);expect(RS.resolveRouteGeometryPrecision(route)).toBe(precision);
});
test.each(['graphhopper','Graph-Hopper','GRAPHHOPPER custom profile'])('%s variants use the same public source label',source=>{expect(Presentation.sourceLabel(source)).toBe('Route source A');});
test('unknown source has a generic label without exposing arbitrary backend details',()=>{expect(Presentation.sourceLabel('private.internal:8989')).toBe('Routing service');expect(RS.routeEngineLabel({})).toBe('Routing service');});
test('routing error presentation preserves provider diagnostics while hiding names from users',()=>{
 const error='GraphHopper timed out; Valhalla returned HTTP 503';
 const result=RR.buildRouteApiResultPlan({success:false,source:'GraphHopper',error,routing_degraded:true,routing_warning:error});
 expect(result.errorMessage).toBe('Error: Route source A timed out; Route source B returned HTTP 503');expect(result.responseLogMeta.source).toBe('GraphHopper');expect(result.degradedLogWarning.warning).toBe(error);
 const comparison=RS.buildShowRouteComparisonSuccessExecutePlan({apiSuccess:false,apiError:error});expect(comparison.errorStatusMessage).not.toMatch(/graphhopper|valhalla/i);expect(comparison.errorLogArgs).toEqual([error]);
 expect(RS.buildCalculateRouteIdlePreviewParseErrorApplyPlan({message:error}).statusMessage).toContain('Route source B');
});
test('comparison recommendations use public aliases without rewriting their source payload',()=>{
 const advice={fastest:{route_id:1,reason:'Valhalla found a shorter route'},cheapest:{route_id:2,reason:'GraphHopper returned lower costs'}};const before=JSON.stringify(advice);
 document.body.innerHTML=RS.buildRouteComparisonRecommendationsHtml(advice);expect(document.body.textContent).not.toMatch(/graphhopper|valhalla/i);expect(document.body.textContent).toContain('Route source A');expect(document.body.textContent).toContain('Route source B');expect(JSON.stringify(advice)).toBe(before);
});
test('route identity matching still selects the real provider after changing its presentation',()=>{
 const alternatives=[{name:'Fastest',source:'Valhalla'},{name:'Fastest',source:'GraphHopper'}];
 expect(RS.pickActiveRouteDuringNavigation(alternatives,null,{previousRouteName:'Fastest',previousRouteSource:'GraphHopper'})).toBe(alternatives[1]);
});
test('place names and directions are not globally rewritten by presentation changes',()=>{
 const route={source:'Valhalla',name:'Fastest',destinationName:'Valhalla pub',maneuvers:[{instruction:'Turn left onto Valhalla Road'}]};const before=JSON.stringify(route);
 RS.buildRouteEvidenceText(route);expect(JSON.stringify(route)).toBe(before);expect(Presentation.systemText('Routing service unavailable')).toBe('Routing service unavailable');
});
test('public privacy text is generic and the presentation helper loads before its consumers',()=>{
 const template=fs.readFileSync(path.join(__dirname,'../../../templates/index.html'),'utf8');const privacy=fs.readFileSync(path.join(__dirname,'../../../templates/privacy_policy.html'),'utf8');
 expect(privacy).not.toMatch(/graphhopper|valhalla/i);expect(privacy).toContain('routing services');
 for(const consumer of ['reroute-decision.js','route-selection.js','routing-request.js'])expect(template.indexOf('routing-presentation.js')).toBeLessThan(template.indexOf(consumer));
});

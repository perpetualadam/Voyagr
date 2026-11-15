const {resolveSpeedSources}=require('../modules/navigation/speed-limit-widget');
const route={evidence_state:'ROUTE_OBSERVATION',applicable:false,speed_limit_mph:30};
const mapped={...route,evidence_state:'MAPPED_OBSERVATION',speed_limit_mph:20};
test.each(['legal','mapped'])('%s producer failure permits route fallback without leaking error details',source=>{
 const sources={legal:()=>null,mapped:()=>null,route:jest.fn(()=>route)};
 sources[source]=()=>{throw new Error('private URL and coordinates');};
 const result=resolveSpeedSources(sources);
 expect(result).toMatchObject({kind:'ROUTE',limitMph:30,legalLimitMph:null});
 expect(result.attempts).toContainEqual({source,reasonCode:'SOURCE_ERROR'});
 expect(JSON.stringify(result)).not.toContain('private');
});
test('mapped success avoids evaluating route and keeps legal alerts empty',()=>{
 const routeProducer=jest.fn(()=>{throw new Error('must remain lazy');});
 expect(resolveSpeedSources({mapped:()=>mapped,route:routeProducer})).toMatchObject({kind:'MAPPED',limitMph:20,legalLimitMph:null});
 expect(routeProducer).not.toHaveBeenCalled();
});
test('all producers failing clears the display rather than retaining a previous value',()=>{
 const fail=()=>{throw new Error('unavailable');};
 expect(resolveSpeedSources({legal:fail,mapped:fail,route:fail})).toMatchObject({kind:'UNKNOWN',limitMph:null,legalLimitMph:null,attempts:expect.arrayContaining([{source:'route',reasonCode:'SOURCE_ERROR'}])});
});
test('rejected mapped value still tries the route exactly once',()=>{
 const producer=jest.fn(()=>route);
 expect(resolveSpeedSources({mapped:()=>({...mapped,speed_limit_mph:NaN}),route:producer})).toMatchObject({kind:'ROUTE',limitMph:30});
 expect(producer).toHaveBeenCalledTimes(1);
});

const RR=require('../modules/navigation/routing-request.js');
const fs=require('fs');
const vm=require('vm');
const parser=require('@babel/parser');

test('HTML 504 is reported without inventing route complexity or a specific proxy cause',()=>{
    const msg=RR.buildNonJsonRouteApiErrorMessage(504,'<html>private-coordinates token-secret</html>');
    expect(msg).toMatch(/gateway|upstream|proxy/i);
    expect(msg).not.toMatch(/too complex|shorter route|token-secret/);
});
test('actual HTTP response handler never logs or consumes a proxy HTML error body',async()=>{
    const source=fs.readFileSync(require.resolve('../app/calculate-route-orchestration.js'),'utf8');
    const outer=parser.parse(source).program.body[0].expression.callee.body.body;
    const node=outer.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='applyCalculateRouteFetchHttpResponse');
    const log=jest.fn();const ctx={rt:()=>({routingRequest:()=>RR}),console:{log,error:log}};
    vm.createContext(ctx);vm.runInContext(source.slice(node.start,node.end),ctx);
    const text=jest.fn(async()=>'<html>token-secret</html>');
    await expect(ctx.applyCalculateRouteFetchHttpResponse({status:504,ok:false,headers:{get:()=> 'text/html'},text},{})).rejects.toThrow();
    expect(text).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain('token-secret');
});
test('preview cards identify engine and distinguish nearby markers from verified encounters',()=>{
    const RS=require('../modules/navigation/route-selection.js');
    const html=RS.buildPreviewAlternativeRouteCardHtml({name:'⚡ Optimised',source:'GraphHopper',duration_minutes:26,distance_km:22.7,cameras_near_route:20,avoidance_assessment:{status:'UNVERIFIED'},camera_evidence:{evaluated:true,applicable:0,possible:20}},0,{distanceText:'22.7',distUnit:'km',currencySymbol:'£'});
    expect(html).toContain('GraphHopper');expect(html).toContain('Nearby 20');expect(html).toContain('Unverified');
    expect(html).not.toMatch(/camera.free/i);
});

/* Ephemeral integration boundary. No GPS watcher, storage, transport or navigation grant. */
(function(root){
'use strict';
function create({owner,journey,gps,validator=root.VoyagrSpeedGps,now=()=>Date.now()}){
    if(!owner||typeof owner.capture!=='function'||typeof owner.current!=='function'||!journey||typeof journey.capture!=='function'||typeof journey.current!=='function'||!gps||typeof gps.getAcceptedOriginFix!=='function'||!validator||typeof validator.validateNavigationGpsFix!=='function')throw Error('Journey evidence unavailable.');
    const tokens=new WeakMap();let closed=false,lastAcceptedAt=0;
    function read(){
        if(closed)throw Error('Journey evidence closed.');
        const who={...owner.capture()},route={...journey.capture()},fix=gps.getAcceptedOriginFix(),at=now();
        if(!Number.isFinite(at)||typeof who.owner!=='string'||!Number.isSafeInteger(who.epoch)||who.epoch<0||owner.current(who)!==true||route.active!==true||route.simulating!==false||typeof route.route_id!=='string'||!route.route_id||route.route_id.length>128||!Number.isSafeInteger(route.generation)||route.generation<0||journey.current(route)!==true)throw Error('Current journey unavailable.');
        const checked=validator.validateNavigationGpsFix({timestamp:fix?.timestamp,coords:{latitude:fix?.lat,longitude:fix?.lon,accuracy:fix?.accuracy}},at,0);
        if(checked.accepted!==true||fix.timestamp<lastAcceptedAt)throw Error('Accepted GPS fix unavailable.');
        lastAcceptedAt=fix.timestamp;
        return {who,route,fix:{lat:fix.lat,lon:fix.lon,accuracy:fix.accuracy,timestamp:fix.timestamp}};
    }
    function current(token){
        const held=token&&typeof token==='object'?tokens.get(token):null;if(!held)return false;
        try{
            const live=read();
            const valid=owner.current(held.who)===true&&journey.current(held.route)===true&&live.route.route_id===held.route.route_id&&live.route.generation===held.route.generation&&Object.keys(held.fix).every(key=>held.fix[key]===live.fix[key]);
            if(!valid)tokens.delete(token);return valid;
        }catch(_){tokens.delete(token);return false;}
    }
    return {
        capture(){const evidence=read(),token=Object.freeze({});tokens.set(token,evidence);return token;},
        captureForOrigin(origin){
            const evidence=read();
            // Match the real request builder's numeric round-trip, never an accuracy radius.
            if(!Array.isArray(origin)||origin.length!==2||origin.some(value=>typeof value!=='number'||!Number.isFinite(value))||origin[0]!==evidence.fix.lat||origin[1]!==evidence.fix.lon)throw Error('Request origin does not match accepted GPS fix.');
            const token=Object.freeze({});tokens.set(token,{...evidence,request_origin:origin.slice()});return token;
        },
        current,
        async run(work){
            if(typeof work!=='function')throw Error('Preview work unavailable.');
            const token=this.capture();const result=await work();
            if(!current(token))throw Error('Journey evidence changed.');
            return result;
        },
        close(){closed=true;}
    };
}
const api={create};root.VoyagrGH11JourneyEvidence=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

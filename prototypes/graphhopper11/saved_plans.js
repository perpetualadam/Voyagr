/* Explicit device-only preview plans; separate database, no migration or cloud. */
(function(root){
'use strict';
const DB_NAME='voyagr-gh11-preview-plans-v1',copy=value=>JSON.parse(JSON.stringify(value));
function reference(value){
    const keys=['app_request','case_id','graph_version','policy_version','request_binding','schema','source_version'];
    if(!value||JSON.stringify(Object.keys(value).sort())!==JSON.stringify(keys)||value.schema!==3||typeof value.case_id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(value.case_id)||!value.app_request||typeof value.app_request!=='object'||Array.isArray(value.app_request)||JSON.stringify(value).length>4096)throw Error('Saved reference refused.');
    if(['graph_version','source_version','policy_version','request_binding'].some(key=>typeof value[key]!=='string'||!/^[a-f0-9]{64}$/.test(value[key])))throw Error('Saved reference refused.');
    const fields=['start','end','via_points','stops','optimize_stop_order','round_trip','departure_time','time_windows','total_stop_time','force_refresh','is_reroute','preserve_stop_order','routing_mode','vehicle_type','avoidance_mode','avoidance_requirements','avoid_points','enable_hazard_avoidance','avoid_cameras','avoid_traffic_lights','avoid_railway_crossings','avoid_tolls','avoid_caz','avoid_motorways','avoid_ferries','avoid_unpaved','caz_exempt','include_tolls','include_caz','prefer_scenic','prefer_quiet','route_optimization','max_detour','fuel_efficiency','fuel_price','energy_efficiency','electricity_price','fuel_price_mode','fuel_category'];
    if(Object.keys(value.app_request).some(key=>!fields.includes(key)))throw Error('Saved request fields refused.');
    if(['start','end'].some(key=>typeof value.app_request[key]!=='string'||value.app_request[key].length>80))throw Error('Saved coordinates refused.');
    if(Object.entries(value.app_request).some(([key,item])=>item!==null&&typeof item==='object'&&!['via_points','avoidance_requirements','stops','avoid_points'].includes(key)))throw Error('Saved request fields refused.');
    for(const [key,allowed] of [['via_points',['lat','lon','name','type','provenance','source_kind','original_index']],['avoidance_requirements',['category','enabled','mode','scope']]]){
        if(key in value.app_request&&(!Array.isArray(value.app_request[key])||value.app_request[key].some(row=>!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(field=>!allowed.includes(field)))))throw Error('Saved request fields refused.');
    }
    if(['stops','avoid_points'].some(key=>key in value.app_request&&(!Array.isArray(value.app_request[key])||value.app_request[key].length)))throw Error('Saved journey semantics refused.');
    return copy(value);
}
function record(value){
    try{return !!value&&JSON.stringify(Object.keys(value).sort())===JSON.stringify(['id','reference','saved_at','schema'])&&value.schema===1&&Number.isSafeInteger(value.saved_at)&&value.saved_at>=0&&value.id===reference(value.reference).request_binding;}catch(_){return false;}
}
function create(options={}){
    const implementation=options.storeModule||root.VoyagrLocalStore;
    if(!implementation)throw Error('Device store unavailable.');
    const store=implementation.create(options.indexedDB||root.indexedDB,{name:DB_NAME});
    let owner='guest',epoch=0,closed=false;
    const capture=()=>({owner,epoch}),current=token=>!closed&&!!token&&token.owner===owner&&token.epoch===epoch;
    function check(token){if(!current(token))throw Error('Local owner changed.');}
    async function rows(token){check(token);const value=await store.read(token.owner,'routes');check(token);if(value!==null&&!Array.isArray(value))throw Error('Existing saved data retained.');return value||[];}
    return {
        capture,current,
        switchOwner(next){
            if(closed||!implementation.validOwner(next)||next==='legacy:unassigned')throw Error('Invalid local owner.');
            owner=next;epoch++;options.onOwnerChange?.(capture());return capture();
        },
        async list(token=capture()){
            return (await rows(token)).map(value=>record(value)?{id:value.id,case_id:value.reference.case_id,saved_at:value.saved_at,restorable:true}:{id:null,case_id:null,restorable:false});
        },
        async save(value,token=capture(),guard=()=>true){
            const selected=reference(value);check(token);if(!guard())throw Error('Saved plan superseded.');
            const entry={schema:1,id:selected.request_binding,reference:selected,saved_at:Date.now()};
            await store.update(token.owner,'routes',old=>{
                if(old!==null&&(!Array.isArray(old)||old.some(item=>!record(item))))throw Error('Existing saved data retained.');
                const values=old||[],index=values.findIndex(item=>item.id===entry.id);
                if(index<0&&values.length>=20)throw Error('Saved plan limit reached.');
                return index<0?[...values,entry]:values.map((item,i)=>i===index?entry:item);
            },()=>current(token)&&guard());
            check(token);if(!guard())throw Error('Saved plan superseded.');return {id:entry.id,case_id:selected.case_id};
        },
        async get(id,token=capture()){
            const found=(await rows(token)).find(item=>record(item)&&item.id===id);
            if(!found)throw Error('Saved plan unavailable for this owner.');return reference(found.reference);
        },
        close(){closed=true;epoch++;store.close();}
    };
}
const api={DB_NAME,create};root.VoyagrGH11SavedPlans=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

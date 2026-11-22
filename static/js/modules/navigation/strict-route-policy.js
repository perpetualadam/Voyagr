/** Opt-in context binding. It never upgrades an existing integrity refusal. */
(function(root){
    'use strict';
    function create(initial,options){
        options=options||{};
        var clock=options.now||Date.now,context=null,revision=0;
        function update(next){context=next==null?null:JSON.parse(JSON.stringify(next));revision++;}
        function refused(reason,message){return {allowed:false,outcome:'REFUSED',reasonCode:reason,message:message||'Strict route verification is unavailable. Recalculate with current settings.'};}
        function hash(value){return typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);}
        function signature(rows){
            if(!Array.isArray(rows))return null;
            var seen=new Set(),result=[];
            for(var row of rows){
                if(!row||typeof row.category!=='string'||!row.category||seen.has(row.category)||typeof row.enabled!=='boolean'||!['mandatory','preference'].includes(row.mode))return null;
                seen.add(row.category);result.push([row.category,row.enabled,row.mode]);
            }
            return JSON.stringify(result.sort((a,b)=>a[0].localeCompare(b[0])));
        }
        function decision(route){
            if(!context)return refused('STRICT_CONTEXT_MISSING');
            if(context.navigation_authorized!==true||context.scope!=='navigation_verified')return refused('STRICT_PREVIEW_ONLY','This experiment supports route preview only. Navigation is unavailable.');
            var fields=['graph_version','source_version','policy_version','request_binding'];
            if(!fields.every(key=>hash(context[key])))return refused('STRICT_CONTEXT_INVALID');
            var now=clock();
            if(!Number.isFinite(now)||!Number.isFinite(context.issued_at_ms)||!Number.isFinite(context.valid_until_ms)||context.issued_at_ms>now+1000||now>=context.valid_until_ms||context.valid_until_ms<=context.issued_at_ms||context.valid_until_ms-context.issued_at_ms>600000)return refused('STRICT_CONTEXT_EXPIRED');
            var metadata=route&&route.routing_context;
            if(!route||route.navigation_allowed!==true||!metadata||!fields.every(key=>metadata[key]===context[key]))return refused('STRICT_BINDING_MISMATCH');
            if(!Number.isFinite(metadata.checked_at_ms)||!Number.isFinite(metadata.valid_until_ms)||metadata.checked_at_ms<context.issued_at_ms||metadata.checked_at_ms>now+1000||metadata.valid_until_ms>context.valid_until_ms||metadata.valid_until_ms<=metadata.checked_at_ms||now>=metadata.valid_until_ms)return refused('STRICT_EVIDENCE_EXPIRED');
            var rows=route.avoidance_assessment&&route.avoidance_assessment.requirements;
            var expected=signature(context.requirements),actual=signature(rows);
            if(expected===null||actual===null||expected!==actual)return refused('STRICT_RULES_CHANGED');
            if(rows.some(row=>row.enabled&&row.mode==='mandatory'&&row.status!=='SATISFIED'))return refused('STRICT_MANDATORY_REFUSED','Mandatory route requirements are not verified. Navigation remains unavailable.');
            return {allowed:true,outcome:'CONTEXT_BOUND',reasonCode:'STRICT_CONTEXT_BOUND'};
        }
        update(initial);
        return Object.freeze({update:update,decision:decision,
            capture:()=>Object.freeze({revision:revision}),
            isCurrent:ticket=>!!ticket&&ticket.revision===revision});
    }
    var api={create:create};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;
    root.VoyagrStrictRoutePolicyModule=api;
})(typeof globalThis!=='undefined'?globalThis:this);

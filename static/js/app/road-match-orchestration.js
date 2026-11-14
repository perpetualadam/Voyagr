/** One road identity owner for PWA GPS, lane, legal speed and hazard decisions. */
(function(root){
    'use strict';
    var context=null,index=null,snapshot=null,previous=null,line=null,activeRoute=null,generation=0,requestSeq=0,inFlight=false,lastFetch=0,vehicle='car';
    var lastObservationPosition=null;
    function moduleApi(){return root.VoyagrRoadMatching;}
    function currentVehicle(){var routing=root.VoyagrVehicleRoutingOrchestration;if(routing&&routing.getCurrentRoutingMode&&routing.getCurrentRoutingMode()!=='auto')return routing.getCurrentRoutingMode();var v=document.getElementById('vehicleType'),value=v&&v.value?v.value:'unknown';return value==='petrol_diesel'?'car':value;}
    function inside(c,p){return c&&c.bounds&&p[0]>=c.bounds[0]+.0005&&p[0]<=c.bounds[2]-.0005&&p[1]>=c.bounds[1]+.0008&&p[1]<=c.bounds[3]-.0008;}
    function observe(position,polyline,route){
        var now=Date.now(),v=currentVehicle();
        lastObservationPosition=position;
        if(polyline!==line || route!==activeRoute || v!==vehicle){line=polyline;activeRoute=route;generation++;requestSeq++;previous=null;snapshot=null;context=null;index=null;inFlight=false;lastFetch=0;vehicle=v;}
        var p=[position.coords.latitude,position.coords.longitude],api=moduleApi();
        if(!api)return null;
        var refresh=context&&context.speed_observations_only===true
            ? now-context.acquired_at_ms>=30000 : now-(context&&context.served_at_ms||0)>60000;
        if(!inFlight && now-lastFetch>=30000 && (!inside(context,p)||refresh)){
            var seq=++requestSeq,gen=generation;inFlight=true;lastFetch=now;
            var controller=typeof AbortController!=='undefined'?new AbortController():null;
            var timer=controller?setTimeout(function(){controller.abort();},4000):null;
            fetch('/api/road-context',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lat:p[0],lon:p[1],vehicle_type:vehicle,speed_observations:true,lane_observations:true,lane_connectivity:!!(route&&route.source==='GraphHopper')}),signal:controller?controller.signal:undefined})
                .then(function(r){if(!r.ok)throw new Error('Road context unavailable');return r.json();})
                .then(function(data){if(seq!==requestSeq||gen!==generation)return;context=data&&data.context||null;index=context?api.createIndex(context):null;previous=null;})
                .catch(function(){/* Retain a still-fresh bounded context; never invent a replacement. */})
                .finally(function(){if(timer)clearTimeout(timer);if(seq===requestSeq)inFlight=false;});
        }
        var active=route&&route.id!=null?String(route.id):null;
        snapshot=api.matchPosition(position,index||api.createIndex({}),{now:now,previous:previous,route_generation:generation,active_route_id:active,vehicle:vehicle});
        snapshot=api.bindRoute(snapshot,polyline,route&&route.road_segments||[],index);
        // A speed-only observation must not change route progress/deviation gates.
        snapshot.context_available=!!context && context.speed_observations_only!==true;
        if(snapshot.evidence_status==='PROBABLE')previous=snapshot;else previous=null;
        return snapshot;
    }
    function getSnapshot(){
        if(!snapshot)return null;
        if(currentVehicle()!==vehicle){invalidate('Vehicle context changed');return snapshot;}
        if(Date.now()-snapshot.match_timestamp_ms>15000)return Object.assign({},snapshot,{evidence_status:'STALE',attributes_allowed:false});
        return snapshot;
    }
    function getAttributes(){return moduleApi().attributes(getSnapshot(),context,vehicle,Date.now());}
    function getSpeedObservation(){
        var api=moduleApi(),match=getSnapshot();
        return api.speedObservation(match,context,vehicle,Date.now()) ||
            (api.speedObservationWithinUncertainty ? api.speedObservationWithinUncertainty(lastObservationPosition,index,vehicle,Date.now()) : null);
    }
    function getLaneObservation(){return moduleApi().laneObservation(getSnapshot(),context,vehicle,Date.now());}
    function matchesProviderLaneApproach(step){return moduleApi().providerLaneApproach(getSnapshot(),context,vehicle,Date.now(),line,step);}
    function getGraphHopperLaneGuidance(step){return root.VoyagrLaneConnectivity?root.VoyagrLaneConnectivity.resolve({match:getSnapshot(),context:context,vehicle:vehicle,now:Date.now(),line:line,step:step,route:activeRoute},moduleApi()):null;}
    function classifyHazard(h){return moduleApi().hazardAssociation(getSnapshot(),h,Date.now());}
    function invalidate(reason){lastObservationPosition=null;snapshot=Object.assign({},snapshot||{},{evidence_status:'UNMATCHED',osm_way_id:null,graph_edge_id:null,segment_id:null,attributes_allowed:false,reason:reason});previous=null;}
    var api={invalidate:invalidate,observe:observe,getSnapshot:getSnapshot,getAttributes:getAttributes,getSpeedObservation:getSpeedObservation,getLaneObservation:getLaneObservation,matchesProviderLaneApproach:matchesProviderLaneApproach,getGraphHopperLaneGuidance:getGraphHopperLaneGuidance,classifyHazard:classifyHazard};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;
    root.VoyagrRoadMatchOrchestration=api;
})(typeof window!=='undefined'?window:globalThis);

/** One road identity owner for PWA GPS, lane, legal speed and hazard decisions. */
(function(root){
    'use strict';
    var context=null,index=null,snapshot=null,previous=null,line=null,activeRoute=null,generation=0,requestSeq=0,inFlight=false,lastFetch=0,vehicle='car';
    var lastObservationPosition=null;
    function moduleApi(){return root.VoyagrRoadMatching;}
    function currentVehicle(){var routing=root.VoyagrVehicleRoutingOrchestration;if(routing&&routing.getCurrentRoutingMode&&routing.getCurrentRoutingMode()!=='auto')return routing.getCurrentRoutingMode();var v=document.getElementById('vehicleType'),value=v&&v.value?v.value:'unknown';return value==='petrol_diesel'?'car':value;}
    function inside(c,p){return c&&c.bounds&&p[0]>=c.bounds[0]+.0005&&p[0]<=c.bounds[2]-.0005&&p[1]>=c.bounds[1]+.0008&&p[1]<=c.bounds[3]-.0008;}
    var primary=null,primaryRequest=null,primaryLastFetch=0,primarySeq=0;
    function primaryPositionUsable(position){
        var c=position&&position.coords,age=Date.now()-(position&&position.timestamp);
        return vehicle==='car'&&c&&[c.latitude,c.longitude,c.accuracy,age].every(Number.isFinite)&&
            Math.abs(c.latitude)<=90&&Math.abs(c.longitude)<=180&&c.accuracy>=0&&c.accuracy<=35&&age>=-1000&&age<=15000;
    }
    function primaryDistance(a,b){
        var lat=(a.latitude+b.latitude)*Math.PI/360;
        return Math.hypot((a.latitude-b.latitude)*111195,(a.longitude-b.longitude)*111195*Math.cos(lat));
    }
    function samePrimaryPosition(a,b){
        if(!a||!b||primaryDistance(a,b)>35)return false;
        if(Number.isFinite(a.heading)&&Number.isFinite(b.heading)){
            var d=Math.abs(a.heading-b.heading)%360;
            if(Math.min(d,360-d)>45)return false;
        }
        return true;
    }
    function clearPrimary(){
        primary=null;primarySeq++;primaryLastFetch=0;
        if(primaryRequest&&primaryRequest.controller)primaryRequest.controller.abort();
        primaryRequest=null;
    }
    function getPrimarySpeedObservation(){
        if(root.VoyagrJourneyModes&&root.VoyagrJourneyModes.isSimulating())return null;
        if(currentVehicle()!==vehicle||!primaryPositionUsable(lastObservationPosition)||!primary)return null;
        var age=Date.now()-primary.receivedAt;
        if(age<0||age>10000||Date.now()-primary.timestamp>15000||
            !samePrimaryPosition(primary.coords,lastObservationPosition.coords))return null;
        return primary.observation;
    }
    function getPrimarySpeedStatus(){
        return getPrimarySpeedObservation()?'AVAILABLE':primaryRequest?'LOADING':'UNAVAILABLE';
    }
    function refreshPrimary(position){
        if(!primaryPositionUsable(position))return;
        if(root.VoyagrJourneyModes&&root.VoyagrJourneyModes.isSimulating())return;
        var now=Date.now();
        if(primaryRequest||now-primaryLastFetch<10000)return;
        var seq=++primarySeq,gen=generation,coords=Object.assign({},position.coords),timestamp=position.timestamp;
        var controller=typeof AbortController!=='undefined'?new AbortController():null;
        primaryRequest={controller:controller};primaryLastFetch=now;
        var timer=controller?setTimeout(function(){controller.abort();},4000):null;
        // Do not borrow a road class from another part of the route.
        var roadType='unknown';
        fetch('/api/speed-limit/observation',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({lat:coords.latitude,lon:coords.longitude,accuracy:coords.accuracy,
                vehicle_type:vehicle,heading:Number.isFinite(coords.heading)?coords.heading:null,road_type:roadType}),
            signal:controller?controller.signal:undefined})
            .then(function(r){if(!r.ok)throw Error('Primary source unavailable');return r.json();})
            .then(function(data){
                if(seq!==primarySeq||gen!==generation||!primaryPositionUsable(lastObservationPosition)||
                    !samePrimaryPosition(coords,lastObservationPosition.coords)||Date.now()-timestamp>15000)return;
                var observation=data&&data.observation;
                var acquired=observation&&observation.acquired_at_ms;
                if(!data||data.status!=='AVAILABLE'||!observation||observation.source!=='TomTom'||
                    observation.evidence_state!=='MAPPED_OBSERVATION'||observation.applicable!==false||
                    !Number.isFinite(observation.speed_limit_mph)||observation.speed_limit_mph<=0||observation.speed_limit_mph>100||
                    !Number.isFinite(acquired)||Date.now()-acquired< -1000||Date.now()-acquired>10000){primary=null;return;}
                primary={observation:observation,coords:coords,timestamp:timestamp,receivedAt:Date.now()};
                var widget=root.VoyagrSpeedWidgetOrchestration;
                if(widget&&widget.refreshFromNavigationPosition)widget.refreshFromNavigationPosition();
            }).catch(function(){/* Existing Overpass/route fallback stays available. */})
            .finally(function(){if(timer)clearTimeout(timer);if(seq===primarySeq)primaryRequest=null;});
    }
    function observe(position,polyline,route){
        var now=Date.now(),v=currentVehicle();
        lastObservationPosition=position;
        if(polyline!==line || route!==activeRoute || v!==vehicle){line=polyline;activeRoute=route;generation++;requestSeq++;previous=null;snapshot=null;context=null;index=null;inFlight=false;lastFetch=0;vehicle=v;clearPrimary();}
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
                .then(function(data){
                    if(seq!==requestSeq||gen!==generation)return;
                    context=data&&data.context||null;index=context?api.createIndex(context):null;previous=null;inFlight=false;
                    // Context arrives after the GPS tick which requested it.
                    // Refresh presentation without inventing/replaying a GPS fix.
                    var widget=root.VoyagrSpeedWidgetOrchestration;
                    if(widget&&widget.refreshFromNavigationPosition){
                        try{widget.refreshFromNavigationPosition();}catch(_){/* Optional presentation cannot invalidate source data. */}
                    }
                })
                .catch(function(){/* Retain a still-fresh bounded context; never invent a replacement. */})
                .finally(function(){if(timer)clearTimeout(timer);if(seq===requestSeq)inFlight=false;});
        }
        refreshPrimary(position);
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
    function getSpeedObservationResult(){
        var api=moduleApi(),match=getSnapshot();
        var observation=api.speedObservation(match,context,vehicle,Date.now());
        if(observation)return {status:'AVAILABLE',reasonCode:'MAPPED_ROAD_MATCH',reason:observation.reason,observation:observation};
        if(api.assessSpeedObservationWithinUncertainty)return api.assessSpeedObservationWithinUncertainty(lastObservationPosition,index,vehicle,Date.now());
        observation=api.speedObservationWithinUncertainty ? api.speedObservationWithinUncertainty(lastObservationPosition,index,vehicle,Date.now()) : null;
        return {status:observation?'AVAILABLE':'UNAVAILABLE',reasonCode:observation?'MAPPED_SPEED_CONSENSUS':'SOURCE_UNAVAILABLE',
            reason:observation?observation.reason:'Road data unavailable',observation:observation};
    }
    function getSpeedObservation(){return getSpeedObservationResult().observation;}
    function getSpeedContextStatus(){
        var match=getSnapshot(),now=Date.now();
        var state=context?'available':'unavailable';
        if(context && (!Number.isFinite(context.acquired_at_ms)||now-context.acquired_at_ms<0||now-context.acquired_at_ms>(context.speed_observations_only?60000:86400000)))state='stale';
        if(context&&context.speed_observations_only&&(!Number.isFinite(context.source_data_at_ms)||now-context.source_data_at_ms<0||now-context.source_data_at_ms>72*3600000))state='outdated map data';
        if(index&&index.invalid)state='invalid geometry';
        if(inFlight&&!context)state='loading';
        var speed=getSpeedObservationResult();
        return {state:state,roadCount:context&&Array.isArray(context.roads)?context.roads.length:0,
            matchState:match&&match.evidence_status||'waiting',matchReason:match&&match.reason||'No road match yet',
            speedStatus:speed.status,speedReasonCode:speed.reasonCode,speedReason:speed.reason};
    }
    function getLaneObservation(){return moduleApi().laneObservation(getSnapshot(),context,vehicle,Date.now());}
    function matchesProviderLaneApproach(step){return moduleApi().providerLaneApproach(getSnapshot(),context,vehicle,Date.now(),line,step);}
    function getGraphHopperLaneGuidance(step){return root.VoyagrLaneConnectivity?root.VoyagrLaneConnectivity.resolve({match:getSnapshot(),context:context,vehicle:vehicle,now:Date.now(),line:line,step:step,route:activeRoute},moduleApi()):null;}
    function classifyHazard(h){return moduleApi().hazardAssociation(getSnapshot(),h,Date.now());}
    function invalidate(reason){clearPrimary();lastObservationPosition=null;snapshot=Object.assign({},snapshot||{},{evidence_status:'UNMATCHED',osm_way_id:null,graph_edge_id:null,segment_id:null,attributes_allowed:false,reason:reason});previous=null;}
    var api={getPrimarySpeedStatus:getPrimarySpeedStatus,getPrimarySpeedObservation:getPrimarySpeedObservation,invalidate:invalidate,observe:observe,getSnapshot:getSnapshot,getAttributes:getAttributes,getSpeedObservation:getSpeedObservation,getSpeedObservationResult:getSpeedObservationResult,getSpeedContextStatus:getSpeedContextStatus,getLaneObservation:getLaneObservation,matchesProviderLaneApproach:matchesProviderLaneApproach,getGraphHopperLaneGuidance:getGraphHopperLaneGuidance,classifyHazard:classifyHazard};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;
    root.VoyagrRoadMatchOrchestration=api;
})(typeof window!=='undefined'?window:globalThis);

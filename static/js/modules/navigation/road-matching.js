/** Version 1 source-linked road matching. PROBABLE never means surveyed truth. */
(function(root){
    'use strict';
    var CELL=.002,SOURCE_TTL_MS=86400000,FIX_TTL_MS=15000;
    function finite(v){return typeof v==='number' && Number.isFinite(v);}
    function distance(a,b){return Math.hypot((b[1]-a[1])*111320*Math.cos(a[0]*Math.PI/180),(b[0]-a[0])*110574);}
    function bearing(a,b){return (Math.atan2((b[1]-a[1])*Math.cos(a[0]*Math.PI/180),b[0]-a[0])*180/Math.PI+360)%360;}
    function project(p,a,b){var x=111320*Math.cos(p[0]*Math.PI/180),ax=(a[1]-p[1])*x,ay=(a[0]-p[0])*110574,dx=(b[1]-a[1])*x,dy=(b[0]-a[0])*110574;var t=dx||dy ? Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy))) : 0;return {t:t,distance:Math.hypot(ax+t*dx,ay+t*dy),coordinate:[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]};}
    function sameRoad(a,b){if(a.osm_way_id!=null && b.osm_way_id!=null)return String(a.osm_way_id)===String(b.osm_way_id);return a.graph_edge_id!=null && b.graph_edge_id!=null && !!a.graph_provider && a.graph_provider===b.graph_provider && String(a.graph_edge_id)===String(b.graph_edge_id);}
    function createIndex(dataset){
        var index={dataset:dataset||{},grid:new Map(),segments:[],bySegment:new Map(),invalid:false},refs=0,graphIds=new Map();
        var restrictions=index.dataset.restrictions||[];if(!Array.isArray(restrictions)||restrictions.length>10000||restrictions.some(function(r){return !r||typeof r!=='object'||Array.isArray(r);})){index.invalid=true;return index;}
        var roads=index.dataset.roads;
        if(!Array.isArray(roads)||roads.length>20000){index.invalid=true;return index;}
        roads.forEach(function(road,ri){
            if(!road || typeof road!=='object'||(road.tags && (typeof road.tags!=='object'||Array.isArray(road.tags)))){index.invalid=true;return;}
            if(Object.keys(road.tags||{}).some(function(k){return typeof road.tags[k]!=='string';})){index.invalid=true;return;}
            var graphKey=road.graph_provider+':'+road.graph_edge_id;
            if(road.graph_provider&&road.graph_edge_id!=null){if(graphIds.has(graphKey)&&graphIds.get(graphKey)!==road.osm_way_id){index.invalid=true;return;}graphIds.set(graphKey,road.osm_way_id);}
            var g=road.geometry,nodes=road.node_ids||[];
            if(!Array.isArray(g)||g.length<2||g.length>20000||g.some(function(p){return !Array.isArray(p)||p.length!==2||!p.every(finite)||Math.abs(p[0])>90||Math.abs(p[1])>180;}) || (nodes.length && (!Array.isArray(nodes)||nodes.length!==g.length))){index.invalid=true;return;}
            var along=0;
            for(var i=0;i<g.length-1;i++){
                var a=g[i],b=g[i+1],length=distance(a,b);if(length<=0)continue;
                var x0=Math.floor(Math.min(a[1],b[1])/CELL),x1=Math.floor(Math.max(a[1],b[1])/CELL),y0=Math.floor(Math.min(a[0],b[0])/CELL),y1=Math.floor(Math.max(a[0],b[0])/CELL),cells=(x1-x0+1)*(y1-y0+1);
                if(cells>1000 || refs+cells>200000 || index.segments.length>=100000){index.invalid=true;return;}
                refs+=cells;var id=index.segments.length;
                index.bySegment.set(ri+':'+i,id);
                index.segments.push({road:road,road_index:ri,segment:i,a:a,b:b,along:along,length:length});along+=length;
                for(var x=x0;x<=x1;x++)for(var y=y0;y<=y1;y++){var key=x+','+y;if(!index.grid.has(key))index.grid.set(key,[]);index.grid.get(key).push(id);}
            }
        });return index;
    }
    function nearby(index,p,radius){var dx=radius/(111320*Math.max(.05,Math.cos(p[0]*Math.PI/180))),dy=radius/110574,ids=new Set();for(var x=Math.floor((p[1]-dx)/CELL);x<=Math.floor((p[1]+dx)/CELL);x++)for(var y=Math.floor((p[0]-dy)/CELL);y<=Math.floor((p[0]+dy)/CELL);y++)(index.grid.get(x+','+y)||[]).forEach(function(i){ids.add(i);});return Array.from(ids).sort(function(a,b){return a-b;}).map(function(i){return index.segments[i];});}
    function matchPosition(position,index,opts){
        opts=opts||{};var now=opts.now,d=index.dataset,c=position.coords||{},stamp=position.timestamp,previous=opts.previous,generation=opts.route_generation||0;
        var result={schema_version:1,segment_id:null,osm_way_id:null,graph_edge_id:null,graph_provider:null,carriageway_id:null,route_segment_index:null,direction:null,matched_coordinate:null,distance_m:null,gps_accuracy_m:c.accuracy,heading_difference_deg:null,confidence:'NONE',data_source:d.source||null,source_revision:d.revision||null,source_acquired_at_ms:d.acquired_at_ms,evidence_status:'UNMATCHED',active_route_id:opts.active_route_id||null,route_generation:generation,match_timestamp_ms:stamp,attributes_allowed:false,source_link_verified:false,reason:'Insufficient evidence',node_ids:[]};
        function outcome(state,reason){return Object.assign({},result,{evidence_status:state,reason:reason});}
        if(![c.latitude,c.longitude,c.accuracy,stamp,now].every(finite)||Math.abs(c.latitude)>90||Math.abs(c.longitude)>180||c.accuracy<0||c.accuracy>35)return outcome('UNMATCHED','Invalid or inaccurate GPS');
        if(now-stamp < -1000 || now-stamp>FIX_TTL_MS)return outcome('STALE','GPS age outside policy');
        if(previous && finite(previous.match_timestamp_ms) && stamp<=previous.match_timestamp_ms)return outcome('STALE','Out-of-order GPS');
        if(d.schema_version!==1 || index.invalid || !d.source || !d.revision)return outcome('UNMATCHED','Invalid source context');
        if(!finite(d.acquired_at_ms)||now-d.acquired_at_ms<0||now-d.acquired_at_ms>SOURCE_TTL_MS)return outcome('STALE','Road source age outside policy');
        var p=[c.latitude,c.longitude],bounds=d.bounds;
        if(!Array.isArray(bounds)||bounds.length!==4||!bounds.every(finite)||p[0]<bounds[0]||p[0]>bounds[2]||p[1]<bounds[1]||p[1]>bounds[3])return outcome('UNMATCHED','Outside source coverage');
        var qualified=finite(c.heading)&&c.heading>=0&&c.heading<360&&finite(c.speed)&&c.speed>=3&&c.speed<=80&&c.accuracy<=15&&(c.headingAccuracy==null || finite(c.headingAccuracy)&&c.headingAccuracy>=0&&c.headingAccuracy<=30);
        var candidates=[];
        nearby(index,p,Math.max(12,c.accuracy)).forEach(function(segment){
            var projection=project(p,segment.a,segment.b);if(projection.distance>Math.max(12,c.accuracy))return;
            var road=segment.road,tags=road.tags||{},one=String(tags.oneway||'').toLowerCase();
            var dirs=one==='-1' ? ['backward'] : ['yes','1','true'].includes(one)||(tags.junction==='roundabout'&&!['no','0','false'].includes(one)) ? ['forward'] : ['forward','backward'];
            dirs.forEach(function(direction){var travel=(bearing(segment.a,segment.b)+(direction==='backward'?180:0))%360,delta=qualified?Math.abs((travel-c.heading+540)%360-180):null;if(qualified&&delta>45)return;candidates.push(Object.assign({},segment,projection,{direction:direction,delta:delta,progress:segment.along+projection.t*segment.length}));});
        });
        if(!candidates.length)return outcome('UNMATCHED','No direction-compatible road candidate');
        candidates.sort(function(a,b){return a.road_index-b.road_index||a.direction.localeCompare(b.direction)||a.segment-b.segment;});var groups=[];
        candidates.forEach(function(candidate){var g=groups[groups.length-1],last=g&&g[g.length-1];if(last&&candidate.road_index===last.road_index&&candidate.direction===last.direction&&candidate.segment<=last.segment+1)g.push(candidate);else groups.push([candidate]);});
        if(groups.length!==1)return outcome('AMBIGUOUS','Multiple road/direction hypotheses remain');
        var best=groups[0].reduce(function(a,b){return a.distance<=b.distance?a:b;}),road=best.road,nodes=road.node_ids||[];
        var prev=previous&&previous.source_revision===d.revision&&previous.route_generation===generation?previous:null,gap=prev&&finite(prev.match_timestamp_ms)?(stamp-prev.match_timestamp_ms)/1000:null;
        var continuous=!!prev&&gap!==null&&gap>0&&gap<=15&&prev.evidence_status==='PROBABLE';
        if(continuous){
            if(!sameRoad(prev,road)){
                var shared=nodes.map(String).filter(function(n){return (prev.node_ids||[]).map(String).includes(n);});
                if(!shared.length)return outcome('AMBIGUOUS','Transition lacks source connectivity');
                var previousRoad=(d.roads||[]).find(function(r){return sameRoad(prev,r);});
                function nodeOffset(r,node){var total=0;for(var ni=0;ni<(r.node_ids||[]).length;ni++){if(String(r.node_ids[ni])===node)return total;if(ni+1<r.geometry.length)total+=distance(r.geometry[ni],r.geometry[ni+1]);}return Infinity;}
                var cost=previousRoad?Math.min.apply(null,shared.map(function(n){return Math.abs(nodeOffset(previousRoad,n)-(prev.along_road_m||0))+Math.abs(nodeOffset(road,n)-best.progress);})):Infinity;
                if(cost>Math.max(10,finite(c.speed)?c.speed:0)*gap+2*c.accuracy+20)return outcome('AMBIGUOUS','Connectivity exists only beyond plausible travel distance');
                if((d.restrictions||[]).some(function(r){if(String(r.from_way)!==String(prev.osm_way_id)||!shared.includes(String(r.via_node)))return false;var target=String(road.osm_way_id),kind=r.restriction||'';return kind.startsWith('no_')&&String(r.to_way)===target||kind.startsWith('only_')&&String(r.to_way)!==target;}))return outcome('AMBIGUOUS','Source turn restriction conflicts');
            }
            if(prev.matched_coordinate&&distance(prev.matched_coordinate,best.coordinate)>Math.max(10,finite(c.speed)?c.speed:0)*gap+2*c.accuracy+20)return outcome('AMBIGUOUS','Implausible transition distance');
            if(sameRoad(prev,road)&&prev.direction!==best.direction)continuous=false;
        }
        var linked=road.osm_way_id!=null||road.graph_edge_id!=null&&!!road.graph_provider,tags=road.tags||{},vehicle=opts.vehicle||'car';
        var allowed=!['no','private'].includes(tags.access)&&!['no','private'].includes(tags.motor_vehicle)&&!['no','private'].includes(tags[vehicle==='car'?'motorcar':'motorcycle'])&&!Object.keys(tags).some(function(k){return k.includes('conditional');})&&['car','motorcycle'].includes(vehicle);
        ['segment_id','osm_way_id','graph_edge_id','graph_provider','carriageway_id'].forEach(function(k){result[k]=road[k]==null?null:road[k];});
        return Object.assign(result,{evidence_status:'PROBABLE',confidence:qualified&&continuous?'HIGH':'LOW',direction:best.direction,matched_coordinate:best.coordinate,distance_m:best.distance,heading_difference_deg:best.delta,source_link_verified:linked,node_ids:nodes,source_road_index:best.road_index,source_segment_index:best.segment,along_road_m:best.progress,reason:'Unique source hypothesis; probabilistic position, not surveyed truth',attributes_allowed:!!(qualified&&continuous&&linked&&allowed&&d.coverage==='COMPLETE'&&!(d.restrictions||[]).some(function(r){return r.unsupported;})&&[bounds[1],bounds[3]].every(function(b){return distance(p,[p[0],b])>Math.max(12,c.accuracy);})&&[bounds[0],bounds[2]].every(function(b){return distance(p,[b,p[1]])>Math.max(12,c.accuracy);}))});
    }
    function bindRoute(match,polyline,bindings,index){
        var result=Object.assign({},match,{route_relation:'UNVERIFIED'});
        if(match.evidence_status!=='PROBABLE')return result;
        var typed=(bindings||[]).filter(function(r){return r.osm_way_id!=null||r.graph_edge_id!=null&&r.graph_provider;});
        if(typed.length){var bound=typed.find(function(r){return sameRoad(match,r);});if(!bound){result.route_relation='DIFFERENT';return result;}result.route_relation='MATCHED';result.route_segment_index=bound.begin_shape_index;return result;}
        var segment=index&&index.segments[index.bySegment.get(match.source_road_index+':'+match.source_segment_index)];
        if(!segment||!Array.isArray(polyline))return result;
        var heading=(bearing(segment.a,segment.b)+(match.direction==='backward'?180:0))%360,candidates=[];
        for(var i=0;i<polyline.length-1;i++){
            var a=polyline[i],b=polyline[i+1];
            if(!Array.isArray(a)||!Array.isArray(b)||!a.every(finite)||!b.every(finite))return result;
            var p=project(match.matched_coordinate,a,b),delta=Math.abs((bearing(a,b)-heading+540)%360-180);
            if(p.distance<=5 && delta<=45)candidates.push(i);
        }
        if(!candidates.length){result.route_relation='DIFFERENT';return result;}
        if(candidates.some(function(n,j){return j>0&&n>candidates[j-1]+1;}))return result;
        result.route_relation='GEOMETRY_COMPATIBLE';result.route_segment_index=candidates[0];return result;
    }
    function shouldPauseNavigation(match){return !!match&&!!match.context_available&&(match.evidence_status!=='PROBABLE'||!['MATCHED','GEOMETRY_COMPATIBLE'].includes(match.route_relation));}
    function supportsDeviation(match,now){return usable(match,now)&&match.route_relation==='DIFFERENT';}
    function usable(match,now){return !!match&&match.evidence_status==='PROBABLE'&&match.attributes_allowed===true&&finite(match.match_timestamp_ms)&&now-match.match_timestamp_ms>=0&&now-match.match_timestamp_ms<=FIX_TTL_MS&&finite(match.source_acquired_at_ms)&&now-match.source_acquired_at_ms>=0&&now-match.source_acquired_at_ms<=SOURCE_TTL_MS;}
    function attributes(match,context,vehicle,now){
        if(!usable(match,now)||!context||context.revision!==match.source_revision)return null;
        var road=(context.roads||[])[match.source_road_index],bundle=road&&road.attribute_bundles&&road.attribute_bundles[match.direction];
        if(!road||!sameRoad(road,match)||!bundle||bundle.vehicle!==vehicle)return null;
        var speed=bundle.speed,age=speed&&now/1000-speed.observed_at;
        return {lanes:bundle.lanes||{},speed:speed&&age>=0&&age<=300?speed:{evidence_state:'UNKNOWN',applicable:false,speed_limit_mph:null}};
    }
    function hazardAssociation(match,hazard,now){
        var stamp=hazard.observed_at_ms,u=hazard.position_uncertainty_m==null?20:hazard.position_uncertainty_m;
        if(!usable(match,now)||!finite(stamp)||now-stamp<0||now-stamp>600000||!finite(u)||u<0||u>35)return 'POSSIBLE';
        if(hazard.valid_until!=null&&(!finite(hazard.valid_until)||hazard.valid_until<now/1000))return 'POSSIBLE';
        if(hazard.average_speed_section_id!=null&&hazard.average_speed_section_id!==match.average_speed_section_id)return 'POSSIBLE';
        var comparable=match.osm_way_id!=null&&hazard.osm_way_id!=null||match.graph_edge_id!=null&&hazard.graph_edge_id!=null&&!!match.graph_provider&&match.graph_provider===hazard.graph_provider;
        if(!comparable)return 'POSSIBLE';
        if(!sameRoad(match,hazard))return 'UNRELATED';
        if(match.carriageway_id!=null&&hazard.carriageway_id!=null&&match.carriageway_id!==hazard.carriageway_id)return 'UNRELATED';
        if(['forward','backward'].includes(hazard.direction)&&['forward','backward'].includes(match.direction)&&hazard.direction!==match.direction)return 'UNRELATED';
        return hazard.direction==='both'||hazard.direction===match.direction?'APPLICABLE':'POSSIBLE';
    }
    var api={createIndex:createIndex,nearby:nearby,matchPosition:matchPosition,attributes:attributes,hazardAssociation:hazardAssociation,usable:usable,sameRoad:sameRoad,bindRoute:bindRoute,shouldPauseNavigation:shouldPauseNavigation,supportsDeviation:supportsDeviation};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;
    root.VoyagrRoadMatching=api;
})(typeof window!=='undefined'?window:globalThis);

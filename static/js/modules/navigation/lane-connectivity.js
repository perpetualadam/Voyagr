/** Positive OSM lane connections scoped to the selected GraphHopper junction. */
(function(root){
    'use strict';
    const HIGHWAYS = ['motorway','motorway_link','trunk','trunk_link','primary','primary_link',
        'secondary','secondary_link','tertiary','tertiary_link','unclassified','residential','service','living_street'];
    const TYPES = [8,9,10,11,14,15,16,18,19,20,21,22,23,24];
    const DESCRIPTIVE = ['type','source','note','description'];
    function distance(a,b){return Math.hypot((b[1]-a[1])*111320*Math.cos(a[0]*Math.PI/180),(b[0]-a[0])*110574);}
    function interior(p,b){return Array.isArray(b)&&b.length===4&&p[0]>b[0]&&p[0]<b[2]&&p[1]>b[1]&&p[1]<b[3]&&
        [b[0],b[2]].every(v=>distance(p,[v,p[1]])>15)&&[b[1],b[3]].every(v=>distance(p,[p[0],v])>15);}
    function count(road,direction){
        const tags=road.tags||{},one=['yes','1','true','-1'].includes(tags.oneway);
        const raw=tags['lanes:'+direction]||(one?tags.lanes:null);
        if(typeof raw!=='string'||!/^\d+$/.test(raw)||Number(raw)<1||Number(raw)>12)return null;
        if(tags.lanes&&(!/^\d+$/.test(tags.lanes)||Number(tags.lanes)<Number(raw)||Number(tags.lanes)>24))return null;
        if(tags.lanes&&tags['lanes:forward']&&tags['lanes:backward']&&Number(tags['lanes:forward'])+Number(tags['lanes:backward'])!==Number(tags.lanes))return null;
        return Number(raw);
    }
    function allowedRoad(road,direction,vehicle){
        const tags=road.tags||{},one=tags.oneway;
        if(!HIGHWAYS.includes(tags.highway)||tags.junction==='roundabout'||['reversible','alternating'].includes(one))return false;
        if((['yes','1','true'].includes(one)&&direction!=='forward')||(one==='-1'&&direction!=='backward'))return false;
        if(['access','vehicle','motor_vehicle',vehicle==='car'?'motorcar':'motorcycle'].some(k=>['no','private'].includes(tags[k])))return false;
        return !Object.keys(tags).some(k=>k.includes('conditional')||k.includes('lanes')&&
            !/^(lanes|turn:lanes|destination:lanes|destination:ref:lanes)(:(forward|backward))?$/.test(k));
    }
    function roadProjection(p,g){
        let best=null,along=0;
        for(let i=0;i<g.length-1;i++){
            const a=g[i],b=g[i+1],x=111320*Math.cos(p[0]*Math.PI/180),y=110574;
            const ax=(a[1]-p[1])*x,ay=(a[0]-p[0])*y,dx=(b[1]-a[1])*x,dy=(b[0]-a[0])*y;
            const t=dx||dy?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy))):0;
            const d=Math.hypot(ax+t*dx,ay+t*dy),length=distance(a,b);
            if(!best||d<best.distance)best={distance:d,along:along+t*length};
            along+=length;
        }
        return best;
    }
    function departureSamples(line,index,bounds){
        const points=[];let total=0;
        for(let i=index+1;i<line.length&&i<=index+8;i++){
            const a=line[i-1],b=line[i];
            if(!Array.isArray(b)||b.length!==2||!b.every(Number.isFinite))return null;
            const length=distance(a,b),take=Math.min(length,30-total);
            if(length>0){
                for(const fraction of [.5,1]){
                    const t=take*fraction/length,p=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];
                    if(!interior(p,bounds))return null;
                    points.push(p);
                }
            }
            total+=take;
            if(total>=30)return points;
        }
        return null;
    }
    function outgoingRoad(roads,incoming,via,line,index,bounds,vehicle){
        const samples=departureSamples(line,index,bounds);
        if(!samples)return null;
        const candidates=[];
        for(const road of roads){
            if(String(road.osm_way_id)===String(incoming.osm_way_id))continue;
            const nodes=road.node_ids||[],g=road.geometry;
            if(!Array.isArray(g)||g.length<2||g.length>1000||nodes.length!==g.length)continue;
            const start=String(nodes[0])===via,end=String(nodes[nodes.length-1])===via;
            if(start===end)continue;
            const direction=start?'forward':'backward',geometry=start?g:g.slice().reverse();
            if(distance(geometry[0],line[index])>8)continue;
            let previous=0,valid=true;
            for(const p of samples){
                const q=roadProjection(p,geometry);
                if(!q||q.distance>6||q.along<previous-3){valid=false;break;}
                previous=q.along;
            }
            if(valid&&previous>=20)candidates.push({road,direction,count:count(road,direction)});
            if(candidates.length>1)return null;
        }
        const selected=candidates.length===1?candidates[0]:null;
        return selected&&allowedRoad(selected.road,selected.direction,vehicle)&&selected.count?selected:null;
    }
    function directConnections(raw,fromCount,toCount){
        if(typeof raw!=='string'||!raw.length||raw.length>512)return null;
        const rows=raw.split('|'),seen=new Set(),usable=[];
        if(rows.length>12)return null;
        for(const row of rows){
            const parts=row.split(':');
            if(parts.length!==2||!/^\d+$/.test(parts[0]))return null;
            const from=Number(parts[0]),targets=parts[1].split(','),targetSeen=new Set();let direct=false;
            if(from<1||from>fromCount||seen.has(from)||targets.length>12)return null;
            seen.add(from);
            for(const target of targets){
                const parsed=/^(\d+)$|^\((\d+)\)$/.exec(target);
                if(!parsed)return null;
                const to=Number(parsed[1]||parsed[2]);
                if(to<1||to>toCount||targetSeen.has(to))return null;
                targetSeen.add(to);
                if(parsed[1])direct=true;
            }
            if(direct)usable.push(from);
        }
        return usable.sort((a,b)=>a-b);
    }
    function relevant(record,from){return record.from_way===from||(record.from_ways||[]).includes(from);}
    function resolve(options,matching){
        if(!options||!matching||typeof matching.junctionApproach!=='function')return null;
        const {match,context,vehicle,now,line,step,route}=options;
        if(!route||route.source!=='GraphHopper'||!step||!TYPES.includes(step.type)||
            !matching.junctionApproach(match,context,vehicle,now,line,step))return null;
        const layout=matching.laneObservation(match,context,vehicle,now),meta=context.lane_connectivity;
        if(!layout||!meta||!Number.isFinite(meta.acquired_at_ms)||now-meta.acquired_at_ms<0||now-meta.acquired_at_ms>60000||
            !Array.isArray(meta.relations)||meta.relations.length>256)return null;
        const incoming=context.roads[match.source_road_index],from=String(incoming.osm_way_id),nodes=incoming.node_ids||[];
        const via=String(match.direction==='forward'?nodes[nodes.length-1]:nodes[0]),junction=line[step.begin_shape_index];
        if(!allowedRoad(incoming,match.direction,vehicle)||!interior(junction,context.bounds))return null;
        if(meta.relations.some(r=>!r||r.unsupported&&(!(r.from_ways||[]).length||relevant(r,from)||(r.member_ways||[]).includes(from))))return null;
        const outgoing=outgoingRoad(context.roads,incoming,via,line,step.begin_shape_index,context.bounds,vehicle);
        if(!outgoing)return null;
        const to=String(outgoing.road.osm_way_id);
        if(meta.relations.some(r=>r.unsupported&&(r.member_ways||[]).includes(to)))return null;
        const relations=meta.relations.filter(r=>r.from_way===from&&r.via_node===via);
        for(const r of relations){
            const tags=r.tags||{};
            if(tags.type==='restriction'){
                const kind=tags.restriction;
                if(Object.keys(tags).some(k=>!DESCRIPTIVE.concat(['restriction']).includes(k))||
                    !['no_left_turn','no_right_turn','no_straight_on','no_u_turn','no_entry','no_exit',
                        'only_left_turn','only_right_turn','only_straight_on'].includes(kind))return null;
                if(kind.startsWith('no_')&&r.to_way===to||kind.startsWith('only_')&&r.to_way!==to)return null;
            }
        }
        const connections=relations.filter(r=>r.tags&&r.tags.type==='connectivity'&&r.to_way===to);
        if(connections.length!==1)return null;
        const connection=connections[0],tags=connection.tags;
        if(typeof connection.osm_relation_id!=='string'||!/^[1-9]\d*$/.test(connection.osm_relation_id))return null;
        if(Object.keys(tags).some(k=>!DESCRIPTIVE.concat(['connectivity']).includes(k)))return null;
        const lanes=directConnections(tags.connectivity,layout.total_lanes,outgoing.count);
        if(!lanes||!lanes.length)return null;
        return Object.assign({},layout,{source:'osm_lane_connectivity',evidence_state:'MAPPED_CONNECTIVITY',
            has_osm_data:true,has_turn_lanes:true,confidence:95,show_lane_guidance:true,
            recommended_lanes:lanes,recommended_lane:lanes[0],valid_lanes:lanes,preferred_lanes:[],
            lane_scope:'osm:'+connection.osm_relation_id+':'+step.begin_shape_index,
            connectivity_relation_id:connection.osm_relation_id,from_way:from,via_node:via,to_way:to,
            lane_change_needed:false,current_lane:null});
    }
    const api={resolve,directConnections};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;
    root.VoyagrLaneConnectivity=api;
})(typeof window!=='undefined'?window:globalThis);

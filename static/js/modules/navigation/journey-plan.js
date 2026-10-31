/** Pure inspection/provenance helpers. None of these functions grants live permission. */
(function(root){
    'use strict';
    var KINDS=['gps','searched','map','coordinates','saved','unknown'];
    function coordinate(value){
        if(typeof value==='string')value=value.split(',').map(function(x){return x.trim()===''?NaN:Number(x);});
        if(!Array.isArray(value)||value.length!==2||value.some(function(x){return !Number.isFinite(x);})||Math.abs(value[0])>90||Math.abs(value[1])>180)return null;
        return value.slice();
    }
    function distance(a,b){
        var rad=Math.PI/180,dy=(b[0]-a[0])*rad,dx=(b[1]-a[1])*rad;
        var h=Math.sin(dy/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dx/2)**2;
        return 12742000*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
    }
    function endpoint(input,value){
        var data=input&&input.dataset||{},kind=KINDS.indexOf(data.journeySource)>=0?data.journeySource:coordinate(input&&input.value)?'coordinates':'searched';
        if(kind==='searched'&&coordinate(input&&input.value))kind='coordinates';
        return Object.assign({kind:kind,coordinates:coordinate(value)},KINDS.indexOf(data.journeyOriginalSource)>=0&&data.journeyOriginalSource!=='unknown'?{source_kind:data.journeyOriginalSource}:{});
    }
    function requestContext(body,startInput,endInput){
        return {version:1,purpose:'planning',origin:endpoint(startInput,body.start),destination:endpoint(endInput,body.end),
            stops:(body.stops||[]).map(function(s){return {kind:KINDS.indexOf(s.provenance)>=0?s.provenance:'unknown',coordinates:[s.lat,s.lon]};})};
    }
    function inspection(route,integrity){
        var points=integrity.geometryPoints(route);
        if(!points||route.geometry_complete===false)throw Error('Complete route geometry is unavailable. Recalculate before animating this journey.');
        var ranges=route.leg_geometry_ranges;
        if(ranges!==undefined && (!Array.isArray(ranges)||!ranges.length||ranges.some(function(r,i){
            return !r||!Number.isInteger(r.begin_shape_index)||!Number.isInteger(r.end_shape_index)||r.begin_shape_index<0||r.end_shape_index<=r.begin_shape_index||r.end_shape_index>=points.length||(i===0?r.begin_shape_index!==0:r.begin_shape_index!==ranges[i-1].end_shape_index);
        })||ranges[ranges.length-1].end_shape_index!==points.length-1))throw Error('Journey legs are incomplete or disconnected. Inspect the route and recalculate.');
        var stops=route.journey_context&&route.journey_context.ordered_stops;
        if(Array.isArray(stops)&&stops.length&&(!ranges||ranges.length!==stops.length+1))throw Error('Complete stop geometry is unavailable. Recalculate without skipping visits.');
        var lengths=[0];for(var i=1;i<points.length;i++)lengths.push(lengths[i-1]+distance(points[i-1],points[i]));
        var steps=Array.isArray(route.maneuvers)?route.maneuvers:[];
        if(steps.some(function(s){return !s||typeof s.instruction!=='string'||!s.instruction.trim()||['begin_shape_index','end_shape_index'].some(function(k){return s[k]!==undefined&&(!Number.isInteger(s[k])||s[k]<0||s[k]>=points.length);})||(s.begin_shape_index!==undefined&&s.end_shape_index!==undefined&&s.end_shape_index<s.begin_shape_index);}))throw Error('Maneuver geometry is inconsistent. Recalculate before simulating.');
        var minutes=Number(route.duration_minutes);
        return {points:points,lengths:lengths,total:lengths[lengths.length-1],steps:steps.filter(function(s){return Number.isInteger(s.begin_shape_index);}),ranges:ranges||[],
            metersPerSecond:minutes>0&&Number.isFinite(minutes)?lengths[lengths.length-1]/(minutes*60):13.8889};
    }
    function position(plan,meters){
        var d=Math.max(0,Math.min(plan.total,meters)),index=0;
        while(index<plan.points.length-2&&plan.lengths[index+1]<=d)index++;
        var part=plan.lengths[index+1]-plan.lengths[index],t=part?Math.min(1,(d-plan.lengths[index])/part):0;
        var a=plan.points[index],b=plan.points[index+1];
        return {lat:a[0]+(b[0]-a[0])*t,lon:a[1]+(b[1]-a[1])*t,index:index,remaining_m:Math.max(0,plan.total-d),
            instruction:(plan.steps.filter(function(s){return (s.begin_shape_index||0)<=index;}).slice(-1)[0]||{}).instruction||'Maneuver instructions unavailable — geometry inspection only',
            completedStops:plan.ranges.slice(0,-1).filter(function(r){return plan.lengths[r.end_shape_index]<=d;}).length};
    }
    function liveIntent(route,active,index){
        if(!route)throw Error('Select a planned journey first.');
        if(active&&(!Number.isInteger(index)||index<0))throw Error('Current journey progress is unavailable. Stop and replan before live navigation.');
        var context=route.journey_context;
        if(route.navigation_resume_requires_fresh_gps&&(!context||!Array.isArray(context.ordered_stops)||!context.destination||!coordinate(context.destination.coordinates)))throw Error('This saved journey lacks endpoint and stop context. Replan it before live navigation.');
        var destination=context&&context.destination&&coordinate(context.destination.coordinates)||coordinate(route.destination);
        var destinationText=destination?destination.join(','):route.destination;
        if(typeof destinationText!=='string'||!destinationText.trim())throw Error('The destination is missing. Replan this journey.');
        var stops=context&&context.ordered_stops;
        if(!Array.isArray(stops)){
            var ranges=route.leg_geometry_ranges;
            if(Array.isArray(ranges)&&ranges.length>1)stops=ranges.slice(0,-1).map(function(r){return Object.assign({},r.stop,{coordinates:r.waypoint&&[r.waypoint.lat,r.waypoint.lon],kind:'unknown'});});
            else if(route.multi_drop||route.legs&&route.legs.length>1)throw Error('Stop order is unavailable. Recalculate the complete journey before live navigation.');
            else stops=[];
        }
        if((route.multi_drop&&!stops.length)||(Array.isArray(route.leg_geometry_ranges)&&route.leg_geometry_ranges.length!==stops.length+1))throw Error('Stop order and leg geometry disagree. Replan the complete journey.');
        if(active&&stops.length&&(!Array.isArray(route.leg_geometry_ranges)||route.leg_geometry_ranges.length!==stops.length+1))throw Error('Remaining stops cannot be established. Replan before starting from GPS.');
        var preserved=[];
        stops.forEach(function(stop,i){
            var point=coordinate(stop.coordinates);
            if(!point)throw Error('A journey stop has no reliable coordinates. Replan without skipping stops.');
            if(active&&route.leg_geometry_ranges[i].end_shape_index<=index)return;
            preserved.push(Object.assign({lat:point[0],lon:point[1],name:stop.name||'Journey stop',duration:Number(stop.duration_minutes||stop.duration)||0,
                original_index:stop.original_index===undefined?i:stop.original_index,provenance:KINDS.indexOf(stop.kind)>=0?stop.kind:'unknown'},KINDS.indexOf(stop.source_kind)>=0&&stop.source_kind!=='unknown'?{source_kind:stop.source_kind}:{}));
        });
        return {destination:destinationText,destinationName:route.destinationName||destinationText,stops:preserved,
            destinationProvenance:context&&context.destination||{kind:'unknown',coordinates:destination}};
    }
    var api={coordinate:coordinate,distance:distance,endpoint:endpoint,requestContext:requestContext,inspection:inspection,position:position,liveIntent:liveIntent};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;root.VoyagrJourneyPlan=api;
})(typeof globalThis!=='undefined'?globalThis:this);

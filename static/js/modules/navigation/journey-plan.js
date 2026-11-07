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
    function searchEvidence(result,lat,lon){
        var point=coordinate([lat,lon]);
        if(!result||typeof result!=='object'||!point)return null;
        var type=String(result.addresstype||result.type||'').toLowerCase().replace(/\s/g,''),category=String(result.class||'');
        var semantic=['city','town','village','hamlet','municipality','county','state','country','administrative','suburb'].indexOf(type)>=0?'locality':
            ['address','pointaddress','addressrange','house','building'].indexOf(type)>=0?'address':
            ['road','residential','motorway','primary','secondary','tertiary'].indexOf(type)>=0?'road':
            type==='poi'||['amenity','shop','office','tourism','leisure'].indexOf(category)>=0?'poi':'unknown';
        var provider=result._source==='overpass'?'overpass':result._source==='tomtom'?'tomtom':result._source==='nominatim'||result.osm_type||result.place_id?'nominatim':'unknown';
        var value={version:1,coordinates:point,semantic_class:semantic,provider:provider};
        var ref=result.osm_id!==undefined?String(result.osm_type||'')+':'+String(result.osm_id):result.id!==undefined?String(result.id):result.place_id!==undefined?String(result.place_id):null;
        if(ref&&ref.length<=128)value.provider_ref=ref;
        var box=result.boundingbox;
        if(Array.isArray(box)&&box.length===4&&box.every(function(x){return (typeof x==='number'||typeof x==='string'&&x.trim()!=='')&&Number.isFinite(Number(x));})){
            var b=box.map(Number);if(b[0]>=-90&&b[1]<=90&&b[0]<=b[1]&&b[2]>=-180&&b[3]<=180&&b[2]<=b[3])value.bounds=[b[0],b[2],b[1],b[3]];
        }
        if(Array.isArray(result.entry_points))value.entry_points=result.entry_points.slice(0,8).filter(function(e){return e&&coordinate([e.lat,e.lon]);}).map(function(e){return {coordinates:[e.lat,e.lon],type:typeof e.type==='string'?e.type.slice(0,40):'unknown'};});
        return value;
    }
    function endpoint(input,value){
        var data=input&&input.dataset||{},kind=KINDS.indexOf(data.journeySource)>=0?data.journeySource:coordinate(input&&input.value)?'coordinates':'searched';
        if(kind==='searched'&&coordinate(input&&input.value))kind='coordinates';
        var result=Object.assign({kind:kind,coordinates:coordinate(value)},KINDS.indexOf(data.journeyOriginalSource)>=0&&data.journeyOriginalSource!=='unknown'?{source_kind:data.journeyOriginalSource}:{});
        try{var evidence=JSON.parse(data.journeySearchEvidence||'null');if(kind==='searched'&&evidence&&evidence.version===1&&JSON.stringify(evidence.coordinates)===JSON.stringify(result.coordinates))result.search_evidence=evidence;}catch(_){}
        return result;
    }
    var ARRIVAL_MODES=['place','roadside','vehicle_entrance'];
    function requestedArrivalIntent(body){
        var select=typeof document!=='undefined'&&document.getElementById('arrivalIntent');
        var mode=select?select.value:'place';
        if(ARRIVAL_MODES.indexOf(mode)<0)throw Error('Choose a supported arrival intent before recalculating.');
        if(body.round_trip&&mode!=='place')throw Error('Use the default arrival intent for a round trip.');
        return {version:1,mode:mode,target:coordinate(body.round_trip?body.start:body.end)};
    }
    function requestContext(body,startInput,endInput){
        return {version:1,purpose:'planning',origin:endpoint(startInput,body.start),destination:endpoint(endInput,body.end),arrival_intent:requestedArrivalIntent(body),
            stops:(body.stops||[]).map(function(s){return {kind:KINDS.indexOf(s.provenance)>=0?s.provenance:'unknown',coordinates:[s.lat,s.lon]};})};
    }
    function destinationKey(input){return JSON.stringify([input&&input.value,input&&input.dataset.lat,input&&input.dataset.lon]);}
    // Presentation only: never changes selected coordinates, provenance or live permission.
    function syncArrivalSummary(){
        if(typeof document==='undefined')return;
        var summary=document.getElementById('arrivalOptionsSummary');if(!summary)return;
        var input=document.getElementById('drivingArrival'),intent=document.getElementById('arrivalIntent'),price=document.getElementById('arrivalParkingPrice');
        var value=input&&input.value.trim(),parts=[value?(input.dataset.displayName===input.value&&input.dataset.lat&&input.dataset.lon?'Driving arrival: ':'Select a result: ')+value:'Use destination'];
        if(intent&&intent.value!=='place')parts.push(intent.value==='roadside'?'Roadside — preview only':intent.value==='vehicle_entrance'?'Vehicle entrance — preview only':'Unsupported intent — choose again');
        if(price&&price.value!=='any')parts.push(price.value==='free'?'Parking search: reported free':'Parking search: reported paid');
        summary.textContent=parts.join(' · ');
    }
    function clearArrival(){
        var input=typeof document!=='undefined'&&document.getElementById('drivingArrival');
        var context=typeof document!=='undefined'&&document.getElementById('arrivalSearchContext');
        if(context)context.textContent='';
        var intent=typeof document!=='undefined'&&document.getElementById('arrivalIntent');if(intent)intent.value='place';
        if(input){input.value='';Object.keys(input.dataset).forEach(function(key){delete input.dataset[key];});}
        var dropdown=typeof document!=='undefined'&&document.getElementById('autocomplete_drivingArrival');
        if(dropdown)dropdown.classList.remove('show');
        syncArrivalSummary();
    }
    function applyDrivingArrival(body,startInput,endInput,arrivalInput){
        var context=requestContext(body,startInput,endInput);
        if(!arrivalInput||!arrivalInput.value.trim())return context;
        if(body.round_trip)throw Error('Clear the driving arrival point for a round trip.');
        var point=coordinate([Number(arrivalInput.dataset.lat),Number(arrivalInput.dataset.lon)]);
        if(!point||!arrivalInput.dataset.lat||!arrivalInput.dataset.lon||arrivalInput.dataset.displayName!==arrivalInput.value||
            arrivalInput.dataset.arrivalFor!==destinationKey(endInput))throw Error('Select the driving arrival point again for the current destination.');
        var requested=Object.assign({},context.destination,{label:String(endInput.value).slice(0,120)});
        body.end=point.join(',');
        context.destination=Object.assign(endpoint(arrivalInput,body.end),{label:arrivalInput.value.slice(0,120)});
        context.arrival_intent.target=point.slice();
        context.arrival_choice={version:1,target:point,requested_destination:requested};
        return context;
    }
    function restoreArrival(context,endInput,arrivalInput){
        clearArrival();
        var intentSelect=typeof document!=='undefined'&&document.getElementById('arrivalIntent'),intent=context&&context.arrival_intent;
        if(intentSelect&&intent){
            if(intent.version===1&&ARRIVAL_MODES.indexOf(intent.mode)>=0)intentSelect.value=intent.mode;
            else{
                if(!intentSelect.querySelector('option[value=unsupported]')){var option=document.createElement('option');option.value='unsupported';option.textContent='Unsupported saved intent — choose again';intentSelect.appendChild(option);}
                intentSelect.value='unsupported';
            }
        }
        syncArrivalSummary();
        var choice=context&&context.arrival_choice,original=choice&&choice.requested_destination;
        var target=context&&context.destination,point=target&&coordinate(target.coordinates),requested=original&&coordinate(original.coordinates);
        if(!endInput||!arrivalInput||!choice||choice.version!==1||!point||!requested||JSON.stringify(choice.target)!==JSON.stringify(point))return;
        [[endInput,original,requested],[arrivalInput,target,point]].forEach(function(row){
            row[0].value=row[1].label||row[2].join(',');row[0].dataset.lat=String(row[2][0]);row[0].dataset.lon=String(row[2][1]);
            row[0].dataset.displayName=row[0].value;row[0].dataset.journeySource=row[1].kind||'unknown';
            row[0].dataset.journeyOriginalSource=row[1].source_kind||'unknown';
            delete row[0].dataset.journeySearchEvidence;
            if(row[1].search_evidence)row[0].dataset.journeySearchEvidence=JSON.stringify(row[1].search_evidence);
        });
        arrivalInput.dataset.arrivalFor=destinationKey(endInput);
        syncArrivalSummary();
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
        function validInstructions(s){return integrity.validManeuverInstructions ? integrity.validManeuverInstructions(s) : !!s&&typeof s.instruction==='string'&&!!s.instruction.trim();}
        if(steps.some(function(s){return !validInstructions(s)||['begin_shape_index','end_shape_index'].some(function(k){return s[k]!==undefined&&(!Number.isInteger(s[k])||s[k]<0||s[k]>=points.length);})||(s.begin_shape_index!==undefined&&s.end_shape_index!==undefined&&s.end_shape_index<s.begin_shape_index);}))throw Error('Maneuver geometry is inconsistent. Recalculate before simulating.');
        var minutes=Number(route.duration_minutes);
        return {points:points,lengths:lengths,total:lengths[lengths.length-1],steps:steps.filter(function(s){return Number.isInteger(s.begin_shape_index)&&!(integrity.isEdgeMetadataManeuver&&integrity.isEdgeMetadataManeuver(s));}).sort(function(a,b){return a.begin_shape_index-b.begin_shape_index;}),ranges:ranges||[],
            metersPerSecond:minutes>0&&Number.isFinite(minutes)?lengths[lengths.length-1]/(minutes*60):13.8889};
    }
    function position(plan,meters){
        var d=Math.max(0,Math.min(plan.total,meters)),low=0,high=plan.points.length-1;
        while(low+1<high){var middle=Math.floor((low+high)/2);if(plan.lengths[middle]<=d)low=middle;else high=middle;}
        var index=Math.min(low,plan.points.length-2);
        var part=plan.lengths[index+1]-plan.lengths[index],t=part?Math.min(1,(d-plan.lengths[index])/part):0;
        var a=plan.points[index],b=plan.points[index+1];
        var headingIndex=index;while(headingIndex>0&&distance(plan.points[headingIndex],b)<.01)headingIndex--;
        var headingStart=plan.points[headingIndex],rad=Math.PI/180,dl=(b[1]-headingStart[1])*rad;
        var heading=(Math.atan2(Math.sin(dl)*Math.cos(b[0]*rad),Math.cos(headingStart[0]*rad)*Math.sin(b[0]*rad)-Math.sin(headingStart[0]*rad)*Math.cos(b[0]*rad)*Math.cos(dl))/rad+360)%360;
        var next=plan.steps.find(function(s){return plan.lengths[s.begin_shape_index]>d;});
        return {lat:a[0]+(b[0]-a[0])*t,lon:a[1]+(b[1]-a[1])*t,index:index,remaining_m:Math.max(0,plan.total-d),
            heading_deg:heading,progress:plan.total>0?d/plan.total:1,complete:d>=plan.total,
            next_instruction:next?next.instruction:null,next_maneuver_m:next?Math.max(0,plan.lengths[next.begin_shape_index]-d):null,
            instruction:(plan.steps.filter(function(s){return (s.begin_shape_index||0)<=(d>=plan.total?plan.points.length-1:index);}).slice(-1)[0]||{}).instruction||'Maneuver instructions unavailable — geometry inspection only',
            completedStops:plan.ranges.slice(0,-1).filter(function(r){return plan.lengths[r.end_shape_index]<=d;}).length};
    }
    function previewCamera(position,initial,frame,panel){
        var offset=0;
        if(frame&&panel&&[frame.top,frame.left,frame.height,frame.width,panel.top,panel.left,panel.right].every(Number.isFinite)&&frame.height>0&&frame.width>0){
            var centerX=frame.left+frame.width/2;
            if(panel.left<centerX+24&&panel.right>centerX-24){
                var target=Math.max(24,Math.min(frame.height/2,panel.top-frame.top-48));
                offset=target-frame.height/2;
            }
        }
        return Object.assign({center:[position.lon,position.lat],bearing:position.heading_deg,duration:100,offset:[0,offset]},initial?{zoom:16,pitch:45}:{});
    }
    function responseArrivalIntentMatches(requested,data){
        if(!requested)return true;
        var records=[data].concat(Array.isArray(data&&data.routes)?data.routes:[]);
        return records.every(function(record){
            var actual=record&&record.journey_context&&record.journey_context.arrival_intent;
            if(!actual)return requested.version===1&&requested.mode==='place';
            return actual.version===1&&actual.mode===requested.mode&&
                JSON.stringify(actual.target)===JSON.stringify(requested.target)&&
                (actual.status==='DEFAULT'||actual.status==='DECLARED');
        });
    }
    function liveIntent(route,active,index){
        if(!route)throw Error('Select a planned journey first.');
        if(active&&(!Number.isInteger(index)||index<0))throw Error('Current journey progress is unavailable. Stop and replan before live navigation.');
        var context=route.journey_context;
        var intent=context&&context.arrival_intent;
        if(intent&&(intent.version!==1||intent.mode!=='place'||intent.status==='UNSUPPORTED'||intent.status==='TARGET_MISMATCH'))throw Error('This arrival intent is preview only until its live validation is implemented.');
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
            arrivalIntent:context&&context.arrival_intent,arrivalChoice:context&&context.arrival_choice,destinationProvenance:context&&context.destination||{kind:'unknown',coordinates:destination}};
    }
    var api={syncArrivalSummary:syncArrivalSummary,responseArrivalIntentMatches:responseArrivalIntentMatches,destinationKey:destinationKey,clearArrival:clearArrival,applyDrivingArrival:applyDrivingArrival,restoreArrival:restoreArrival,searchEvidence:searchEvidence,coordinate:coordinate,distance:distance,endpoint:endpoint,requestContext:requestContext,inspection:inspection,position:position,previewCamera:previewCamera,liveIntent:liveIntent};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;root.VoyagrJourneyPlan=api;
})(typeof globalThis!=='undefined'?globalThis:this);

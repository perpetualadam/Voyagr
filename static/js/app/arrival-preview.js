/** Selected-route planning endpoints. Never draws or authorizes a connector. */
(function(root){
    'use strict';
    var markers=[];
    function clearMap(){var owned=markers;markers=[];owned.forEach(function(marker){try{marker.remove();}catch(_){/* DOM markers own no route resources. */}});}
    function model(route){
        var integrity=root.VoyagrAvoidanceIntegrity,plan=root.VoyagrJourneyPlan;
        var record=route&&route.endpoint_resolution,assessment=route&&route.avoidance_assessment;
        if(!integrity||!plan||!record||record.version!==1||record.authority!=='planning_evidence_only'||record.navigation_authority!=='NONE'||
            !assessment||assessment.geometry_valid!==true||record.geometry_binding!==assessment.geometry_binding||
            record.geometry_binding!==integrity.geometryBinding(route)||(route.geometry_complete===false||route.navigation_resume_requires_fresh_gps))return null;
        var destination=record.destination,points=integrity.geometryPoints(route);
        var chosen=plan.coordinate(destination&&destination.requested&&destination.requested.coordinates);
        var road=plan.coordinate(destination&&destination.routing_anchor&&destination.routing_anchor.coordinates);
        var context=route.journey_context,requested=plan.coordinate(context&&context.destination&&context.destination.coordinates);
        if(!chosen||!road||!points||!requested||JSON.stringify(chosen)!==JSON.stringify(requested)||plan.distance(road,points[points.length-1])>0.5)return null;
        return {chosen:chosen,road:road,gap:plan.distance(chosen,road),separate:!!(context&&context.arrival_choice),
            original:plan.coordinate(context&&context.arrival_choice&&context.arrival_choice.requested_destination&&context.arrival_choice.requested_destination.coordinates)};
    }
    function live(){var life=root.VoyagrNavigationLifecycleOrchestration;return !!(life&&((life.getRouteInProgress&&life.getRouteInProgress())||(life.getNavigationStarting&&life.getNavigationStarting())));}
    function showMap(route,map){
        clearMap();var data=model(route);
        if(!data||!map||!root.maplibregl||!root.maplibregl.Marker||live())return false;
        try{
            var labels=data.gap<0.5?[[data.chosen,'A/R','Chosen arrival and returned road endpoint coincide; access unverified','#164eaa']]:
                [[data.chosen,'A','Chosen arrival point','#9a5800'],[data.road,'R','Returned road endpoint','#164eaa']];
            labels.forEach(function(row){
                var element=document.createElement('div');element.textContent=row[1];element.title=row[2];element.setAttribute('aria-label',row[2]);
                element.style.cssText='background:'+row[3]+';color:white;border:2px solid white;border-radius:50%;width:26px;height:26px;text-align:center;line-height:22px;font-size:12px;font-weight:bold;box-shadow:0 1px 4px #555;';
                var marker=new root.maplibregl.Marker({element:element,anchor:'center'});markers.push(marker);
                marker.setLngLat([row[0][1],row[0][0]]).addTo(map);
            });return true;
        }catch(_){clearMap();return false;}
    }
    function coordinateText(point){return point[0].toFixed(6)+', '+point[1].toFixed(6);}
    function render(route,map){
        var panel=document.getElementById('arrivalEndpointPreview'),data=model(route);showMap(route,map);
        if(!panel)return;panel.replaceChildren();panel.hidden=!data;if(!data)return;
        var title=document.createElement('strong');title.textContent='Arrival points — access unverified';panel.appendChild(title);
        var list=document.createElement('dl');
        var rows=[['A · '+(data.separate?'Chosen driving arrival':'Chosen destination'),data.chosen],['R · Returned road endpoint',data.road]];
        if(data.original)rows.push(['Original destination (retained)',data.original]);
        rows.forEach(function(row){var dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=row[0];dd.textContent=coordinateText(row[1]);list.append(dt,dd);});panel.appendChild(list);
        var warning=document.createElement('p');warning.textContent='Straight-line gap: about '+Math.round(data.gap)+' m. This is not a driving or walking distance. The road endpoint is not a verified entrance or stopping place. No connection across the gap has been verified.';panel.appendChild(warning);
    }
    var api={model:model,render:render,showMap:showMap,clearMap:clearMap};
    root.VoyagrArrivalPreview=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

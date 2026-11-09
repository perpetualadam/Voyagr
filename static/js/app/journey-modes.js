/** Separate inspection clock and fresh-GPS workflow. Live permission stays in the lifecycle. */
(function(root){
    'use strict';
    var runtime=null,state='PLANNING',epoch=0,ticket=null,pendingCandidate=null,pendingReplacement=null,retainedIntent=null,retiredIdentity=null,retiredJourneyId=null,durableRecovery=false;
    var intentCancellations=[],planningCommit=null,abandonCommit=null;
    // Capability compatibility is a refusal condition, never navigation permission.
    function endpointIntentCompatible(){
        if(durableRecovery||!root.VoyagrOfflineNavigationOrchestration||root.VoyagrOfflineNavigationOrchestration.DURABLE_OWNERSHIP_PROTOCOL!==1||!root.VoyagrNavigationLifecycleOrchestration||root.VoyagrNavigationLifecycleOrchestration.DURABLE_OWNERSHIP_PROTOCOL!==1||!root.VoyagrRerouteMapOrchestration||root.VoyagrRerouteMapOrchestration.DURABLE_OWNERSHIP_PROTOCOL!==1)return false;
        try{return [
            [root.VoyagrNavigationLifecycleOrchestration,['startTurnByTurnNavigation']],
            [root.VoyagrRerouteMapOrchestration,['updateRouteOnMap']],
            [root.VoyagrLocationOrchestration,['invalidateEndpointRequests','setCurrentLocation','swapStartAndDestination']],
            [root.VoyagrGeocodingOrchestration,['selectAutocompleteResult','showAutocomplete']],
            [root.VoyagrCalculateRouteOrchestration,['calculateRoute','setupMapClickHandler']],
            [root.VoyagrRoutePreviewOrchestration,['showRestoredRoutePreview']],
            [root.VoyagrAutoGpsOrchestration,['updateAutoGpsLocation']],
            [root.VoyagrSearchFavoritesOrchestration,['loadFavorites']],
            [root.VoyagrPoiSearchOrchestration,['selectPOI']],
            [root.VoyagrParkingOrchestration,['setParkingAsDestination']],
            [root.VoyagrFormClearOrchestration,['clearForm']],
            [root.VoyagrTripHistoryOrchestration,['recalculateTrip']],
            [root.VoyagrRouteSharingOrchestration,['loadSharedRouteFromUrl']],
            [root.VoyagrMlPredictionsOrchestration,['loadMLPredictions']],
            [root.VoyagrVoiceControlOrchestration,['handleVoiceAction']],
            [root.VoyagrWaypointsOrchestration,['addStop', 'addViaPoint', 'removeStop', 'removeViaPoint', 'clearAllWaypoints']],
        ].every(function(entry){var module=entry[0];return !!module&&module.ENDPOINT_INTENT_PROTOCOL===1&&typeof module.endpointIntentReady==='function'&&module.endpointIntentReady()===true&&entry[1].every(function(name){return typeof module[name]==='function';});});}catch(_){return false;}
    }
    // This is action availability, never proof that IndexedDB is empty or a
    // navigation permission. Unknown/legacy storage keeps the fail-closed path.
    function previousJourneyPresent(route){
        if(!runtime||durableRecovery||rt().isLive()||retainedIntent||route&&(route.durable_journey_id||route.journey_continuation))return true;
        try{
            var service=root.VoyagrOfflineNavigationOrchestration;
            if(!service||service.DURABLE_OWNERSHIP_PROTOCOL!==1||typeof service.getJourneyOwnership!=='function')return true;
            return !!service.getJourneyOwnership();
        }catch(_){return true;}
    }
    function refreshAbandonControl(){
        var present=true;
        try{present=previousJourneyPresent(runtime&&rt().selected());}catch(_){/* Presentation cannot interrupt cleanup or grant permission. */}
        document.querySelectorAll('[data-journey-abandon]').forEach(function(button){button.hidden=!present;});
    }
    function commitPending(){return !!(planningCommit||abandonCommit);}
    function captureIntent(){return epoch;}
    function intentCurrent(token){return Number.isInteger(token)&&token===epoch;}
    function onIntentCancelled(token,callback){
        var entry={token:token,callback:callback};intentCancellations.push(entry);
        return function(){intentCancellations=intentCancellations.filter(function(item){return item!==entry;});};
    }
    var simulation=null,line=null,marker=null,timer=null,lastTick=0,meters=0,speed=1,selection=null,cameraView=null,follow=true,cameraInitial=true;
    function rt(){if(!runtime)throw Error('Journey modes are unavailable. Reload the application.');return runtime;}
    function plan(){return root.VoyagrJourneyPlan;}
    function integrity(){return root.VoyagrAvoidanceIntegrity;}
    function key(route){return JSON.stringify([route&&route.id,route&&route.destination,route&&route.geometry,route&&route.maneuvers,route&&route.journey_context]);}
    function animating(){return state==='SIMULATING'||state==='SIMULATION_PAUSED';}
    function simulating(){return animating()||state==='RECOVERY_REQUIRED'&&!!(line||marker||simulation);}
    function status(text,type){
        var el=document.getElementById('journeyModeStatus');if(el)el.textContent=text;
        if(runtime&&runtime.showStatus)runtime.showStatus(text,type||'info');
    }
    function setState(next,keepEndpointLeases){
        if(!keepEndpointLeases&&state!==next&&root.VoyagrLocationOrchestration&&root.VoyagrLocationOrchestration.invalidateEndpointRequests)root.VoyagrLocationOrchestration.invalidateEndpointRequests(undefined,{endpointOnly:true});
        state=next;
        var chooser=document.getElementById('journeyModeChooser');if(chooser)chooser.hidden=state!=='CHOOSING'&&state!=='LOCATING'&&state!=='RECALCULATING'&&state!=='AUTHORIZING';
        var panel=document.getElementById('simulationControls');if(panel)panel.hidden=!simulating();
        var indicator=document.getElementById('simulationIndicator');if(indicator)indicator.hidden=!simulating();
        playbackControls();
        refreshAbandonControl();
        if(state==='RECOVERY_REQUIRED'){var progress=document.getElementById('simulationProgress');if(progress){delete progress.dataset.distanceMeters;progress.textContent='Simulation cleanup is incomplete. No animation or live transition is permitted. Retry Exit simulation to verify removal.';}}
        document.querySelectorAll('[data-live-recalculate]').forEach(function(b){b.disabled=['LOCATING','RECALCULATING','AUTHORIZING'].indexOf(state)>=0;});
    }
    function playbackControls(){
        var pauseControl=document.getElementById('simulationPause'),resumeControl=document.getElementById('simulationResume'),restartControl=document.getElementById('simulationRestart');
        var active=document.activeElement,complete=!!simulation&&meters>=simulation.total;
        if(pauseControl){pauseControl.disabled=state!=='SIMULATING';pauseControl.hidden=state!=='SIMULATING';}
        if(resumeControl){resumeControl.disabled=state!=='SIMULATION_PAUSED'||!simulation||complete;resumeControl.hidden=state==='SIMULATING';}
        if(restartControl)restartControl.disabled=!animating();
        ['simulationSpeed','simulationPosition','simulationFollow'].forEach(function(id){var control=document.getElementById(id);if(control)control.disabled=!animating();});
        var label=state==='RECOVERY_REQUIRED'?'Recovery required':complete?'Preview complete':state==='SIMULATING'?'Playing':'Paused';
        var stateLabel=document.getElementById('simulationState');if(stateLabel&&stateLabel.textContent!==label)stateLabel.textContent=label;
        var recovery=document.getElementById('simulationRecovery');if(recovery)recovery.hidden=state!=='RECOVERY_REQUIRED';
        // Keep keyboard focus on the equivalent action when play/pause changes.
        if(animating()&&(active===pauseControl||active===resumeControl)&&active.hidden){
            var next=complete?restartControl:state==='SIMULATING'?pauseControl:resumeControl;
            if(next&&!next.disabled)next.focus();
        }
    }
    function cleanSimulation(){
        clearInterval(timer);timer=null;
        if(cameraView&&runtime&&runtime.stopSimulationCamera){try{runtime.stopSimulationCamera();}catch(_){/* Owned resource verification still follows. */}}
        var ok=true;
        if(line){
            try{line.remove();}catch(_){/* Verify the actual owned resource below. */}
            try{ok=rt().helpers().isPolylineLayerRemoved(rt().map(),line)===true;}catch(_){ok=false;}
            if(ok)line=null;
        }
        if(marker){
            try{marker.remove();if(marker.getElement().isConnected)ok=false;else marker=null;}catch(_){ok=false;}
        }
        if(!ok){setState('RECOVERY_REQUIRED');status('Simulation cleanup failed. Reload the map before switching modes.','error');return false;}
        simulation=null;
        if(cameraView){try{if(rt().restoreSimulationView)rt().restoreSimulationView(cameraView);}catch(_){/* Camera restoration cannot grant or block GPS permission. */}cameraView=null;}
        return true;
    }
    function cancel(keepEndpointLeases){
        var previous=epoch++;
        var cancelled=intentCancellations.filter(function(entry){return entry.token===previous;});
        intentCancellations=intentCancellations.filter(function(entry){return entry.token!==previous;});
        cancelled.forEach(function(entry){try{entry.callback();}catch(_){/* Owned cancellation cannot block invalidation. */}});
        var updater=root.VoyagrRerouteMapOrchestration;
        if(state==='AUTHORIZING'&&!(updater&&updater.isCommittingVerifiedTransition&&updater.isCommittingVerifiedTransition())&&runtime&&(!pendingReplacement||key(rt().selected())!==pendingReplacement.identity))runtime.stopLive(abandonCommit?{preservePersistedJourney:true}:undefined);
        pendingCandidate=null;pendingReplacement=null;
        if(!keepEndpointLeases&&root.VoyagrLocationOrchestration&&root.VoyagrLocationOrchestration.invalidateEndpointRequests)root.VoyagrLocationOrchestration.invalidateEndpointRequests(undefined,{endpointOnly:true});
        if(ticket){if(integrity().isLatest(ticket))integrity().invalidate();integrity().finish(ticket);ticket=null;}
    }
    function endpointChanged(){
        cancel(true);if(integrity()&&integrity().invalidate)integrity().invalidate();
        if(state==='LOCATING'||state==='RECALCULATING'||state==='AUTHORIZING'){setState(rt().isLive()?'LIVE':'CHOOSING',true);status('Journey destination or endpoints changed. Previous request cancelled; recalculate with the current selection.','warning');}
    }
    function exit(){cancel();if(!cleanSimulation())return false;setState('PLANNING');status('Journey inspection closed. Simulation does not record driven trips.');return true;}
    function currentJourneyId(){var service=root.VoyagrOfflineNavigationOrchestration;var owned=service&&service.DURABLE_OWNERSHIP_PROTOCOL===1&&service.getJourneyOwnership();return owned&&owned.journey_id||null;}
    function bindCommittedJourneyId(){
        var id=currentJourneyId();if(!id)return;
        if(root.lastCalculatedRoute)root.lastCalculatedRoute.durable_journey_id=id;
        var selected=rt().options()[rt().index()];if(selected)selected.durable_journey_id=id;
    }
    function retainLiveJourney(){
        if(!runtime||!rt().isLive())return;
        var selected=rt().selected(),identity=key(selected);
        try{
            if(!rt().activeGeometry||JSON.stringify(rt().activeGeometry())!==JSON.stringify(integrity().geometryPoints(selected)))throw Error('Progress context differs');
            retainedIntent={identity:identity,intent:plan().liveIntent(selected,true,rt().progressIndex()),progressIndex:rt().progressIndex(),journey_id:currentJourneyId()};
        }catch(_){retainedIntent={identity:identity,unavailable:true};}
    }
    function stopLive(options){
        if(rt().isLive()){retainLiveJourney();rt().stopLive(options);}
        if(rt().isLive())throw Error('Live guidance could not stop. Recover navigation before switching modes.');
    }
    function simulationDistance(el, metersValue, style, prefix, suffix) {
        if(!el)return;
        el.dataset.distanceMeters=String(metersValue);el.dataset.distanceStyle=style;
        el.dataset.distancePrefix=prefix;el.dataset.distanceSuffix=suffix;
        var formatted=rt().formatDistance?rt().formatDistance(metersValue,style):style==='route'?(metersValue/1000).toFixed(2)+' km':Math.round(metersValue)+' m';
        el.textContent=prefix+formatted+suffix;
    }
    function drawSimulation(){
        if(!simulation||!animating())return;
        var p=plan().position(simulation,meters);
        marker.setLngLat([p.lon,p.lat]);
        if(marker.setRotation)marker.setRotation(p.heading_deg);
        if(follow&&cameraView&&rt().moveSimulationCamera){rt().moveSimulationCamera(p,cameraInitial);cameraInitial=false;}
        var el=document.getElementById('simulationProgress');
        var remainingSeconds=simulation.metersPerSecond>0?p.remaining_m/simulation.metersPerSecond:0;
        simulationDistance(el,p.remaining_m,'route',p.instruction+' — ',' remaining; simulated ETA '+Math.ceil(remainingSeconds/60)+' min; '+p.completedStops+' intermediate stops passed.');
        var timing=document.getElementById('simulationTiming');if(timing)timing.textContent=speed+'× playback · '+Math.ceil(remainingSeconds/speed)+' seconds of preview remaining';
        var next=document.getElementById('simulationNextTurn');
        if(next){
            delete next.dataset.distanceMeters;
            if(!p.complete&&p.next_instruction)simulationDistance(next,p.next_maneuver_m,'poi','Next: '+p.next_instruction+' in ','');
            else next.textContent=p.complete?'Route preview complete. Restart or choose another journey.':'Continue to the end of the planned route.';
        }
        var seekControl=document.getElementById('simulationPosition');if(seekControl)seekControl.value=String(p.progress*100);
        var percent=document.getElementById('simulationPercent');if(percent)percent.textContent=Math.round(p.progress*100)+'%';
        if(meters>=simulation.total)pause();
        playbackControls();
    }
    function redrawSimulation(){
        try{
            if(!simulation||!animating())return false;
            if(!rt().helpers().isPolylineLayerMounted(rt().map(),line,simulation.points))throw Error('The simulation map layer changed. Exit and recalculate before animating again.');
            drawSimulation();return true;
        }catch(error){pause();status(error.message,'warning');return false;}
    }
    function tick(){
        if(state!=='SIMULATING')return;
        try{
            if(!rt().helpers().isPolylineLayerMounted(rt().map(),line,simulation.points))throw Error('The simulation map layer changed. Exit and recalculate before animating again.');
            var now=Date.now();meters=Math.min(simulation.total,meters+Math.min(5,Math.max(0,(now-lastTick)/1000))*simulation.metersPerSecond*speed);lastTick=now;drawSimulation();
        }catch(error){pause();status(error.message,'warning');}
    }
    function pause(){if(!animating())return false;clearInterval(timer);timer=null;setState('SIMULATION_PAUSED');return true;}
    function resume(){
        if(state!=='SIMULATION_PAUSED'||!simulation||meters>=simulation.total)return false;
        setState('SIMULATING');lastTick=Date.now();timer=setInterval(tick,100);return true;
    }
    function restart(){if(!simulation||!animating())return false;meters=0;if(!redrawSimulation())return false;pause();return resume();}
    function setSpeed(value){value=Number(value);if([0.5,1,2,5,10,20,50,100].indexOf(value)<0)return false;if(simulation&&state==='SIMULATING')tick();speed=value;var el=document.getElementById('simulationSpeed');if(el)el.value=String(value);return simulation&&animating()?redrawSimulation():true;}
    function setFollow(value){follow=value===true;var el=document.getElementById('simulationFollow');if(el)el.checked=follow;if(!follow&&cameraView&&runtime&&runtime.stopSimulationCamera){try{runtime.stopSimulationCamera();}catch(_){/* Next frame stays in free-map mode. */}}if(simulation&&animating())redrawSimulation();return follow;}
    function seek(value){value=Number(value);if(!animating()||!simulation||!Number.isFinite(value)||value<0||value>100)return false;meters=simulation.total*value/100;lastTick=Date.now();return redrawSimulation();}
    function startSimulation(){
        try{
            var candidate=JSON.parse(JSON.stringify(rt().selected()));var inspected=plan().inspection(candidate,integrity());
            if(commitPending())throw Error('Journey transaction is pending. Retry shortly.');
            cancel();if(!cleanSimulation())return false;stopLive();rt().stopGps();
            var map=rt().map(),helpers=rt().helpers();if(!map||!map.isStyleLoaded())throw Error('Map not ready. Retry simulation once the style loads.');
            cameraView=rt().captureSimulationView?rt().captureSimulationView():null;cameraInitial=true;follow=true;
            var followControl=document.getElementById('simulationFollow');if(followControl)followControl.checked=true;
            var speedControl=document.getElementById('simulationSpeed');speed=1;if(speedControl)setSpeed(speedControl.value);
            // Unique owned resources; no live route layer, GPS marker or route state is replaced.
            line=helpers.addPolyline(map,inspected.points,{color:'#8e44ad',weight:5,opacity:0.7,dashArray:'6, 6'});
            if(!helpers.isPolylineLayerMounted(map,line,inspected.points))throw Error('Simulation geometry did not mount. No animation started.');
            marker=rt().simulationMarker(inspected.points[0]);simulation=inspected;meters=0;selection=key(candidate);
            if(rt().showSimulationMap)rt().showSimulationMap();
            setState('SIMULATION_PAUSED');drawSimulation();resume();
            status('SIMULATION — NOT LIVE GPS. Geometry inspection only; this route is not approved for live navigation. No road legality or safe endpoint connection is established.','warning');
            return true;
        }catch(error){if(cleanSimulation())setState('PLANNING');status(error.message,'warning');return false;}
    }
    function fresh(position){
        var c=position&&position.coords,at=position&&position.timestamp;
        if(!c||!plan().coordinate([c.latitude,c.longitude])||!Number.isFinite(at)||Date.now()-at>15000||at-Date.now()>1000)throw Error('GPS location is stale or unavailable. Retry from your actual location.');
        if(!Number.isFinite(c.accuracy)||c.accuracy<=0||c.accuracy>30)throw Error('GPS accuracy is insufficient (30 m or better required). Move to a clearer location and retry.');
        return {lat:c.latitude,lon:c.longitude,accuracy:c.accuracy,timestamp:at};
    }
    function locate(){
        var token=captureIntent();
        return new Promise(function(resolve,reject){
            var geo=navigator.geolocation;
            if(!geo){reject(Error('GPS is unavailable. You can still plan or simulate; retry on a device with location support.'));return;}
            var settled=false,improving=false,watchId=null,lastError=null,unregister=function(){};
            var deadline=Date.now()+12000;
            var options={enableHighAccuracy:true,maximumAge:0,timeout:10000};
            var timeout=setTimeout(function(){done(lastError||Error('GPS request timed out. Retry or inspect the planned journey.'));},12000);
            function releaseWatch(){
                if(watchId!==null){var id=watchId;watchId=null;try{geo.clearWatch(id);}catch(_){/* Late callbacks are still fenced by settled. */}}
            }
            function done(error,position){
                if(settled)return;settled=true;clearTimeout(timeout);unregister();releaseWatch();
                error?reject(error):resolve(position);
            }
            function failed(error){
                if(settled)return;
                var message=Error(error&&error.code===1?'GPS permission denied. Enable location permission and retry; the planned origin will not be substituted.':'GPS location could not be obtained. Retry or use simulation.');
                if(error&&error.code===1||!improving)done(message);else lastError=lastError||message;
            }
            function observed(position,watching){
                if(settled)return;
                if(!intentCurrent(token)){done(Error('GPS request cancelled.'));return;}
                if(Date.now()>=deadline){done(lastError||Error('GPS request timed out. Retry or inspect the planned journey.'));return;}
                try{fresh(position);done(null,position);return;}catch(error){lastError=error;}
                if(watching)return;
                if(typeof geo.watchPosition!=='function'||typeof geo.clearWatch!=='function'){done(lastError);return;}
                improving=true;
                status('Improving GPS accuracy… A fresh location within 30 m is required.','loading');
                try{
                    watchId=geo.watchPosition(function(next){observed(next,true);},failed,options);
                    // A test/device adapter may deliver a callback before returning its id.
                    if(settled)releaseWatch();
                }catch(error){done(lastError||error);}
            }
            unregister=onIntentCancelled(token,function(){done(Error('GPS request cancelled.'));});
            try{geo.getCurrentPosition(function(position){observed(position,false);},failed,options);}catch(error){done(error);}
        });
    }
    function realFix(){var fix=runtime&&runtime.getFix();return fix&&fresh({timestamp:fix.timestamp,coords:{latitude:fix.lat,longitude:fix.lon,accuracy:fix.accuracy}});}
    function liveStartPermitted(candidate){
        try{
            var fix=realFix(),origin=candidate&&candidate.avoidance_assessment&&candidate.avoidance_assessment.origin_integrity;
            var replacementCurrent=!pendingReplacement||(rt().isLive()&&key(rt().selected())===pendingReplacement.identity&&JSON.stringify(plan().liveIntent(rt().selected(),true,rt().progressIndex()).stops)===JSON.stringify(pendingReplacement.intent.stops));
            return replacementCurrent&&(!ticket||integrity().current(ticket,localStorage))&&state==='AUTHORIZING'&&pendingCandidate===candidate&&!line&&!simulation&&!!fix&&!!origin&&plan().coordinate(origin.requested_origin)!==null&&plan().distance([fix.lat,fix.lon],origin.requested_origin)<=2;
        }catch(_){return false;}
    }
    async function authorize(candidate,token,replacement){
        var previous={options:rt().options(),index:rt().index()},staged=[candidate];
        pendingCandidate=candidate;pendingReplacement=replacement||null;setState('AUTHORIZING');status('Verifying live navigation and map resources…','loading');
        if(!replacement){rt().setOptions(staged);rt().setIndex(0);}
        try{
            if(!intentCurrent(token)||!root.VoyagrNavigationLifecycleOrchestration||root.VoyagrNavigationLifecycleOrchestration.INTENT_OWNERSHIP_PROTOCOL!==1||root.VoyagrNavigationLifecycleOrchestration.ENDPOINT_INTENT_PROTOCOL!==1||root.VoyagrNavigationLifecycleOrchestration.DURABLE_OWNERSHIP_PROTOCOL!==1||!root.VoyagrRerouteMapOrchestration||root.VoyagrRerouteMapOrchestration.INTENT_OWNERSHIP_PROTOCOL!==1||root.VoyagrRerouteMapOrchestration.ENDPOINT_INTENT_PROTOCOL!==1||root.VoyagrRerouteMapOrchestration.DURABLE_OWNERSHIP_PROTOCOL!==1)throw Error('Navigation intent modules differ. Reload online; current journey retained.');
            if(replacement&&(!root.VoyagrNavigationLifecycleOrchestration||root.VoyagrNavigationLifecycleOrchestration.JOURNEY_REPLACEMENT_PROTOCOL!==1||rt().replacementProtocol!==1))throw Error('Journey replacement modules differ. Reload online; current navigation is retained.');
            var ok=await rt().startLive(candidate,replacement?{gpsReplacement:true}:undefined);
            if(ok!==true||token!==epoch)throw Error('Live navigation was refused or cancelled. Inspect the safety explanation and recalculate.');
            bindCommittedJourneyId();retainedIntent=null;setState('LIVE');status('Live GPS navigation started.','success');return true;
        }finally{
            if(pendingCandidate===candidate){pendingCandidate=null;pendingReplacement=null;}
            if(!rt().isLive()&&rt().options()===staged){rt().setOptions(previous.options);rt().setIndex(previous.index);}
        }
    }
    async function startHere(){
        try{
            if(durableRecovery)throw Error('Journey storage requires recovery. Reload and inspect the durable journey first.');
            var route=rt().selected();
            if(retiredIdentity===key(route))throw Error('Previous journey ended. Calculate a new plan before live navigation.');
            if(commitPending())throw Error('Previous planning transaction is finishing. Retry shortly.');
            getContinuation(route);
            if(rt().isLive()||retainedIntent&&retainedIntent.identity===key(route))throw Error('Use Navigate From My Location to continue the remaining journey; completed visits cannot be restarted silently.');
            var candidate=integrity().prepareNavigationCandidate(route),fix=realFix();
            if(!candidate||!fix||!integrity().gate(candidate,{storage:localStorage,offline:navigator.onLine===false,quiet:true}))throw Error('This plan is not authorized for a live start. Recalculate from your location.');
            cancel();if(!cleanSimulation())return false;stopLive();var token=epoch;
            return await authorize(candidate,token);
        }catch(error){setState('CHOOSING');status(error.message,'warning');return false;}
    }
    async function navigateFromGPS(){
        var token,ownedTicket=null;
        try{
            if(durableRecovery)throw Error('Journey storage requires recovery. Reload and inspect the durable journey first.');
            if(navigator.onLine===false)throw Error('Live navigation needs an online reassessment. Reconnect and retry; offline plans remain available for inspection.');
            if(commitPending())throw Error('Previous planning transaction is finishing. Retry shortly.');
            var selected=rt().selected(),identity=key(selected);
            if(retiredIdentity===identity)throw Error('Previous journey ended. Calculate a new plan before live navigation.');
            if(!rt().isLive())getContinuation(selected);
            selection=identity;
            var active=rt().isLive();
            if(active&&(!rt().activeGeometry||JSON.stringify(rt().activeGeometry())!==JSON.stringify(integrity().geometryPoints(selected))))throw Error('Selected journey differs from active progress. Stop and replan without skipping stops.');
            if(!active&&retainedIntent&&retainedIntent.identity===identity&&retainedIntent.unavailable)throw Error('Remaining visits cannot be established. Inspect and explicitly replan the complete journey before a live start.');
            var intent=active?plan().liveIntent(selected,true,rt().progressIndex()):retainedIntent&&retainedIntent.identity===identity?JSON.parse(JSON.stringify(retainedIntent.intent)):plan().liveIntent(selected,false,0);
            if(active)retainedIntent={identity:identity,intent:JSON.parse(JSON.stringify(intent)),progressIndex:rt().progressIndex(),journey_id:currentJourneyId()};
            cancel();if(!cleanSimulation())return false;token=epoch;setState('LOCATING');status('Obtaining a fresh, accurate GPS location…','loading');
            var position=await locate(),fix=fresh(position);
            if(token!==epoch||key(rt().selected())!==identity)return false;
            if(!rt().acceptPosition(position))throw Error('GPS observation could not be validated. Retry.');
            var dest=plan().coordinate(intent.destination);
            if(!dest){dest=await rt().resolveDestination(intent.destination);dest=dest&&plan().coordinate([dest.lat,dest.lon]);}
            if(!dest)throw Error('Destination could not be resolved. Inspect and replan the journey.');
            if(token!==epoch||key(rt().selected())!==identity)return false;
            var body=rt().buildRequest(fix,dest.join(','));
            body.start=fix.lat+','+fix.lon;body.end=dest.join(',');body.is_reroute=false;body.force_refresh=true;
            body.stops=intent.stops;body.via_points=[];body.optimize_stop_order=false;body.preserve_stop_order=true;body.round_trip=false;
            body.journey_context={version:1,purpose:'live_gps',origin:{kind:'gps'},destination:intent.destinationProvenance};
            if(intent.arrivalChoice)body.journey_context.arrival_choice=intent.arrivalChoice;
            if(intent.arrivalIntent)body.journey_context.arrival_intent=intent.arrivalIntent;
            ownedTicket=integrity().begin(localStorage);ticket=ownedTicket;body=integrity().augment(body,localStorage,fix);
            setState('RECALCULATING');status('Calculating and independently checking a new journey from your GPS position…','loading');
            var response=await rt().fetch('/api/route',Object.assign({},integrity().fetchOptions(ownedTicket),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
            if(!response.ok)throw Error('Live route request failed. Retry; the planned route has not been substituted.');
            var data=await response.json();
            if(token!==epoch||key(rt().selected())!==identity||!integrity().current(ownedTicket,localStorage))throw Error('Journey selection or requirements changed. Recalculate before live navigation.');
            if(!data||data.success!==true||!Array.isArray(data.routes)||!data.routes.length)throw Error('No complete live journey was returned. Retry or inspect the plan.');
            integrity().tag(data,ownedTicket);
            var second=await locate(),latest=fresh(second);
            if(token!==epoch||!integrity().current(ownedTicket,localStorage)||key(rt().selected())!==identity)throw Error('Journey context changed. Retry with current settings.');
            if(plan().distance([fix.lat,fix.lon],[latest.lat,latest.lon])>2)throw Error('Your location changed during calculation. Retry a new route from your actual position.');
            if(!rt().acceptPosition(second))throw Error('The latest GPS observation could not be validated. Retry.');
            var candidates=data.routes.map(function(r){return Object.assign({},r,{avoidance_requirements:data.avoidance_requirements,destination:dest.join(','),destinationName:intent.destinationName});});
            var candidate=candidates.find(function(r){return integrity().prepareNavigationCandidate(r)&&integrity().gate(r,{storage:localStorage,offline:navigator.onLine===false,quiet:true});});
            if(!candidate)throw Error(integrity().currentDecision(candidates[0],{offline:navigator.onLine===false},localStorage).message);
            return await authorize(candidate,token,active?{identity:identity,intent:intent}:null);
        }catch(error){
            if(token===undefined||token===epoch){if(state!=='RECOVERY_REQUIRED')setState(rt().isLive()?'LIVE':'CHOOSING');status(error.message,'warning');}
            return false;
        }finally{if(ownedTicket){integrity().finish(ownedTicket);if(ticket===ownedTicket)ticket=null;}}
    }
    function onPreview(){
        if(!runtime)return;
        var route=rt().selected();
        if((simulation||ticket||state==='LOCATING')&&selection!==key(route)){cancel();if(!cleanSimulation())return;setState('PLANNING');}
        selection=key(route);
        refreshAbandonControl();
        document.querySelectorAll('[data-journey-choose]').forEach(function(button){button.disabled=!route;});
    }
    function choose(){
        try{
            if(simulation && !exit())return false;
            onPreview();var selected=rt().selected();if(!selected)throw Error('Calculate or restore a planned journey first.');
            var panel=document.getElementById('journeyModeChooser');if(panel)panel.hidden=false;
            setState('CHOOSING');
            var d=integrity().currentDecision(selected,{offline:navigator.onLine===false},localStorage);
            status(d.outcome==='REFUSED'?'Live navigation refused for this plan: '+d.message+' You may inspect the geometry or request a new route from GPS.':'Choose simulation or a new journey from your actual GPS location.');
            var direct=document.getElementById('startVerifiedHere');var can=false;
            try{var fix=realFix(),o=selected.avoidance_assessment.origin_integrity;can=!rt().isLive()&&!(retainedIntent&&retainedIntent.identity===key(selected))&&!!fix&&plan().distance([fix.lat,fix.lon],o.requested_origin)<=2&&d.allowed;}catch(_){}
            if(direct)direct.hidden=!can;
            return true;
        }catch(error){status(error.message,'warning');return false;}
    }
    function getContinuation(route){
        if(retiredIdentity===key(route))return null;
        if(runtime&&rt().isLive()&&key(route)===key(rt().selected()))retainLiveJourney();
        if(retainedIntent&&retainedIntent.identity===key(route)&&(!route.durable_journey_id||retainedIntent.journey_id===route.durable_journey_id))return JSON.parse(JSON.stringify(retainedIntent));
        var saved=route&&route.journey_continuation;
        if(!saved)return null;
        var points=integrity().geometryPoints(route);
        if(saved.identity!==key(route)||saved.unavailable||!points||!Number.isInteger(saved.progressIndex)||saved.progressIndex<0||saved.progressIndex>=points.length||JSON.stringify(saved.intent)!==JSON.stringify(plan().liveIntent(route,true,saved.progressIndex)))throw Error('Saved continuation is inconsistent. Explicitly replan before navigation.');
        retainedIntent=JSON.parse(JSON.stringify(saved));return JSON.parse(JSON.stringify(saved));
    }
    function canonicalContinuation(value){return value&&JSON.stringify([value.identity,value.intent,value.progressIndex,value.unavailable]);}
    var publishingPlan=false;
    async function commitPlanning(token,candidate,operations){
        if(commitPending()||!intentCurrent(token))return false;
        var owner={token:token},stage=null,mapStage=null,unsubscribe=function(){},published=false,timer;
        var previous=rt().selected(),continuation=getContinuation(previous),hadJourney=!!(rt().isLive()||retainedIntent);
        function current(){return planningCommit===owner&&intentCurrent(token)&&(!operations.requestCurrent||operations.requestCurrent()===true);}
        function bounded(work){return Promise.race([Promise.resolve(work),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),5000);})]).finally(()=>clearTimeout(timer));}
        function publish(callback){publishingPlan=true;try{return callback();}finally{publishingPlan=false;}}
        planningCommit=owner;
        try{
            if(!candidate||!integrity().prepareNavigationCandidate(candidate))throw Error('Plan assessment, geometry or maneuvers are incomplete. Current journey retained.');
            plan().inspection(candidate,integrity());
            var assessment=candidate.avoidance_assessment,origin=assessment.origin_integrity;
            if(hadJourney&&!(assessment.automatic_selection_allowed===true&&assessment.requires_acceptance===false&&origin&&origin.navigation_allowed===true&&origin.status==='CONTINUOUS_WITHIN_NUMERICAL_TOLERANCE'&&origin.transition_verified!==true&&assessment.requirements.every(function(row){return !row.enabled||row.mode!=='mandatory'||row.status==='SATISFIED';})))throw Error('This new plan has unresolved critical checks. Current journey retained; explicitly end it before inspecting another refused plan.');
            if(hadJourney&&(!rt().persistPreviousJourney||await bounded(rt().persistPreviousJourney(previous,continuation,current))!==true))throw Error('Previous continuation could not be saved. Current journey retained.');
            if(!current())throw Error('Planning intent changed');
            mapStage=operations.stage(current);if(!current())throw Error('Planning intent changed');
            if(hadJourney){
                if(!rt().confirmPlanReplacement||rt().confirmPlanReplacement('Replace the previous journey with this validated new plan? Existing guidance will end; this does not start live navigation.')!==true)throw Error('New plan cancelled; previous journey retained.');
                if(!current())throw Error('Planning intent changed');
                const work=Promise.resolve(rt().stagePlanningJourney(candidate));
                work.then(value=>{if(!current()&&value&&value.discard)void Promise.resolve().then(()=>value.discard()).catch(()=>{});},()=>{});
                stage=await bounded(work);
                if(!stage||!stage.finalize||!stage.rollback||!stage.abort||!current())throw Error('Planning persistence modules unavailable, mismatched or cancelled');
                unsubscribe=onIntentCancelled(token,function(){if(stage.abort)stage.abort();});
                if(await bounded(stage.commit(current))!==true||!current())throw Error('Planning persistence interrupted');
            }
            if(!current())throw Error('Planning intent changed');
            if(rt().isLive()&&canonicalContinuation(getContinuation(previous))!==canonicalContinuation(continuation))throw Error('Journey progress changed while planning. Current remaining visits retained; retry the plan.');
            if(rt().isLive()){
                retainLiveJourney();
                if(root.VoyagrNavigationLifecycleOrchestration.getNavigationStarting())throw Error('Earlier navigation transition is still pending. Retry the plan shortly.');
                rt().stopLive({preservePersistedJourney:true});
                if(rt().isLive())throw Error('Previous guidance could not stop');
            }
            if(!current())throw Error('Planning intent changed');
            published=true;publish(function(){operations.publish(mapStage,current);});
            if(!current()||operations.verify(mapStage)!==true)throw Error('Planned context did not commit');
            operations.removePrevious(mapStage,current);
            if(!current())throw Error('Planning intent changed');
            if(stage&&(await bounded(stage.finalize(current))!==true||!current()))throw Error('Planning finalization failed');
            if(stage)bindCommittedJourneyId();
            retainedIntent=null;retiredIdentity=null;retiredJourneyId=null;setState('PLANNING');if(planningCommit===owner)planningCommit=null;
            try{operations.present();}catch(_){status('Plan committed. Reopen its details if the display did not refresh.','warning');}
            return true;
        }catch(error){
            if(published){try{publish(function(){operations.restore(mapStage);});}catch(_){/* Recovery below remains fail closed. */}}
            if(stage&&stage.rollback){try{await bounded(stage.rollback(function(){return planningCommit===owner;}));}catch(_){/* Pending journal still reads as the previous journey. */}}
            // A driver may complete another visit while staging. Save the newest
            // canonical continuation before releasing this exclusive planning owner.
            if(!published&&rt().isLive()&&key(rt().selected())===key(previous)&&rt().persistPreviousJourney){
                try{await bounded(rt().persistPreviousJourney(previous,getContinuation(previous),function(){return planningCommit===owner;}));}catch(_){/* Active guidance remains authoritative; retry storage before a handover. */}
            }
            if(mapStage){try{if(operations.cleanup(mapStage)!==true)throw Error('Owned preview cleanup failed');}catch(_){if(root.VoyagrNavigationLifecycleOrchestration)root.VoyagrNavigationLifecycleOrchestration.failNavigation('planning_map_recovery_required');}}
            status(error.message,'warning');return false;
        }finally{
            unsubscribe();if(stage&&stage.discard){try{await bounded(stage.discard());}catch(_){/* Inert owned staging record only. */}}
            if(planningCommit===owner)planningCommit=null;
        }
    }
    async function abandonJourney(){
        if(commitPending())return false;
        // A plain inspection plan has nothing to retire. Reject before confirm,
        // cancellation, stopping guidance or entering a persistence transaction.
        if(!previousJourneyPresent(rt().selected())){
            refreshAbandonControl();
            status('This plan has no previous journey to end. Saved journeys have not been changed.','info');
            return false;
        }
        if(!root.VoyagrNavigationLifecycleOrchestration||root.VoyagrNavigationLifecycleOrchestration.PERSISTENCE_TRANSACTION_PROTOCOL!==1){status('Journey persistence modules differ. Reload before abandoning; remaining visits retained.','warning');return false;}
        if(!rt().confirmPlanReplacement||rt().confirmPlanReplacement('End the previous journey and discard its remaining stops? This cannot be triggered by a failed calculation.')!==true)return false;
        var previous,continuation,expectedOwnership,owner={},stage=null,timer,unsubscribe=function(){};
        try{previous=rt().selected();continuation=getContinuation(previous);var persistence=root.VoyagrOfflineNavigationOrchestration;
            expectedOwnership=persistence&&persistence.DURABLE_OWNERSHIP_PROTOCOL===1?persistence.getJourneyOwnership():null;
            var intendedJourneyId=continuation&&continuation.journey_id||previous&&previous.durable_journey_id||(retiredIdentity===key(previous)?retiredJourneyId:null);
            if(expectedOwnership&&expectedOwnership.journey_id===intendedJourneyId)expectedOwnership=Object.freeze(Object.assign({},expectedOwnership));else expectedOwnership=null;
        }catch(error){status(error.message,'warning');return false;}
        abandonCommit=owner;
        // Cancellation/safety stops must preserve storage until this owned journal
        // commits. Late replacement callbacks retain their captured old epochs.
        cancel();var token=epoch,identity=key(previous);
        function current(){return abandonCommit===owner&&intentCurrent(token)&&key(rt().selected())===identity;}
        function bounded(work){return Promise.race([Promise.resolve(work),new Promise(resolve=>{timer=setTimeout(()=>{if(stage&&stage.abort)stage.abort();resolve(null);},5000);})]).finally(()=>clearTimeout(timer));}
        try{
            stopLive({preservePersistedJourney:true});
            if(!rt().stageAbandonJourney||!expectedOwnership){var unavailable=Error('Durable journey ownership is unavailable. Reload and inspect before abandoning; remaining visits retained.');unavailable.code='DURABLE_OWNERSHIP_UNAVAILABLE';throw unavailable;}
            var work=Promise.resolve(rt().stageAbandonJourney(previous,continuation,current,expectedOwnership));
            work.then(value=>{if(!current()&&value&&value.discard)void Promise.resolve().then(()=>value.discard()).catch(()=>{});},()=>{});
            stage=await bounded(work);
            if(stage&&stage.ownershipMismatch){var mismatch=Error('Durable journey owner changed; no checkpoint was written.');mismatch.code='DURABLE_OWNER_CHANGED';throw mismatch;}
            if(!stage||stage.ABANDONMENT_PROTOCOL!==2||stage.DURABLE_OWNERSHIP_PROTOCOL!==1||['commit','finalize','rollback','abort','discard'].some(function(name){return typeof stage[name]!=='function';})||!current())throw Error('Abandonment staging failed or was cancelled; remaining visits retained.');
            unsubscribe=onIntentCancelled(token,function(){stage.abort();});
            if(await bounded(stage.commit(current))!==true||!current())throw Error('Abandonment promotion failed; remaining visits retained.');
            if(await bounded(stage.finalize(current))!==true||!current())throw Error('Abandonment finalization interrupted.');
            retainedIntent=null;retiredIdentity=identity;retiredJourneyId=expectedOwnership.journey_id;
            try{setState('PLANNING');status('Previous journey explicitly ended.');}catch(_){/* Committed retirement is not rolled back by presentation. */}
            return true;
        }catch(error){
            var restored=error.code!=='DURABLE_OWNER_CHANGED'&&error.code!=='DURABLE_OWNERSHIP_UNAVAILABLE';
            if(stage&&stage.rollback){try{restored=await bounded(stage.rollback(function(){return abandonCommit===owner;}))===true;}catch(_){restored=false;}}
            if(!restored){durableRecovery=true;setState('RECOVERY_REQUIRED');status('Journey storage ownership is unavailable or changed. Guidance is stopped; reload and inspect the durable journey before retrying.','error');}
            else status(error.message,'warning');
            return false;
        }finally{
            unsubscribe();if(stage&&stage.discard){try{await bounded(stage.discard());}catch(_){/* Only inert owned staging remains. */}}
            if(abandonCommit===owner)abandonCommit=null;
        }
    }
    function beforePlanning(){
        try{if(commitPending()){cancel();status('Previous planning transaction is finishing. Retry shortly.','warning');return false;}cancel();if(!cleanSimulation())return false;if(rt().isLive())retainLiveJourney();setState(rt().isLive()?'LIVE':'PLANNING');return true;}
        catch(error){status(error.message,'warning');return false;}
    }
    function liveStopped(){if(state==='LIVE')setState('PLANNING');}
    async function addGpsStop(){
        try{var token=captureIntent();status('Getting a GPS location for the stop…','loading');var p=await locate(),fix=fresh(p);if(!intentCurrent(token)||commitPending())return false;rt().addStop(fix.lat,fix.lon,'GPS-selected stop',0,'gps');status('GPS stop added to the plan.','success');return true;}
        catch(error){if(intentCurrent(token))status(error.message,'warning');return false;}
    }
    var api={PROTOCOL:1,bind:function(deps){runtime=deps;},getState:function(){return state;},isSimulating:simulating,
        endpointIntentCompatible:endpointIntentCompatible,isJourneyCommitPending:commitPending,isAbandoning:function(){return !!abandonCommit;},commitPlanning:commitPlanning,getContinuation:getContinuation,abandonJourney:abandonJourney,isPlanningCommit:function(){return !!planningCommit;},isPublishingPlanningPlan:function(){return publishingPlan;},
        captureIntent:captureIntent,intentCurrent:intentCurrent,onIntentCancelled:onIntentCancelled,endpointChanged:endpointChanged,
        choose:choose,onPreview:onPreview,startSimulation:startSimulation,pause:pause,resume:resume,restart:restart,setSpeed:setSpeed,setFollow:setFollow,seek:seek,exit:exit,
        navigateFromGPS:navigateFromGPS,startHere:startHere,liveStartPermitted:liveStartPermitted,beforePlanning:beforePlanning,retainLiveJourney:retainLiveJourney,liveStopped:liveStopped,addGpsStop:addGpsStop};
    if(typeof document!=='undefined')document.addEventListener('visibilitychange',function(){if(document.hidden&&simulating())pause();});
    if(typeof module!=='undefined'&&module.exports)module.exports=api;root.VoyagrJourneyModes=api;
})(typeof globalThis!=='undefined'?globalThis:this);

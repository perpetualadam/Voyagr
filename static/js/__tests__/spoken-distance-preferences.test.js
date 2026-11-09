const Voice=require('../modules/navigation/voice-announcements');
const Hazards=require('../modules/navigation/hazard-alerts');
const base={announcementDistance:500,direction:'left',directionText:'turn left',streetName:'High Street'};
test.each(['In 500 meters, turn left','In five hundred metres, turn left','Continue for 0.5 km, then turn left','After approximately 500m, turn left','In 1,000 metres, turn left'])('miles preference rejects conflicting provider distance: %s',text=>{
 expect(Voice.buildTurnAnnouncement({...base,distanceUnit:'mi',verbalAlert:text})).toBe('In 1600 feet, turn left onto High Street');
});
test.each(['In 1600 feet, turn left','In half a mile, turn left','After a quarter-mile, turn left','In 1/2 mile, turn left','Continue for 200 yds, then turn left'])('metric preference rejects conflicting provider distance: %s',text=>{
 expect(Voice.buildTurnAnnouncement({...base,distanceUnit:'km',verbalAlert:text})).toBe('In 500 meters, turn left onto High Street');
});
test.each([['km','In 500 meters, turn left'],['mi','In half a mile, turn left'],['mi','Turn left onto Mile End Road'],['km','Turn left onto Half Mile Lane'],['mi','Turn left onto Kilometre Road'],['km','Follow the signs for 40 miles per hour']])('retain compatible or distance-free provider guidance (%s): %s',(unit,text)=>{
 expect(Voice.buildTurnAnnouncement({...base,distanceUnit:unit,verbalAlert:text})).toBe(text);
});
test('imminent and keep fallback wording respects units while roundabout topology remains authoritative',()=>{
 expect(Voice.buildTurnAnnouncement({...base,announcementDistance:100,distanceUnit:'mi',verbalPre:'In 100 meters, turn left'})).toBe('In 300 feet, turn left onto High Street');
 expect(Voice.buildTurnAnnouncement({...base,direction:'slight_left',announcementDistance:1000,distanceUnit:'mi',verbalAlert:'Continue for 1 kilometer'})).toBe('In half a mile, keep left toward High Street');
 expect(Voice.buildTurnAnnouncement({...base,direction:'roundabout',roundaboutExitCount:3,distanceUnit:'mi',verbalAlert:'In 500 meters, take the 2nd exit'})).toBe('In 1600 feet, take the 3rd exit onto High Street');
});
test('preference changes affect only speech, retaining threshold selection, deduplication and route data',()=>{
 const turnInfo={distance:450,direction:'left',streetName:'High Street',maneuverIndex:2,verbal_transition_alert_instruction:'In 500 meters, turn left onto High Street'};
 const before=JSON.stringify(turnInfo),opts={turnInfo,voiceAnnouncementsEnabled:true,directionText:'turn left',turnDistances:[500,200,100,50],exitDistances:[2000,800,200,100],keepDistances:[1000,400,150,50],announcedThresholdValues:[]};
 const mi=Voice.buildTurnAnnouncementTickPlan({...opts,distanceUnit:'mi'}),km=Voice.buildTurnAnnouncementTickPlan({...opts,distanceUnit:'km'});
 expect(mi.spokenMessage).toBe('In 1600 feet, turn left onto High Street');expect(km.spokenMessage).toBe(turnInfo.verbal_transition_alert_instruction);
 for(const key of ['action','speak','speakPriority','statePatch','announcedThresholdValues','clearThresholds','resetThresholds'])expect(mi[key]).toEqual(km[key]);
 expect(mi.announcedThresholdValues).toEqual([500]);
 expect(Voice.buildTurnAnnouncementTickPlan({...opts,distanceUnit:'km',announcedThresholdValues:mi.announcedThresholdValues,voiceAnnouncedForManeuverIndex:2,voiceAnnouncedCategory:'turn'}).action).toBe('none');
 expect(JSON.stringify(turnInfo)).toBe(before);
});
test('hazards already use selected units and retain mute/chime/debounce decisions and distances',()=>{
 const hazard={id:'camera',type:'camera_speed',lat:53.5,lon:-1.1},before=JSON.stringify(hazard),opts={cameraAlertType:'both',voiceAnnouncementsEnabled:true,now:100000,lastAnnounceAt:0};
 const mi=Hazards.buildHazardAnnouncementPlan(hazard,200,{...opts,distanceUnit:'mi'}),km=Hazards.buildHazardAnnouncementPlan(hazard,200,{...opts,distanceUnit:'km'});
 expect(mi.spokenMessage).toContain('656 feet');expect(km.spokenMessage).toContain('200 meters');
 for(const key of ['action','debounceKey','nextAnnounceAt','speak','speakPriority','playChime'])expect(mi[key]).toEqual(km[key]);
 expect(Hazards.buildHazardAnnouncementPlan(hazard,200,{...opts,cameraAlertType:'off'}).reason).toBe('camera-alerts-off');
 expect(Hazards.buildHazardAnnouncementPlan(hazard,200,{...opts,lastAnnounceAt:100000}).reason).toBe('debounced');expect(JSON.stringify(hazard)).toBe(before);
});
test('destination milestones already use chosen units without moving hysteresis or arrival thresholds',()=>{
 const opts={routeInProgress:true,routePolylineLength:3,voiceAnnouncementsEnabled:true,remainingDistanceM:490,lastDestinationAnnouncementDistance:1000,destinationDistances:[1000,500,100]};
 const mi=Voice.buildDestinationAnnouncementTickPlan({...opts,distanceUnit:'mi'}),km=Voice.buildDestinationAnnouncementTickPlan({...opts,distanceUnit:'km'});
 expect(mi.spokenMessage).toBe('1600 feet to destination');expect(km.spokenMessage).toBe('500 meters to destination');expect(mi.announcementDistance).toBe(km.announcementDistance);expect(mi.statePatch).toEqual(km.statePatch);
});

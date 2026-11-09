// Production preference, announcement and speech controllers; API and native TTS are capture boundaries.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('@playwright/test');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
(async()=>{const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage();await page.route('**/*',r=>r.request().url()==='https://speech.invalid/'?r.fulfill({contentType:'text/html',body:'<select id="distanceUnit"><option value="km">km</option><option value="mi">mi</option></select>'}):r.abort());await page.goto('https://speech.invalid/');
 for(const file of ['modules/navigation/units.js','app/units-preferences-orchestration.js','modules/navigation/voice-announcements.js','modules/navigation/hazard-alerts.js','modules/navigation/speech-synthesis.js','app/voice-announcements-orchestration.js'])await page.addScriptTag({content:read('static/js/'+file)});
 const result=await page.evaluate(()=>{
  const V=VoyagrVoiceAnnouncements,H=VoyagrHazardAlerts,P=VoyagrUnitsPreferencesOrchestration,S=VoyagrVoiceAnnouncementsOrchestration;
  const utterances=[],requests=[];window.AndroidTTS={speak:text=>utterances.push(text)};window.fetch=(url,options)=>{requests.push([url,JSON.parse(options.body)]);return Promise.resolve({ok:true});};
  P.bind({units:()=>VoyagrUnits,call:{saveAllSettings:()=>{},showStatus:()=>{}}});S.bind({voiceAnnouncements:()=>V});
  let now=100000;Date.now=()=>now;
  const turnInfo={distance:450,direction:'left',streetName:'High Street',maneuverIndex:2,verbal_transition_alert_instruction:'In 500 meters, turn left onto High Street'};const before=JSON.stringify(turnInfo),thresholds=[];
  for(const unit of ['mi','km','mi']){
   document.getElementById('distanceUnit').value=unit;P.updateDistanceUnit();
   const tick=V.buildTurnAnnouncementTickPlan({turnInfo,voiceAnnouncementsEnabled:true,distanceUnit:P.getDistanceUnitValue(),directionText:'turn left',turnDistances:[500,200,100,50],exitDistances:[2000,800,200,100],keepDistances:[1000,400,150,50],announcedThresholdValues:[]});
   thresholds.push(tick.announcedThresholdValues);S.speakMessage(tick.spokenMessage,tick.speakPriority);now+=20000;
   const hazard=H.buildHazardAnnouncementPlan({id:'camera',type:'camera_speed'},200,{distanceUnit:P.getDistanceUnitValue(),cameraAlertType:'voice',voiceAnnouncementsEnabled:true,now,lastAnnounceAt:0});S.speakMessage(hazard.spokenMessage,hazard.speakPriority);now+=20000;
   const destination=V.buildDestinationAnnouncementTickPlan({routeInProgress:true,routePolylineLength:3,voiceAnnouncementsEnabled:true,remainingDistanceM:490,lastDestinationAnnouncementDistance:1000,destinationDistances:[1000,500,100],distanceUnit:P.getDistanceUnitValue()});S.speakMessage(destination.spokenMessage);now+=20000;
  }
  return {utterances,requests:requests.map(([url])=>url),thresholds,unchanged:JSON.stringify(turnInfo)===before,unit:localStorage.getItem('unit_distance')};
 });
 assert.deepEqual(result.utterances,[
 'In 1600 feet, turn left onto High Street','camera speed, 656 feet ahead','1600 feet to destination',
 'In 500 meters, turn left onto High Street','camera speed, 200 meters ahead','500 meters to destination',
 'In 1600 feet, turn left onto High Street','camera speed, 656 feet ahead','1600 feet to destination']);
 assert.deepEqual(result.thresholds,[[500],[500],[500]]);assert(result.unchanged);assert.equal(result.unit,'mi');assert.deepEqual(result.requests,['/api/app-settings','/api/app-settings','/api/app-settings']);
 console.log('Production speech pipeline passed: cached provider route, mi/km/mi preference changes, turns/hazards/destination, stable thresholds and native-TTS capture.');
 await page.close();
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1);});

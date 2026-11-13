/** Car/headphone audio support. Pairing and synthesized-speech output stay with
 * the OS; only microphones actually exposed by the browser can be selected.
 * No microphone permission request or device discovery occurs on page load.
 */
(function(root){
    'use strict';
    let selectedId='', devices=[], enabled=false, checking=false, revision=0, checkEpoch=0, checkHold=null, initialized=false;
    const media=()=>root.navigator?.mediaDevices;
    const element=id=>document.getElementById(id);
    function status(text){const el=element('audioDeviceStatus');if(el)el.textContent=text;}
    function render(){
        for(const id of ['audioDeviceCheck','audioDeviceTest']){const button=element(id);if(button)button.disabled=checking;}
        element('audioDeviceCheck')?.setAttribute('aria-busy',String(checking));
        const select=element('audioInputDevice');if(!select)return;
        select.replaceChildren();
        const option=document.createElement('option');option.value='';option.textContent='System default (recommended)';select.append(option);
        devices.forEach(device=>{
            if(device.kind!=='audioinput' || !device.deviceId || device.deviceId==='default')return;
            const item=document.createElement('option');item.value=device.deviceId;
            item.textContent=device.label || 'Microphone';select.append(item);
        });
        select.value=selectedId;select.disabled=checking || !enabled;
    }
    function captureConstraints(){
        const audio={echoCancellation:true,noiseSuppression:true,autoGainControl:true};
        if(selectedId)audio.deviceId={exact:selectedId};
        return {audio};
    }
    async function restartWake(){
        const wake=root.VoyagrPorcupineOrchestration;
        if(!wake?.isPipelineRunning?.())return;
        wake.setResumeAfterVoice(true);
        await wake.stopPorcupineWakePipeline();
        if(!document.hidden)wake.maybeResumePorcupineWakeAfterVoice();
    }
    async function refresh(reconnect=false){
        if(!enabled || document.hidden || !media()?.enumerateDevices)return;
        const token=++revision;
        try {
            const next=await media().enumerateDevices();
            if(token!==revision)return;
            devices=next.filter(device=>device.kind==='audioinput');
            let missing=false;
            if(selectedId && !devices.some(device=>device.deviceId===selectedId)){
                selectedId='';status('Selected microphone is unavailable. Using the system default.');
                missing=true;
            }
            render();
            if(missing || reconnect)await restartWake();
        } catch(_){status('Audio device list is unavailable. System audio remains available.');}
    }
    function describeStream(stream){
        const label=stream.getAudioTracks?.()[0]?.label;
        status(label ? 'Microphone: '+label+'. Output follows your phone’s audio selection.' : 'Microphone available. Output follows your phone’s audio selection.');
    }
    function captureStarted(stream){
        enabled=true;
        if(stream)describeStream(stream);
        void refresh();
    }
    async function requestStream(report=true){
        let stream;
        try {stream=await media().getUserMedia(captureConstraints());}
        catch(error){
            if(!selectedId || !['NotFoundError','OverconstrainedError'].includes(error.name))throw error;
            selectedId='';render();status('Selected microphone is unavailable. Using the system default.');
            stream=await media().getUserMedia(captureConstraints());
        }
        if(report)captureStarted(stream);return stream;
    }
    async function check(){
        if(checking)return;
        if(root.VoyagrVoiceControlOrchestration?.isVoiceInputActive?.()){
            status('Finish the current voice command before checking audio.');return;
        }
        if(!root.isSecureContext || !media()?.getUserMedia){status('Microphone checks are unavailable in this browser. Use the phone’s audio settings.');return;}
        const epoch=++checkEpoch;checking=true;status('Checking microphone…');render();
        let stream,hold;
        try {
            // Share existing wake ownership rather than opening competing capture.
            hold=root.VoyagrPorcupineOrchestration?.beginSpeechOutput?.();
            checkHold=hold;
            if(hold)await hold.ready;
            if(epoch!==checkEpoch || document.hidden)return;
            stream=await requestStream(false);
            if(epoch!==checkEpoch || document.hidden)return;
            enabled=true;describeStream(stream);
            if(!document.hidden)await refresh();
        } catch(error){if(epoch===checkEpoch)status(error.name==='NotAllowedError'?'Microphone permission was not granted. Change it in browser settings.':'Audio check could not start. Check the phone’s microphone and Bluetooth settings.');}
        finally {
            stream?.getTracks().forEach(track=>track.stop());
            hold?.finish();
            if(epoch===checkEpoch){checkHold=null;checking=false;render();}
        }
    }
    function cancelCheck(){
        if(!checking)return;
        ++checkEpoch;checking=false;checkHold?.finish();checkHold=null;status('Audio check cancelled.');render();
    }
    async function selectInput(id){
        if(checking || root.VoyagrVoiceControlOrchestration?.isVoiceInputActive?.()){
            render();status('Finish the current voice command before changing microphone.');return;
        }
        if(id && !devices.some(device=>device.deviceId===id)){render();return;}
        selectedId=id;render();
        status(id?'Microphone selected for wake listening and AI speech.':'Using the system default microphone.');
        await restartWake();
    }
    function testOutput(){
        if(checking || root.VoyagrVoiceControlOrchestration?.isVoiceInputActive?.()){
            status('Finish the current voice command before testing directions.');return;
        }
        const voice=root.VoyagrVoiceAnnouncementsOrchestration;
        if(!voice?.speakMessage){status('Spoken directions are not ready. Try again shortly.');return;}
        voice.speakMessage('Voyagr audio test. Directions will use this audio output.','high');
        status('Audio test requested. If silent, check media volume and the phone’s selected output.');
    }
    function init(){
        if(initialized)return;initialized=true;
        element('audioDeviceCheck')?.addEventListener('click',()=>{void check();});
        element('audioDeviceTest')?.addEventListener('click',testOutput);
        element('audioInputDevice')?.addEventListener('change',event=>{void selectInput(event.target.value);});
        media()?.addEventListener?.('devicechange',()=>{void refresh(true);});
        root.addEventListener?.('focus',()=>{void refresh();});
        document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelCheck();else void refresh();});
        root.addEventListener?.('pagehide',cancelCheck);
        render();
    }
    const api={check,refresh,captureStarted,selectInput,testOutput,requestStream,captureConstraints,getInputDeviceId:()=>selectedId,cancelCheck,init};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;
    root.VoyagrAudioDevices=api;
    if(typeof document!=='undefined'){
        if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
    }
})(typeof globalThis!=='undefined'?globalThis:this);

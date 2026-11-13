/** Short opt-in recordings behind the same recognition interface as Web Speech.
 * The server owns provider/model configuration; audio stays in memory and is
 * released after Stop, cancellation, error, page hide or the 15-second limit.
 */
(function(root){
    'use strict';
    class AudioRecognition {
        constructor(){this.state='idle';this.generation=0;this.lang='en-GB';}
        static supported(){return !!(root.isSecureContext && root.navigator?.mediaDevices?.getUserMedia && root.MediaRecorder && typeof root.MediaRecorder.isTypeSupported==='function');}
        emit(name,event){if(typeof this[name]==='function')this[name](event);}
        releaseEndpoint(){
            clearInterval(this.endpointTimer);this.endpointTimer=null;
            this.endpointSource?.disconnect();this.endpointSource=null;
            this.endpointAnalyser?.disconnect();this.endpointAnalyser=null;
            const context=this.endpointContext;this.endpointContext=null;
            if(context)void context.close().catch(()=>{});
        }
        startEndpoint(token){
            const Context=root.AudioContext || root.webkitAudioContext;
            if(!Context)return;
            try {
                this.endpointContext=new Context();
                this.endpointSource=this.endpointContext.createMediaStreamSource(this.stream);
                this.endpointAnalyser=this.endpointContext.createAnalyser();
                this.endpointAnalyser.fftSize=2048;
                this.endpointSource.connect(this.endpointAnalyser);
                // Analysis only: never connect microphone audio to the speakers.
                const samples=new Float32Array(this.endpointAnalyser.fftSize);
                let noise=0.004,activityMs=0,quietMs=0;
                this.endpointSpeech=false;
                this.endpointTimer=setInterval(()=>{
                    if(token!==this.generation || this.state!=='recording' || this.endpointContext?.state!=='running')return;
                    this.endpointAnalyser.getFloatTimeDomainData(samples);
                    const rms=Math.sqrt(samples.reduce((sum,value)=>sum+value*value,0)/samples.length);
                    // Energy endpointing is deliberately conservative; road noise can
                    // keep it open. The existing maximum duration remains the fallback.
                    const active=rms>Math.max(0.012,noise*3);
                    if(active){activityMs+=50;quietMs=0;if(activityMs>=150)this.endpointSpeech=true;}
                    else {
                        noise=0.95*noise+0.05*rms;
                        if(this.endpointSpeech)quietMs+=50;else activityMs=0;
                    }
                    if(this.endpointSpeech && quietMs>=1400)this.stop();
                },50);
                const context=this.endpointContext;
                void context.resume().catch(()=>{if(this.endpointContext===context)this.releaseEndpoint();});
            } catch(_){this.releaseEndpoint();}
        }
        release(){this.releaseEndpoint();clearTimeout(this.recordTimer);clearTimeout(this.requestTimer);if(this.stream)this.stream.getTracks().forEach(t=>t.stop());this.stream=null;}
        end(token,error){
            if(token!==this.generation || this.state==='idle')return;
            this.state='idle';this.release();this.chunks=[];
            if(error)this.emit('onerror',{error});
            this.emit('onend');
        }
        async start(){
            if(this.state!=='idle')throw new Error('Recognition already active');
            const token=++this.generation;this.state='requesting';this.chunks=[];this.bytes=0;
            try {
                const stream=await root.navigator.mediaDevices.getUserMedia({audio:true});
                if(token!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
                this.stream=stream;
                const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>root.MediaRecorder.isTypeSupported(t));
                if(!mime)throw new Error('format');
                this.recorder=new root.MediaRecorder(stream,{mimeType:mime});
                this.recorder.ondataavailable=e=>{
                    if(token!==this.generation || !e.data?.size)return;
                    this.bytes+=e.data.size;
                    if(this.bytes>1024*1024){this.abort('recording-too-large');return;}
                    this.chunks.push(e.data);
                };
                this.recorder.onerror=()=>this.abort('audio-capture');
                this.recorder.onstop=()=>this.upload(token,mime);
                this.recorder.start(1000);this.state='recording';
                this.startEndpoint(token);
                this.recordTimer=setTimeout(()=>{
                    if(this.endpointContext?.state==='running' && !this.endpointSpeech)this.abort('no-speech');
                    else this.stop();
                },15000);
                this.emit('onstart');
            } catch(error){this.end(token,error.name==='NotAllowedError'?'not-allowed':'audio-capture');}
        }
        stop(){
            if(this.state==='requesting'){this.abort();return;}
            if(this.state!=='recording')return;
            this.state='processing';clearTimeout(this.recordTimer);
            this.recorder.stop();this.release();
            this.emit('onprocessing');
        }
        abort(error){
            const active=this.state!=='idle';++this.generation;
            this.state='idle';this.controller?.abort();this.release();this.chunks=[];
            if(this.recorder?.state==='recording')this.recorder.stop();
            if(active){if(error)this.emit('onerror',{error});this.emit('onend');}
        }
        async upload(token,mime){
            if(token!==this.generation || this.state!=='processing')return;
            const audio=new Blob(this.chunks,{type:mime});this.chunks=[];
            if(!audio.size){this.end(token,'no-speech');return;}
            this.controller=new AbortController();
            this.requestTimer=setTimeout(()=>this.controller.abort(),25000);
            try {
                const response=await root.fetch('/api/voice/transcribe',{method:'POST',headers:{'Content-Type':mime,'X-Voyagr-Voice':'1'},body:audio,signal:this.controller.signal});
                const data=response.ok?await response.json():null;
                if(token!==this.generation)return;
                if(!data?.success || typeof data.text!=='string' || data.text.length>500)throw new Error('transcription');
                if(data.text.trim())this.emit('onresult',{resultIndex:0,results:[{isFinal:true,0:{transcript:data.text.trim()}}]});
                this.end(token);
            } catch(_){this.end(token,'network');}
        }
    }
    const api={AudioRecognition,supported:()=>AudioRecognition.supported()};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;
    root.VoyagrAudioRecognition=api;
})(typeof globalThis!=='undefined'?globalThis:this);

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
        release(){clearTimeout(this.recordTimer);clearTimeout(this.requestTimer);if(this.stream)this.stream.getTracks().forEach(t=>t.stop());this.stream=null;}
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
                this.recordTimer=setTimeout(()=>this.stop(),15000);
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

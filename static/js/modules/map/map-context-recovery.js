/** Bounded WebGL recovery; never replaces navigation or its map resources. */
(function(root){
 'use strict';
 function renderOptions(ratio,coarse){return coarse?{pixelRatio:Math.min(2,Math.max(1,Number.isFinite(ratio)?ratio:1))}:{};}
 function install(map,gl,hooks){
  hooks=hooks||{};
  const canvas=map&&map.getCanvas&&map.getCanvas();
  if(!canvas||!gl)return {dispose:function(){}};
  let extension=null,timer=null,lost=false,disposed=false,attempts=0;
  let foregroundRetried=false,unavailableReported=false;
  try{extension=gl.getExtension('WEBGL_lose_context');}catch(_){/* Optional browser capability. */}
  const visible=()=>!root.document||root.document.visibilityState==='visible';
  const current=()=>!disposed&&(!hooks.isCurrent||hooks.isCurrent());
  const clear=()=>{clearTimeout(timer);timer=null;};
  let wasVisible=visible();
  function unavailable(){if(!unavailableReported){unavailableReported=true;if(hooks.unavailable)hooks.unavailable();}}
  function schedule(){
   if(!current()||!lost||!visible()||timer)return;
   if(!extension||typeof extension.restoreContext!=='function'||attempts>=3){unavailable();return;}
   timer=setTimeout(()=>{
    timer=null;if(!current()||!lost||!visible())return;
    attempts++;
    try{extension.restoreContext();}catch(_){/* Browser/OS may refuse restoration. */}
    if(lost)schedule();
   },[1000,3000,10000][attempts]);
  }
  function onLost(event){if(event&&event.preventDefault)event.preventDefault();if(!current()||lost)return;clear();lost=true;attempts=0;foregroundRetried=false;unavailableReported=false;if(hooks.lost)hooks.lost();schedule();}
  function onRestored(){
   if(!current()||!lost)return;clear();lost=false;attempts=0;
   // Extensions belong to the restored context; reacquire for a later loss.
   try{extension=gl.getExtension('WEBGL_lose_context');}catch(_){extension=null;}
   if(hooks.restored)hooks.restored();
  }
  function onVisible(){
   const nowVisible=visible(),returned=nowVisible&&!wasVisible;wasVisible=nowVisible;
   if(!nowVisible){clear();return;}
   if(!current()||!lost)return;
   // A phone may reject restoration under resource pressure, then permit it
   // after unlock. Permit one new burst, never an unbounded focus/retry loop.
   if(returned&&attempts>=3&&!foregroundRetried&&extension&&typeof extension.restoreContext==='function'){
    foregroundRetried=true;attempts=0;unavailableReported=false;
    if(hooks.retrying)hooks.retrying();
   }
   schedule();
  }
  function dispose(){disposed=true;clear();canvas.removeEventListener('webglcontextlost',onLost);canvas.removeEventListener('webglcontextrestored',onRestored);if(root.document)root.document.removeEventListener('visibilitychange',onVisible);}
  canvas.addEventListener('webglcontextlost',onLost);canvas.addEventListener('webglcontextrestored',onRestored);
  if(root.document)root.document.addEventListener('visibilitychange',onVisible);
  if(map.on)map.on('remove',dispose);
  return {dispose:dispose};
 }
 const api={install:install,renderOptions:renderOptions};
 root.VoyagrMapContextRecovery=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

/** Optional analytics: basic opt-in only. No remote tag or consent ping by default. */
(function(root){
    'use strict';
    const KEY='voyagrAnalyticsConsentV1';
    const script=typeof document!=='undefined' && document.querySelector('script[data-voyagr-analytics]');
    const id=script?.getAttribute('data-voyagr-analytics');
    let loaded=false,initialized=false;
    function granted(){try{return root.localStorage.getItem(KEY)==='granted';}catch(_){return false;}}
    function clearCookies(){
        try {
            for(const part of document.cookie.split(';')){
                const name=part.trim().split('=')[0];if(!/^(_ga(?:_|$)|_gid$|_gat(?:_|$)|_gac_)/.test(name))continue;
                const suffix='=; Max-Age=0; Path=/; SameSite=Lax';
                document.cookie=name+suffix;
                const parts=root.location.hostname.split('.');
                for(let i=0;i<parts.length-1;i++)document.cookie=name+suffix+'; Domain=.'+parts.slice(i).join('.');
            }
        } catch(_){/* Optional analytics must not block the app when cookies are restricted. */}
    }
    function render(){
        const status=document.getElementById('analyticsConsentStatus');
        if(status)status.textContent=granted()?'Optional analytics: on.':'Optional analytics: off.';
    }
    function apply(){
        if(!/^G-[A-Z0-9]+$/.test(id||''))return;
        root['ga-disable-'+id]=!granted();
        if(!granted()){
            document.getElementById('voyagrAnalyticsTag')?.remove();clearCookies();render();return;
        }
        if(!loaded){
            loaded=true;root.dataLayer=root.dataLayer||[];
            root.gtag=function(){root.dataLayer.push(arguments);};
            root.gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
            root.gtag('js',new Date());
            const page={page_location:root.location.origin+root.location.pathname,page_referrer:'',page_title:'Voyagr'};
            root.gtag('set',page);
            root.gtag('config',id,{...page,send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false});
            root.gtag('event','page_view',page);
            const tag=document.createElement('script');tag.id='voyagrAnalyticsTag';tag.async=true;tag.referrerPolicy='no-referrer';
            tag.src='https://www.googletagmanager.com/gtag/js?id='+id;document.head.append(tag);
        }
        render();
    }
    function setConsent(allow){
        try{root.localStorage.setItem(KEY,allow?'granted':'denied');}
        catch(_){return;}// Without durable choice do not silently enable collection.
        apply();
    }
    function init(){
        if(initialized)return;initialized=true;
        document.getElementById('analyticsAllow')?.addEventListener('click',()=>setConsent(true));
        document.getElementById('analyticsDecline')?.addEventListener('click',()=>{
            setConsent(false);
            // Remove the already-loaded library and its handlers from this page.
            if(loaded && !granted())root.location.reload();
        });
        root.addEventListener?.('storage',event=>{if(event.key===KEY || event.key===null)apply();});
        apply();
    }
    const api={setConsent,granted};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;
    root.VoyagrAnalyticsConsent=api;
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof globalThis!=='undefined'?globalThis:this);

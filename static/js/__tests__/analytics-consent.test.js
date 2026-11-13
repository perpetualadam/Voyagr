const KEY='voyagrAnalyticsConsentV1';let analytics,listeners;
beforeEach(()=>{
 jest.resetModules();localStorage.clear();listeners=[];
 document.head.innerHTML='<script data-voyagr-analytics="G-TEST123"></script>';
 document.body.innerHTML='<button id="analyticsAllow"></button><button id="analyticsDecline"></button><p id="analyticsConsentStatus"></p>';
 history.replaceState(null,'','/?destination=private-address#53.5,-1.1');
 for(const part of document.cookie.split(';'))document.cookie=part.trim().split('=')[0]+'=; Max-Age=0; Path=/';
 const add=window.addEventListener.bind(window);jest.spyOn(window,'addEventListener').mockImplementation((name,fn,...rest)=>{listeners.push([name,fn]);return add(name,fn,...rest);});
});
afterEach(()=>{for(const [name,fn]of listeners)window.removeEventListener(name,fn);jest.restoreAllMocks();for(const key of ['VoyagrAnalyticsConsent','gtag','dataLayer','ga-disable-G-TEST123'])delete window[key];history.replaceState(null,'','/');});
function load(){analytics=require('../app/analytics-consent');document.dispatchEvent(new Event('DOMContentLoaded'));}
test.each([null,'denied','yes','true'])('no remote script or analytics queue without explicit consent %p',value=>{
 if(value!==null)localStorage.setItem(KEY,value);load();
 expect(document.querySelector('#voyagrAnalyticsTag')).toBeNull();expect(window.dataLayer).toBeUndefined();expect(window['ga-disable-G-TEST123']).toBe(true);
});
test('allow loads once, disables advertising signals, and omits query, hash and referrer from the page view',()=>{
 load();document.querySelector('#analyticsAllow').click();document.querySelector('#analyticsAllow').click();
 expect(document.querySelectorAll('#voyagrAnalyticsTag')).toHaveLength(1);expect(analytics.granted()).toBe(true);
 const queue=window.dataLayer.map(args=>Array.from(args));
 const config=queue.find(args=>args[0]==='config')[2];expect(config).toMatchObject({send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false});
 const page=queue.find(args=>args[0]==='event'&&args[1]==='page_view')[2];expect(page.page_location).toBe(location.origin+'/');expect(page.page_referrer).toBe('');
 expect(JSON.stringify(queue)).not.toContain('private-address');expect(JSON.stringify(queue)).not.toContain('53.5');
});
test('withdrawal removes the tag and analytics cookies while preserving essential cookies',()=>{
 load();analytics.setConsent(true);document.cookie='_ga=private-cookie; Path=/';document.cookie='_ga_TEST=private-cookie; Path=/';document.cookie='essential_session=keep; Path=/';
 analytics.setConsent(false);
 expect(document.querySelector('#voyagrAnalyticsTag')).toBeNull();expect(window['ga-disable-G-TEST123']).toBe(true);
 expect(document.cookie).not.toContain('_ga');expect(document.cookie).toContain('essential_session=keep');
});
test('revocation in another tab disables this page too',()=>{
 localStorage.setItem(KEY,'granted');load();localStorage.setItem(KEY,'denied');window.dispatchEvent(new StorageEvent('storage',{key:KEY,newValue:'denied'}));
 expect(document.querySelector('#voyagrAnalyticsTag')).toBeNull();expect(window['ga-disable-G-TEST123']).toBe(true);
});
test('storage failures fail closed without creating a remote script',()=>{
 jest.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked');});
 jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});
 load();analytics.setConsent(true);expect(document.querySelector('#voyagrAnalyticsTag')).toBeNull();expect(analytics.granted()).toBe(false);
});
test('restricted cookie access cannot break initial application script execution',()=>{
 jest.spyOn(document,'cookie','get').mockImplementation(()=>{throw new Error('restricted');});
 expect(load).not.toThrow();expect(document.querySelector('#voyagrAnalyticsTag')).toBeNull();expect(window['ga-disable-G-TEST123']).toBe(true);
});

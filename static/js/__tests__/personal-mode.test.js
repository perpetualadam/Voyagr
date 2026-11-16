let Auth,fetchMock,createClient;
beforeEach(()=>{
 jest.resetModules();localStorage.clear();document.documentElement.dataset.personalMode='true';
 document.body.innerHTML='<div id="authRequiredGate"></div><div id="softAuthBanner"></div>';
 fetchMock=jest.fn();global.fetch=fetchMock;
 createClient=jest.fn();global.supabase={createClient};
 Auth=require('../app/supabase-auth-orchestration');Auth.bind({call:{}});
});
afterEach(()=>{delete document.documentElement.dataset.personalMode;delete global.fetch;delete global.supabase;delete global.supabaseClient;delete global.VoyagrSupabaseAuthOrchestration;});
test('personal shell cannot bootstrap account auth even with stale offline config and stored grants',async()=>{
 localStorage.setItem('voyagr_public_auth_config_v1',JSON.stringify({version:1,origin:location.origin,fetchedAt:Date.now(),config:{supabase_url:'https://old.invalid',supabase_anon_key:'public-old-key',require_login:true}}));
 localStorage.setItem('retained-device-marker','keep');localStorage.setItem('retained-session-marker','keep');
 await Auth.initSupabaseAuth();
 expect(fetchMock).not.toHaveBeenCalled();expect(createClient).not.toHaveBeenCalled();
 expect(localStorage.getItem('voyagr_public_auth_config_v1')).toBeNull();
 expect(localStorage.getItem('retained-device-marker')).toBe('keep');expect(localStorage.getItem('retained-session-marker')).toBe('keep');
 expect(document.getElementById('authRequiredGate').style.display).toBe('none');
});
test('an online personal config also retires auth on an older shell',async()=>{
 delete document.documentElement.dataset.personalMode;
 fetchMock.mockResolvedValue({ok:true,json:async()=>({personal_mode:true,require_login:false,supabase_url:'',supabase_anon_key:''})});
 await Auth.initSupabaseAuth();expect(fetchMock).toHaveBeenCalledTimes(1);expect(createClient).not.toHaveBeenCalled();
});

test('personal mode blocks modal reporting even when called directly', async () => {
    document.documentElement.dataset.personalMode='true';
    const reports=require('../app/road-report-orchestration.js');
    const planner=jest.fn();
    reports.bind({roadReport:planner});
    try {
        expect(reports.openRoadReportModal()).toBe(false);
        expect(await reports.submitRoadReport()).toBe(false);
        expect(planner).not.toHaveBeenCalled();
    } finally { delete document.documentElement.dataset.personalMode; }
});

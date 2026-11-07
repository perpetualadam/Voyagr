const DC = require('../modules/navigation/dashcam-capture.js');
const fs = require('fs');
const path = require('path');

// jsdom lacks Fetch Headers. This boundary fake exposes the standard API used here.
if (!global.Headers) global.Headers = class {
    constructor(values = {}) { this.values = { ...values }; }
    set(key, value) { this.values[key] = value; }
    get(key) { return this.values[key]; }
};
const sessionA = { user: { id: 'user-A' }, access_token: 'private-test-token-A' };
const sessionB = { user: { id: 'user-B' }, access_token: 'private-test-token-B' };

function deps(session = sessionA, response = { status: 200 }) {
    return { getSession: jest.fn(async () => session), fetch: jest.fn(async () => response) };
}

test('media transport carries Bearer headers, disables caching/redirects, and pins owner', async () => {
    const d = deps();
    const response = await DC.privateFetch('/api/dashcam/recordings/clip/video?download=1', {}, d, 'user-A');
    expect(d.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = d.fetch.mock.calls[0];
    expect(url).not.toContain(sessionA.access_token);
    expect(options.headers.get('Authorization')).toBe('Bearer '+sessionA.access_token);
    expect(options).toMatchObject({ cache: 'no-store', redirect: 'error', credentials: 'omit' });
    expect(response.dashcamOwnerUserId).toBe('user-A');
});

test('anonymous local calls do not silently reach server storage', async () => {
    const d = deps(null);
    await expect(DC.privateFetch('/api/dashcam/start', { method:'POST' }, d)).rejects.toThrow('Sign in');
    expect(d.fetch).not.toHaveBeenCalled();
});

test('account change prevents uploading an earlier account clip', async () => {
    const d = deps(sessionB);
    await expect(DC.privateFetch('/api/dashcam/recordings/clip/upload', { method:'POST' }, d, 'user-A')).rejects.toThrow('Account changed');
    expect(d.fetch).not.toHaveBeenCalled();
});

test('in-flight response from earlier account is discarded after sign-out', async () => {
    const d = deps();
    d.getSession.mockResolvedValueOnce(sessionA).mockResolvedValueOnce(null);
    await expect(DC.privateFetch('/api/dashcam/recordings', {}, d)).rejects.toThrow('Account changed');
});

test.each([401, 403])('revoked/invalid credentials return %s without fallback access', async status => {
    const d = deps(sessionA, { status });
    await expect(DC.privateFetch('/api/dashcam/status', {}, d)).rejects.toThrow('expired or revoked');
    expect(d.fetch).toHaveBeenCalledTimes(1);
});

test.each(['https://evil.example/video', '//evil.example/video', '/api/other', '/api/dashcam/../config'])('tokens never sent to unapproved resource %s', async url => {
    const d = deps();
    await expect(DC.privateFetch(url, {}, d)).rejects.toThrow('Invalid dashcam resource');
    expect(d.getSession).not.toHaveBeenCalled();
    expect(d.fetch).not.toHaveBeenCalled();
});

function inlineDashcam(session = null, localOnly = false, recorderFails = false) {
    document.body.innerHTML = [
        '<input id="dashcamLocalOnly" type="checkbox">', '<select id="dashcamResolution"><option>720p</option></select>',
        '<select id="dashcamFps"><option>30</option></select>', '<select id="dashcamRetention"><option>7</option></select>',
        ...['dashcamAudio','dashcamStartBtn','dashcamStopBtn','dashcamStatusText','dashcamRecordingTime',
            'dashcamIndicator','dashcamPreview','recordingDuration','dashcamRecordingsList','dashcamTotalRecordings',
            'dashcamTotalSize','dashcamOldestRecording'].map(id => `<div id="${id}"></div>`),
    ].join('');
    document.getElementById('dashcamLocalOnly').checked = localOnly;
    const track = { stop: jest.fn() };
    const stream = { getTracks: () => [track] };
    class Recorder {
        static isTypeSupported() { return true; }
        constructor() { if (recorderFails) throw new Error('Camera recorder failed'); this.state = 'inactive'; }
        start() { this.state = 'recording'; }
        stop() {
            this.state = 'inactive';
            this.ondataavailable({ data: new Blob(['video'], { type:'video/webm' }) });
            this.onstop();
        }
    }
    let currentSession = session;
    const listeners = {};
    const fetch = jest.fn(async (url) => ({
        status: 200, ok: true,
        json: async () => url.endsWith('/recordings') ? { success:true, recordings:[] } :
            { success:true, recording_id:'dashcam_clip', settings:{} },
        blob: async () => new Blob(['saved-video'], { type:'video/webm' }),
    }));
    const win = {
        VoyagrDashcamCapture: DC,
        VoyagrSupabaseAuthOrchestration: { getSupabaseClient: () => ({ auth: { getSession: async () => ({ data:{session:currentSession} }) } }) },
        fetch, MediaRecorder: Recorder,
        addEventListener: (name, fn) => { listeners[name] = fn; },
        open: jest.fn(),
    };
    const nav = { mediaDevices: { getUserMedia: jest.fn(async () => stream) } };
    const notify = jest.fn();
    const source = fs.readFileSync(path.join(__dirname, '../../../templates/index.html'), 'utf8');
    const section = source.split('        // DASHCAM FUNCTIONALITY')[1].split('</script>')[0];
    const run = new Function('window','document','navigator','MediaRecorder','sendNotification', section +
        '\nreturn { startDashcamRecording, stopDashcamRecording, playDashcamRecording, loadDashcamRecordings, loadDashcamSettings, getState: () => dashcamState };');
    const app = run(win, document, nav, Recorder, notify);
    return { ...app, win, fetch, nav, notify, listeners, track, setSession: s => { currentSession = s; } };
}

describe('actual inline dashcam controls', () => {
    let click;
    beforeEach(() => {
        jest.useFakeTimers();
        global.URL.createObjectURL = jest.fn(() => 'blob:private-local-video');
        global.URL.revokeObjectURL = jest.fn();
        click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    });
    afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });

    test('anonymous server mode prompts sign-in before camera access or server start', async () => {
        const app = inlineDashcam(null, false);
        await app.startDashcamRecording();
        expect(app.fetch).not.toHaveBeenCalled();
        expect(app.nav.mediaDevices.getUserMedia).not.toHaveBeenCalled();
        expect(app.notify).toHaveBeenCalledWith('📹 Dashcam', expect.stringContaining('Sign in'), 'info');
    });

    test('explicit device-only recording captures and saves locally without API calls', async () => {
        const app = inlineDashcam(null, true);
        await app.startDashcamRecording();
        expect(app.getState().isRecording).toBe(true);
        expect(app.nav.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
        await app.stopDashcamRecording();
        expect(app.fetch).not.toHaveBeenCalled();
        expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
        expect(click).toHaveBeenCalledTimes(1);
        expect(app.getState().isRecording).toBe(false);
    });

    test('signed-in camera start/stop/upload uses authenticated owner-pinned requests', async () => {
        const app = inlineDashcam(sessionA);
        await app.startDashcamRecording();
        await app.stopDashcamRecording();
        const calls = app.fetch.mock.calls;
        expect(calls.map(c => c[0])).toEqual(expect.arrayContaining([
            '/api/dashcam/start', '/api/dashcam/stop', '/api/dashcam/recordings/dashcam_clip/upload',
        ]));
        calls.forEach(([, opts]) => expect(opts.headers.get('Authorization')).toBe('Bearer '+sessionA.access_token));
        const stop = calls.find(c => c[0] === '/api/dashcam/stop');
        expect(JSON.parse(stop[1].body)).toEqual({ recording_id:'dashcam_clip' });
        expect(calls.find(c => c[0].endsWith('/upload'))[1].body).toBeInstanceOf(Blob);
    });

    test('recorder failure rolls back only its authenticated server session', async () => {
        const app = inlineDashcam(sessionA, false, true);
        await app.startDashcamRecording();
        expect(app.fetch.mock.calls.map(c => c[0])).toEqual(['/api/dashcam/start', '/api/dashcam/stop']);
        expect(app.fetch.mock.calls[1][1].headers.get('Authorization')).toBe('Bearer '+sessionA.access_token);
        expect(JSON.parse(app.fetch.mock.calls[1][1].body)).toEqual({ recording_id: 'dashcam_clip' });
        expect(app.getState().isRecording).toBe(false);
        expect(app.getState().starting).toBe(false);
    });

    test.each(['sign-out', 'switch-away-and-back'])('%s while the start response body is pending cannot start the camera recorder', async mode => {
        const app = inlineDashcam(sessionA);
        let finishBody;
        let bodyStarted;
        const pendingBody = new Promise(resolve => { bodyStarted = resolve; });
        app.fetch.mockImplementationOnce(async () => ({
            status: 200, ok: true,
            json: () => { bodyStarted(); return new Promise(resolve => { finishBody = resolve; }); },
        }));
        const starting = app.startDashcamRecording();
        await pendingBody;
        app.setSession(mode === 'sign-out' ? null : sessionB);
        app.listeners['voyagr-auth-changed']({ detail: { userId: mode === 'sign-out' ? null : 'user-B' } });
        if (mode !== 'sign-out') {
            app.setSession(sessionA);
            app.listeners['voyagr-auth-changed']({ detail: { userId: 'user-A' } });
        }
        expect(app.track.stop).toHaveBeenCalled();
        finishBody({ success: true, recording_id: 'dashcam_clip' });
        await starting;
        expect(app.getState().isRecording).toBe(false);
        expect(app.getState().mediaRecorder).toBeNull();
        expect(app.getState().starting).toBe(false);
    });

    test('rapid stop/start replaces the metadata timer instead of collecting duplicate GPS samples', async () => {
        const app = inlineDashcam(sessionA);
        app.nav.geolocation = { getCurrentPosition: jest.fn(done => done({
            coords: { latitude: 51.5, longitude: -0.1, speed: 0, heading: 0 },
        })) };
        await app.startDashcamRecording();
        await app.stopDashcamRecording();
        await app.startDashcamRecording();
        await jest.advanceTimersByTimeAsync(5000);
        expect(app.nav.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
        expect(app.fetch.mock.calls.filter(c => c[0] === '/api/dashcam/metadata')).toHaveLength(1);
        await app.stopDashcamRecording();
        await jest.advanceTimersByTimeAsync(5000);
        expect(app.nav.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
    });

    test('switching to device-only capture cannot inherit the server GPS metadata timer', async () => {
        const app = inlineDashcam(sessionA);
        app.nav.geolocation = { getCurrentPosition: jest.fn(done => done({
            coords: { latitude: 51.5, longitude: -0.1, speed: 0, heading: 0 },
        })) };
        await app.startDashcamRecording();
        await app.stopDashcamRecording();
        document.getElementById('dashcamLocalOnly').checked = true;
        await app.startDashcamRecording();
        await jest.advanceTimersByTimeAsync(5000);
        expect(app.nav.geolocation.getCurrentPosition).not.toHaveBeenCalled();
        expect(app.fetch.mock.calls.filter(c => c[0] === '/api/dashcam/metadata')).toHaveLength(0);
        await app.stopDashcamRecording();
    });

    test('sign-out during capture saves locally and cannot upload under a new account', async () => {
        const app = inlineDashcam(sessionA);
        await app.startDashcamRecording();
        app.setSession(sessionB);
        await app.stopDashcamRecording();
        expect(app.fetch.mock.calls.some(c => c[0].endsWith('/upload'))).toBe(false);
        expect(click).toHaveBeenCalledTimes(1);
    });

    test('authenticated playback uses a private blob and closes it on account change', async () => {
        const app = inlineDashcam(sessionA);
        const popup = { opener: {}, document, closed: false, close: jest.fn() };
        app.win.open.mockReturnValue(popup);
        await app.playDashcamRecording('dashcam_clip', false);
        expect(app.fetch.mock.calls[0][0]).toBe('/api/dashcam/recordings/dashcam_clip/video');
        expect(document.querySelector('video').src).toBe('blob:private-local-video');
        app.setSession(null);
        app.listeners['voyagr-auth-changed']({ detail:{userId:null} });
        expect(popup.close).toHaveBeenCalled();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-local-video');
        expect(document.getElementById('dashcamRecordingsList').textContent).toContain('Sign in');
    });

    test.each([null, {user:{id:'user-A'}}, {access_token:'test-token'}])('startup with incomplete session %p shows sign-in without private loads', async session => {
        const app = inlineDashcam(session);
        const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
        const transport = jest.spyOn(DC, 'privateFetch');
        const resolution = document.getElementById('dashcamResolution').value;
        await Promise.all([app.loadDashcamRecordings(), app.loadDashcamSettings()]);
        expect(transport).not.toHaveBeenCalled();
        expect(app.fetch).not.toHaveBeenCalled();
        expect(errors).not.toHaveBeenCalled();
        expect(document.getElementById('dashcamRecordingsList').textContent).toBe('Sign in to view your private recordings');
        expect(document.getElementById('dashcamTotalRecordings').textContent).toBe('0');
        expect(document.getElementById('dashcamResolution').value).toBe(resolution);
        expect(app.nav.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    });

    test('signing in after anonymous startup loads authenticated private data normally', async () => {
        const app = inlineDashcam(null);
        await Promise.all([app.loadDashcamRecordings(), app.loadDashcamSettings()]);
        app.setSession(sessionA);
        app.fetch.mockImplementation(async url => ({status:200,ok:true,json:async()=>url.endsWith('/recordings')
            ? {success:true,recordings:[]}
            : {success:true,settings:{resolution:'720p',fps:30,retention_days:7,audio_enabled:true}}}));
        app.listeners['voyagr-auth-changed']({detail:{userId:'user-A'}});
        await jest.advanceTimersByTimeAsync(0);
        expect(app.fetch.mock.calls.map(c=>c[0])).toEqual(['/api/dashcam/recordings','/api/dashcam/settings']);
        app.fetch.mock.calls.forEach(([,options])=>expect(options.headers.get('Authorization')).toBe('Bearer '+sessionA.access_token));
        expect(document.getElementById('dashcamRecordingsList').textContent).toBe('No recordings yet');
        expect(document.getElementById('dashcamResolution').value).toBe('720p');
        expect(document.getElementById('dashcamRetention').value).toBe('7');
        expect(document.getElementById('dashcamAudio').classList.contains('active')).toBe(true);
    });

    test.each(['loadDashcamRecordings','loadDashcamSettings'])('%s still reports genuine network errors', async method => {
        const app=inlineDashcam(sessionA);
        const errors=jest.spyOn(console,'error').mockImplementation(()=>{});
        app.fetch.mockRejectedValue(new Error('network unavailable'));
        await app[method]();
        expect(app.fetch).toHaveBeenCalledTimes(1);
        expect(errors).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({message:'network unavailable'}));
    });

    test.each(['loadDashcamRecordings','loadDashcamSettings'])('%s rejects a private response body after sign-out', async method => {
        const app=inlineDashcam(sessionA);
        jest.spyOn(console,'error').mockImplementation(()=>{});
        let release,bodyStarted;
        const pending=new Promise(resolve=>{bodyStarted=resolve;});
        app.fetch.mockResolvedValue({status:200,ok:true,json:()=>{
            bodyStarted();return new Promise(resolve=>{release=resolve;});
        }});
        const loading=app[method]();await pending;
        app.setSession(null);app.listeners['voyagr-auth-changed']({detail:{userId:null}});
        release({success:true,recordings:[{recording_id:'private-A',start_time:0}],settings:{resolution:'private-A'}});
        await loading;
        expect(document.getElementById('dashcamRecordingsList').textContent).not.toContain('private-A');
        expect(document.getElementById('dashcamResolution').value).toBe('720p');
        expect(document.getElementById('dashcamTotalRecordings').textContent).toBe('0');
    });


    test('page-load initialization treats a guest session as a normal sign-in state', async () => {
        const app=inlineDashcam(null);
        const errors=jest.spyOn(console,'error').mockImplementation(()=>{});
        app.listeners.load();await jest.advanceTimersByTimeAsync(0);
        expect(app.fetch).not.toHaveBeenCalled();
        expect(errors).not.toHaveBeenCalled();
        expect(document.getElementById('dashcamRecordingsList').textContent).toContain('Sign in');
    });

    test.each(['loadDashcamRecordings','loadDashcamSettings'])('%s reports HTTP failures without displaying their body', async method => {
        const app=inlineDashcam(sessionA);
        const errors=jest.spyOn(console,'error').mockImplementation(()=>{});
        const json=jest.fn(async()=>({success:true,recordings:[],settings:{resolution:'720p'}}));
        app.fetch.mockResolvedValue({status:503,ok:false,json});
        await app[method]();
        expect(errors).toHaveBeenCalled();
        expect(json).not.toHaveBeenCalled();
    });

});

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
    const stream = { getTracks: () => [{ stop: jest.fn() }] };
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
        '\nreturn { startDashcamRecording, stopDashcamRecording, playDashcamRecording, loadDashcamRecordings, getState: () => dashcamState };');
    const app = run(win, document, nav, Recorder, notify);
    return { ...app, win, fetch, nav, notify, listeners, setSession: s => { currentSession = s; } };
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
        expect(app.getState().isRecording).toBe(false);
        expect(app.getState().starting).toBe(false);
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
});

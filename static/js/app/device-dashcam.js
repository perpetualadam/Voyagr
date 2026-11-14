/** Durable device-only clips. Capture never starts a server session or falls back to upload. */
(function (root) {
  'use strict';

  let session = null,
    starting = false;
  let startGeneration = 0;
  const resources = new Set();
  const node = id => document.getElementById(id);
  function notice(text, type = 'info') {
    if (typeof root.sendNotification === 'function') root.sendNotification('Dashcam', text, type);else if (node('dashcamStatusText')) node('dashcamStatusText').textContent = text;
  }
  function ui(recording) {
    if (node('dashcamStartBtn')) node('dashcamStartBtn').style.display = recording ? 'none' : 'block';
    if (node('dashcamStopBtn')) node('dashcamStopBtn').style.display = recording ? 'block' : 'none';
    if (node('dashcamStatusText')) node('dashcamStatusText').textContent = recording ? 'Recording on device' : 'Stopped';
    if (node('dashcamRecordingTime')) node('dashcamRecordingTime').style.display = recording ? 'block' : 'none';
    if (node('dashcamIndicator')) node('dashcamIndicator').style.display = recording ? 'block' : 'none';
  }
  function release(s) {
    clearInterval(s.timer);
    clearInterval(s.points);
    for (const track of s.stream?.getTracks() || []) track.stop();
    if (node('dashcamPreview')) {
      node('dashcamPreview').srcObject = null;
      node('dashcamPreview').style.display = 'none';
    }
    ui(false);
  }
  function clearPlayback() {
    for (const resource of resources) {
      URL.revokeObjectURL(resource.url);
      if (resource.popup && !resource.popup.closed) resource.popup.close();
    }
    resources.clear();
  }
  async function start(settings) {
    if (session || starting) return false;
    starting = true;
    const generation = ++startGeneration;
    const local = root.VoyagrLocalData,
      c = local.capture();
    let stream, clip;
    try {
      await local.ready();
      await local.db().open();
      if (!local.current(c) || generation !== startGeneration) throw Error('Owner changed');
      const DC = root.VoyagrDashcamCapture;
      if (!DC?.isCaptureSupported({
        navigator: root.navigator,
        window: root
      })) throw Error('Capture unavailable');
      stream = await root.navigator.mediaDevices.getUserMedia(DC.buildMediaConstraints({
        ...settings,
        audioEnabled: settings?.audioEnabled === true
      }));
      if (!local.current(c) || generation !== startGeneration) throw Error('Owner changed');
      const mime = DC.pickSupportedMimeType(root.MediaRecorder.isTypeSupported?.bind(root.MediaRecorder));
      clip = await local.db().createClip(c.owner, mime || 'video/webm');
      if (!local.current(c) || generation !== startGeneration) throw Error('Owner changed');
      const recorder = new root.MediaRecorder(stream, mime ? {
        mimeType: mime
      } : undefined);
      let finish;
      const done = new Promise(resolve => {
        finish = resolve;
      });
      const s = {
        ctx: c,
        clip,
        stream,
        recorder,
        queue: Promise.resolve(),
        pending: 0,
        error: false,
        done
      };
      session = s;
      recorder.ondataavailable = event => {
        if (!event.data?.size) return;
        s.pending += event.data.size;
        s.queue = s.queue.then(() => local.db().appendChunk(c.owner, clip.id, event.data)).catch(() => {
          s.error = true;
          if (recorder.state === 'recording') recorder.stop();
        }).finally(() => {
          s.pending -= event.data.size;
        });
        if (s.pending > 8 * 1024 * 1024) {
          s.error = true;
          if (recorder.state === 'recording') recorder.stop();
        }
      };
      recorder.onerror = () => {
        s.error = true;
        if (recorder.state === 'recording') recorder.stop();else void finalize();
      };
      let finalized = false;
      async function finalize() {
        if (finalized) return;
        finalized = true;
        clearInterval(s.points);
        try {
          await s.queue;
          const result = await local.db().finishClip(c.owner, clip.id, s.error ? 'partial' : 'complete');
          if (local.current(c)) notice(result.status === 'complete' ? 'Recording saved on this device' : 'Recording interrupted; committed chunks are retained for recovery', result.status === 'complete' ? 'success' : 'warning');
        } catch (_) {
          if (local.current(c)) notice('Recording interrupted. Previously committed chunks remain on this device.', 'error');
        } finally {
          release(s);
          if (session === s) session = null;
          if (local.current(c)) await list();
          finish(true);
        }
      }
      recorder.onstop = finalize;
      recorder.start(1000);
      if (node('dashcamPreview')) {
        node('dashcamPreview').srcObject = stream;
        node('dashcamPreview').style.display = 'block';
      }
      ui(true);
      s.timer = setInterval(() => {
        if (node('recordingDuration')) {
          const seconds = Math.floor((Date.now() - clip.createdAt) / 1000);
          node('recordingDuration').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
        }
      }, 1000);
      if (node('dashcamLocalGps')?.checked) s.points = setInterval(() => {
        const location = root.VoyagrLocationOrchestration,
          gps = root.VoyagrGpsOrchestration;
        const age=gps?.getLastGpsFixAgeMs?.();
        if (!local.current(c)||!Number.isFinite(age)||age<0||age>15000) return;
        const lat = location?.getCurrentLat(),
          lon = location?.getCurrentLon();
        if (typeof lat !== 'number' || typeof lon !== 'number') return;
        s.queue = s.queue.then(() => local.db().addPoint(c.owner, clip.id, {
          lat,
          lon,
          timestamp: Date.now()
        })).catch(() => {
          s.error = true;
        });
      }, 5000);
      return true;
    } catch (_) {
      if (session && clip && session.clip.id === clip.id) {
        release(session);
        session = null;
      }
      for (const track of stream?.getTracks() || []) track.stop();
      if (clip) await local.db().finishClip(c.owner, clip.id, 'partial').catch(() => {});
      if (local.current(c)) notice('Recording could not start. Check camera permission and device storage.', 'error');
      return false;
    } finally {
      starting = false;
    }
  }
  function stop() {
    if (!session) return Promise.resolve(false);
    const s = session;
    if (s.recorder.state === 'recording') s.recorder.stop();
    return s.done;
  }
  async function list() {
    const local = root.VoyagrLocalData;
    if (!local) return;
    const c = local.capture();
    try {
      await local.ready();
      const clips = await local.db().listClips(c.owner);
      if (!local.current(c)) return;
      const el = node('dashcamRecordingsList');
      if (!el) return;
      el.textContent = '';
      for (const clip of clips.sort((a, b) => b.createdAt - a.createdAt)) {
        const row = document.createElement('article'),
          text = document.createElement('p');
        const active = session?.clip.id === clip.id;
        const status = clip.status === 'recording' && !active ? 'Interrupted' : clip.status;
        text.textContent = `${new Date(clip.createdAt).toLocaleString()} · ${(clip.bytes / 1024 / 1024).toFixed(1)} MB · ${status}`;
        row.appendChild(text);
        for (const [label, action] of [['Play', () => play(clip.id, false)], ['Download', () => play(clip.id, true)], ['Delete', () => remove(clip.id)]]) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = label;
          b.disabled = active;
          b.onclick = () => {
            if (local.current(c)) void action();
          };
          row.appendChild(b);
        }
        el.appendChild(row);
      }
      if (!clips.length) el.textContent = 'No recordings in this device profile.';
      if (node('dashcamTotalRecordings')) node('dashcamTotalRecordings').textContent = String(clips.length);
      if (node('dashcamTotalSize')) node('dashcamTotalSize').textContent = (clips.reduce((n, x) => n + x.bytes, 0) / 1024 / 1024).toFixed(1) + ' MB';
      if (node('dashcamOldestRecording')) node('dashcamOldestRecording').textContent = clips.length ? new Date(Math.min(...clips.map(x => x.createdAt))).toLocaleDateString() : '—';
    } catch (_) {
      local.report();
      if (node('dashcamRecordingsList')) node('dashcamRecordingsList').textContent = 'Device recordings unavailable. Existing data has not been cleared.';
    }
  }
  async function play(id, download) {
    const local = root.VoyagrLocalData,
      c = local.capture(),
      popup = download ? null : root.open('', '_blank');
    if (popup) popup.opener = null;
    try {
      const blob = await local.db().clipBlob(c.owner, id);
      if (!local.current(c) || !blob.size) throw Error('Clip unavailable');
      if (download) {
        local.download(blob, 'voyagr-' + id + (blob.type.includes('mp4') ? '.mp4' : '.webm'));
        return;
      }
      if (!popup) throw Error('Playback window blocked');
      const url = URL.createObjectURL(blob);
      resources.add({
        url,
        popup
      });
      const video = popup.document.createElement('video');
      video.controls = true;
      video.src = url;
      popup.document.body.appendChild(video);
    } catch (_) {
      popup?.close();
      if (local.current(c)) notice('Recording unavailable. Interrupted clips may contain only recoverable partial data.', 'warning');
    }
  }
  async function remove(id) {
    const local = root.VoyagrLocalData,
      c = local.capture();
    if (session?.clip.id === id) return;
    if (!confirm('Delete this recording and GPS metadata from this device profile?')) return;
    try {
      await local.db().deleteClip(c.owner, id);
      if (local.current(c)) await list();
    } catch (_) {
      local.report();
    }
  }
  async function cleanup(days) {
    const local = root.VoyagrLocalData,
      c = local.capture();
    if (!confirm('Delete device recordings older than the selected number of days? Cloud copies are unchanged.')) return;
    try {
      const clips = await local.db().listClips(c.owner);
      for (const clip of clips) {
        if (!local.current(c)) return;
        if (clip.id !== session?.clip.id && clip.createdAt < Date.now() - days * 86400000) await local.db().deleteClip(c.owner, clip.id);
      }
      if (local.current(c)) await list();
    } catch (_) {
      local.report();
    }
  }
  async function loadSettings() {
    const local = root.VoyagrLocalData,
      c = local.capture();
    try {
      const settings = (await local.read('dashcamSettings', c)) || {};
      if (!local.current(c)) return;
      for (const [key, id] of [['resolution', 'dashcamResolution'], ['fps', 'dashcamFps'], ['retention_days', 'dashcamRetention']]) if (settings[key] != null && node(id)) node(id).value = String(settings[key]);
      if (node('dashcamAudio')) node('dashcamAudio').classList.toggle('active', settings.audio_enabled === true);
    } catch (_) {
      local.report();
    }
  }
  async function saveSettings() {
    const local = root.VoyagrLocalData;
    try {
      await local.update('dashcamSettings', () => ({
        resolution: node('dashcamResolution')?.value || '720p',
        fps: Number(node('dashcamFps')?.value || 30),
        retention_days: Number(node('dashcamRetention')?.value || 14),
        audio_enabled: node('dashcamAudio')?.classList.contains('active') === true
      }));
    } catch (_) {
      local.report();
    }
  }
  root.addEventListener?.('voyagr-local-owner-change', () => {
    startGeneration++;
    clearPlayback();
    void stop();
    if (node('dashcamRecordingsList')) node('dashcamRecordingsList').textContent = '';
    void loadSettings();
    void list();
  });
  root.addEventListener?.('voyagr-auth-changed', event => {
    const next = event.detail?.userId ? 'sb:' + event.detail.userId : 'guest';
    if (session && session.ctx.owner !== next) {
      clearPlayback();
      void stop();
    }
  });
  root.addEventListener?.('pagehide', () => {
    startGeneration++;
    clearPlayback();
    void stop();
  });
  const api = {
    start,
    stop,
    list,
    play,
    remove,
    cleanup,
    loadSettings,
    saveSettings,
    isRecording: () => !!session
  };
  if (typeof module !== 'undefined') module.exports = api;
  root.VoyagrDeviceDashcam = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

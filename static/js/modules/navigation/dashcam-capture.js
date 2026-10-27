/**
 * @file Pure dashcam capture helpers (constraints, mime, upload plan).
 * @module modules/navigation/dashcam-capture
 */
(function (root) {
    'use strict';

    var RESOLUTION_PIXELS = {
        '480p': { width: 854, height: 480 },
        '720p': { width: 1280, height: 720 },
        '1080p': { width: 1920, height: 1080 },
        '1440p': { width: 2560, height: 1440 },
    };

    var MIME_CANDIDATES = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
    ];

    /**
     * @param {Object} [input]
     * @param {string} [input.resolution]
     * @param {number|string} [input.fps]
     * @param {boolean} [input.audioEnabled]
     * @returns {MediaStreamConstraints}
     */
    function buildMediaConstraints(input) {
        input = input || {};
        var resolution = RESOLUTION_PIXELS[input.resolution] || RESOLUTION_PIXELS['720p'];
        var fps = parseInt(input.fps, 10);
        if (!Number.isFinite(fps) || fps <= 0) fps = 30;
        var audioEnabled = input.audioEnabled !== false;
        return {
            audio: !!audioEnabled,
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: resolution.width },
                height: { ideal: resolution.height },
                frameRate: { ideal: fps },
            },
        };
    }

    /**
     * @param {function(string): boolean} [isTypeSupported]
     * @param {string[]} [candidates]
     * @returns {string}
     */
    function pickSupportedMimeType(isTypeSupported, candidates) {
        var list = candidates && candidates.length ? candidates : MIME_CANDIDATES;
        if (typeof isTypeSupported !== 'function') {
            return 'video/webm';
        }
        for (var i = 0; i < list.length; i++) {
            try {
                if (isTypeSupported(list[i])) return list[i];
            } catch (e) {
                /* ignore unsupported probe errors */
            }
        }
        return '';
    }

    /**
     * @param {Object} [input]
     * @param {string} input.recordingId
     * @param {string} [input.mimeType]
     * @returns {Object}
     */
    function buildUploadRequestPlan(input) {
        input = input || {};
        var recordingId = String(input.recordingId || '').replace(/[^a-zA-Z0-9_-]/g, '');
        if (!recordingId) {
            return { shouldUpload: false, error: 'Missing recording_id' };
        }
        var mimeType = input.mimeType || 'video/webm';
        return {
            shouldUpload: true,
            url: '/api/dashcam/recordings/' + encodeURIComponent(recordingId) + '/upload',
            method: 'POST',
            headers: { 'Content-Type': mimeType.split(';')[0] || 'video/webm' },
            recordingId: recordingId,
        };
    }

    /**
     * When local MediaRecorder setup fails after POST /api/dashcam/start,
     * the server session must be aborted or it stays recording_active.
     *
     * @param {Object} [input]
     * @param {boolean} [input.serverSessionStarted]
     * @returns {{ shouldAbort: boolean, url?: string, method?: string }}
     */
    function buildAbortServerSessionPlan(input) {
        input = input || {};
        if (!input.serverSessionStarted) {
            return { shouldAbort: false };
        }
        return {
            shouldAbort: true,
            url: '/api/dashcam/stop',
            method: 'POST',
        };
    }

    /**
     * After local MediaRecorder teardown, decide whether the captured blob
     * should still be uploaded when POST /api/dashcam/stop fails or throws.
     * The client already finalized the blob, so a failed stop must not discard it.
     *
     * @param {Object} [input]
     * @param {string} [input.recordingId] - client id from /start
     * @param {string} [input.serverRecordingId] - id from /stop response
     * @param {number} [input.blobSize]
     * @param {boolean} [input.stopSuccess]
     * @param {string} [input.stopError]
     * @returns {{
     *   shouldUpload: boolean,
     *   recordingId: string,
     *   stopSucceeded: boolean,
     *   hasVideo: boolean,
     *   stopError: string
     * }}
     */
    function buildFinalizeStopPlan(input) {
        input = input || {};
        var recordingId = String(input.recordingId || input.serverRecordingId || '')
            .replace(/[^a-zA-Z0-9_-]/g, '');
        var blobSize = Number(input.blobSize);
        if (!Number.isFinite(blobSize) || blobSize < 0) blobSize = 0;
        return {
            shouldUpload: blobSize > 0 && !!recordingId,
            recordingId: recordingId,
            stopSucceeded: !!input.stopSuccess,
            hasVideo: blobSize > 0,
            stopError: input.stopError ? String(input.stopError) : '',
        };
    }

    /**
     * @param {MediaStream|null|undefined} stream
     * @returns {{ stoppedTracks: number }}
     */
    function stopMediaStreamTracks(stream) {
        var stopped = 0;
        if (!stream || typeof stream.getTracks !== 'function') {
            return { stoppedTracks: 0 };
        }
        stream.getTracks().forEach(function (track) {
            try {
                track.stop();
                stopped += 1;
            } catch (e) {
                /* ignore */
            }
        });
        return { stoppedTracks: stopped };
    }

    /**
     * @param {Object} [input]
     * @returns {boolean}
     */
    function isCaptureSupported(input) {
        input = input || {};
        var nav = input.navigator || (typeof navigator !== 'undefined' ? navigator : null);
        var win = input.window || (typeof window !== 'undefined' ? window : null);
        return !!(
            nav &&
            nav.mediaDevices &&
            typeof nav.mediaDevices.getUserMedia === 'function' &&
            win &&
            typeof win.MediaRecorder === 'function'
        );
    }

    /** Authenticated same-origin media/API transport. Never put tokens in URLs.
     * expectedOwner pins recording operations to the account that started capture.
     */
    async function privateFetch(url, options, deps, expectedOwner) {
        if (typeof url !== 'string' || !/^\/api\/dashcam\//.test(url) || url.includes('..')) {
            throw new Error('Invalid dashcam resource');
        }
        var session = await deps.getSession();
        if (!session || !session.access_token || !session.user || !session.user.id) {
            throw new Error('Sign in to use private server recordings');
        }
        if (expectedOwner && session.user.id !== expectedOwner) {
            throw new Error('Account changed; recording remains on this device');
        }
        var headers = new Headers((options && options.headers) || {});
        headers.set('Authorization', 'Bearer ' + session.access_token);
        var response = await deps.fetch(url, Object.assign({}, options || {}, {
            headers: headers, cache: 'no-store', redirect: 'error', credentials: 'omit',
        }));
        if (response.status === 401 || response.status === 403) {
            throw new Error('Session expired or revoked; sign in again');
        }
        var after = await deps.getSession();
        if (!after || !after.user || after.user.id !== session.user.id) {
            throw new Error('Account changed; private response discarded');
        }
        response.dashcamOwnerUserId = session.user.id;
        return response;
    }

    var api = {
        privateFetch: privateFetch,
        RESOLUTION_PIXELS: RESOLUTION_PIXELS,
        MIME_CANDIDATES: MIME_CANDIDATES,
        buildMediaConstraints: buildMediaConstraints,
        pickSupportedMimeType: pickSupportedMimeType,
        buildUploadRequestPlan: buildUploadRequestPlan,
        buildAbortServerSessionPlan: buildAbortServerSessionPlan,
        buildFinalizeStopPlan: buildFinalizeStopPlan,
        stopMediaStreamTracks: stopMediaStreamTracks,
        isCaptureSupported: isCaptureSupported,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrDashcamCapture = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

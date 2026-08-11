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

    var api = {
        RESOLUTION_PIXELS: RESOLUTION_PIXELS,
        MIME_CANDIDATES: MIME_CANDIDATES,
        buildMediaConstraints: buildMediaConstraints,
        pickSupportedMimeType: pickSupportedMimeType,
        buildUploadRequestPlan: buildUploadRequestPlan,
        stopMediaStreamTracks: stopMediaStreamTracks,
        isCaptureSupported: isCaptureSupported,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrDashcamCapture = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

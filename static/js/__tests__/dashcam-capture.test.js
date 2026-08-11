/**
 * Tests for modules/navigation/dashcam-capture.js
 */
const DC = require('../modules/navigation/dashcam-capture.js');

describe('dashcam-capture module', () => {
    test('buildMediaConstraints defaults to 720p with audio', () => {
        const constraints = DC.buildMediaConstraints({});
        expect(constraints.audio).toBe(true);
        expect(constraints.video.width.ideal).toBe(1280);
        expect(constraints.video.height.ideal).toBe(720);
        expect(constraints.video.frameRate.ideal).toBe(30);
    });

    test('buildMediaConstraints honours resolution fps and muted audio', () => {
        const constraints = DC.buildMediaConstraints({
            resolution: '1080p',
            fps: '60',
            audioEnabled: false,
        });
        expect(constraints.audio).toBe(false);
        expect(constraints.video.width.ideal).toBe(1920);
        expect(constraints.video.frameRate.ideal).toBe(60);
    });

    test('pickSupportedMimeType returns first supported candidate', () => {
        const mime = DC.pickSupportedMimeType((type) => type === 'video/webm');
        expect(mime).toBe('video/webm');
    });

    test('pickSupportedMimeType falls back when probe missing', () => {
        expect(DC.pickSupportedMimeType(null)).toBe('video/webm');
    });

    test('buildUploadRequestPlan builds upload URL and content type', () => {
        const plan = DC.buildUploadRequestPlan({
            recordingId: 'dashcam_123',
            mimeType: 'video/webm;codecs=vp8,opus',
        });
        expect(plan.shouldUpload).toBe(true);
        expect(plan.url).toBe('/api/dashcam/recordings/dashcam_123/upload');
        expect(plan.headers['Content-Type']).toBe('video/webm');
    });

    test('buildUploadRequestPlan rejects empty recording id', () => {
        expect(DC.buildUploadRequestPlan({ recordingId: '' }).shouldUpload).toBe(false);
    });

    test('buildAbortServerSessionPlan aborts only after server start succeeds', () => {
        expect(DC.buildAbortServerSessionPlan({ serverSessionStarted: false })).toEqual({
            shouldAbort: false,
        });
        expect(DC.buildAbortServerSessionPlan({ serverSessionStarted: true })).toEqual({
            shouldAbort: true,
            url: '/api/dashcam/stop',
            method: 'POST',
        });
    });

    test('buildFinalizeStopPlan uploads captured blob even when stop fails', () => {
        const plan = DC.buildFinalizeStopPlan({
            recordingId: 'dashcam_123',
            blobSize: 2048,
            stopSuccess: false,
            stopError: 'No active recording',
        });
        expect(plan.shouldUpload).toBe(true);
        expect(plan.recordingId).toBe('dashcam_123');
        expect(plan.stopSucceeded).toBe(false);
        expect(plan.hasVideo).toBe(true);
        expect(plan.stopError).toBe('No active recording');
    });

    test('buildFinalizeStopPlan uses server recording id when client id missing', () => {
        const plan = DC.buildFinalizeStopPlan({
            serverRecordingId: 'dashcam_456',
            blobSize: 100,
            stopSuccess: true,
        });
        expect(plan.shouldUpload).toBe(true);
        expect(plan.recordingId).toBe('dashcam_456');
        expect(plan.stopSucceeded).toBe(true);
    });

    test('buildFinalizeStopPlan skips upload when blob empty or id missing', () => {
        expect(DC.buildFinalizeStopPlan({
            recordingId: 'dashcam_123',
            blobSize: 0,
            stopSuccess: true,
        }).shouldUpload).toBe(false);
        expect(DC.buildFinalizeStopPlan({
            blobSize: 500,
            stopSuccess: false,
            stopError: 'boom',
        }).shouldUpload).toBe(false);
    });

    test('stopMediaStreamTracks stops each track', () => {
        const stop = jest.fn();
        const result = DC.stopMediaStreamTracks({
            getTracks: () => [{ stop }, { stop }],
        });
        expect(result.stoppedTracks).toBe(2);
        expect(stop).toHaveBeenCalledTimes(2);
    });

    test('isCaptureSupported requires getUserMedia and MediaRecorder', () => {
        expect(DC.isCaptureSupported({
            navigator: { mediaDevices: { getUserMedia: jest.fn() } },
            window: { MediaRecorder: function MediaRecorder() {} },
        })).toBe(true);
        expect(DC.isCaptureSupported({
            navigator: {},
            window: {},
        })).toBe(false);
    });
});

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

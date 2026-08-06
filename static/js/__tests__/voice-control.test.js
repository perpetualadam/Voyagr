/**
 * Tests for modules/ui/voice-control.js
 */
const VC = require('../modules/ui/voice-control.js');

describe('voice-control module surface', () => {
    test('exposes core voice control helpers', () => {
        expect(typeof VC.buildVoiceRecognitionInitPreflightPlan).toBe('function');
        expect(typeof VC.buildVoiceSetStatusExecutePlan).toBe('function');
        expect(typeof VC.buildToggleVoiceInputOrchestrationPlan).toBe('function');
        expect(VC.VOICE_STATUS_ELEMENT_ID).toBe('voiceStatus');
    });
});

describe('buildVoiceRecognitionInitPreflightPlan', () => {
    test('returns ready when already initialized', () => {
        const plan = VC.buildVoiceRecognitionInitPreflightPlan({
            alreadyInitialized: true,
            hasRecognitionInstance: true,
            hasSpeechRecognition: true,
        });
        expect(plan.action).toBe('ready');
    });

    test('returns unsupported when SpeechRecognition is missing', () => {
        const plan = VC.buildVoiceRecognitionInitPreflightPlan({
            hasSpeechRecognition: false,
        });
        expect(plan.action).toBe('unsupported');
        expect(plan.statusMessage).toContain('not supported');
    });

    test('returns initialize config when API is available', () => {
        const plan = VC.buildVoiceRecognitionInitPreflightPlan({
            hasSpeechRecognition: true,
        });
        expect(plan.action).toBe('initialize');
        expect(plan.recognitionConfig.lang).toBe('en-US');
    });
});

describe('buildVoiceSetListeningUiExecutePlan', () => {
    test('maps listening state to button labels and aria', () => {
        const listening = VC.buildVoiceSetListeningUiExecutePlan(true);
        expect(listening.btnText).toBe('Stop');
        expect(listening.btnAriaPressed).toBe('true');
        expect(listening.fabTitle).toContain('Stop');

        const idle = VC.buildVoiceSetListeningUiExecutePlan(false);
        expect(idle.btnText).toBe('Listen');
        expect(idle.fabTitle).toBe('Voice control');
    });
});

describe('buildVoiceTranscriptCollectPlan', () => {
    test('merges final and interim transcript chunks', () => {
        const event = {
            resultIndex: 0,
            results: [
                { isFinal: true, 0: { transcript: 'navigate ' } },
                { isFinal: false, 0: { transcript: 'to work' } },
            ],
        };
        const plan = VC.buildVoiceTranscriptCollectPlan(event, '');
        expect(plan.nextFinalTranscript).toBe('navigate ');
        expect(plan.shown).toBe('navigate to work');
    });
});

describe('buildToggleVoiceInputOrchestrationPlan', () => {
    test('stop action when already listening', () => {
        const plan = VC.buildToggleVoiceInputOrchestrationPlan({ isListening: true });
        expect(plan.action).toBe('stop');
        expect(plan.shouldStopRecognition).toBe(true);
    });

    test('start action pauses Porcupine when wake pipeline is running', () => {
        const plan = VC.buildToggleVoiceInputOrchestrationPlan({
            isListening: false,
            porcupineWakePipelineRunning: true,
        });
        expect(plan.action).toBe('start');
        expect(plan.pausePorcupineWake).toBe(true);
        expect(plan.clearTranscript).toBe(true);
    });
});

describe('buildVoiceCommandProcessOrchestrationPlan', () => {
    test('skips empty transcript and resumes wake word', () => {
        const plan = VC.buildVoiceCommandProcessOrchestrationPlan('   ');
        expect(plan.shouldProcess).toBe(false);
        expect(plan.resumePorcupineWake).toBe(true);
    });

    test('builds API orchestration for non-empty transcript', () => {
        const plan = VC.buildVoiceCommandProcessOrchestrationPlan('find parking');
        expect(plan.shouldProcess).toBe(true);
        expect(plan.apiPath).toBe('/api/voice/command');
        expect(plan.statusMessage).toContain('find parking');
    });
});

describe('buildVoiceCommandResultExecutePlan', () => {
    test('success response triggers action handling and speech', () => {
        const plan = VC.buildVoiceCommandResultExecutePlan({
            success: true,
            message: 'Routing now',
            action: 'navigate',
        });
        expect(plan.shouldHandleAction).toBe(true);
        expect(plan.speakMessage).toBe('Routing now');
    });

    test('failure response speaks fallback message', () => {
        const plan = VC.buildVoiceCommandResultExecutePlan({ success: false });
        expect(plan.shouldHandleAction).toBe(false);
        expect(plan.speakMessage).toContain('recognized');
    });
});

describe('buildSpeakTextPreflightPlan', () => {
    test('returns shouldSpeak false when synthesis unavailable', () => {
        expect(VC.buildSpeakTextPreflightPlan({ hasSpeechSynthesis: false }).shouldSpeak).toBe(false);
    });

    test('returns utterance config when synthesis is available', () => {
        const plan = VC.buildSpeakTextPreflightPlan({
            hasSpeechSynthesis: true,
            text: 'Hello',
        });
        expect(plan.shouldSpeak).toBe(true);
        expect(plan.utterance.text).toBe('Hello');
        expect(plan.onEndStatus).toBe('Ready');
    });
});

describe('buildVoiceActionDispatchPlan', () => {
    test('navigate action fills destination and schedules route calc', () => {
        const plan = VC.buildVoiceActionDispatchPlan(
            { action: 'navigate', location: 'London' },
            {}
        );
        expect(plan.shouldApply).toBe(true);
        expect(plan.endValue).toBe('London');
        expect(plan.scheduleCalculateRoute).toBe(true);
    });

    test('reroute action triggers only when navigation is active', () => {
        const active = VC.buildVoiceActionDispatchPlan(
            { action: 'reroute' },
            { routeInProgress: true, currentLat: 51.5, currentLon: -0.1 }
        );
        expect(active.triggerAutomaticReroute).toBe(true);
        expect(active.speakMessage).toContain('Recalculating');

        const idle = VC.buildVoiceActionDispatchPlan({ action: 'reroute' }, {});
        expect(idle.triggerAutomaticReroute).toBe(false);
        expect(idle.speakMessage).toContain('No active route');
    });

    test('report_hazard action builds API body from runtime position', () => {
        const plan = VC.buildVoiceActionDispatchPlan(
            { action: 'report_hazard', hazard_type: 'debris' },
            { currentLat: 1, currentLon: 2 }
        );
        expect(plan.fetchHazardReport).toBe(true);
        expect(plan.body.hazard_type).toBe('debris');
        expect(plan.body.lat).toBe(1);
    });

    test('buildVoiceHazardReportResponseExecutePlan warns on API error', () => {
        const execute = VC.buildVoiceHazardReportResponseExecutePlan({ success: false, error: 'too far' });
        expect(execute.shouldShowStatus).toBe(true);
        expect(execute.statusMessage).toContain('too far');
        expect(execute.shouldShowHazardConfirmation).toBe(false);
        expect(execute.hazardConfirmationHidden).toBe(true);
    });

    test('buildVoiceHazardReportResponseExecutePlan exposes hazard-confirmation hook on success', () => {
        const execute = VC.buildVoiceHazardReportResponseExecutePlan({
            success: true,
            report_id: 7,
        });
        expect(execute.shouldShowHazardConfirmation).toBe(true);
        expect(execute.hazardConfirmationElementId).toBe(VC.HAZARD_CONFIRMATION_ELEMENT_ID);
        expect(execute.hazardConfirmationMessage).toBe('Thanks — report received.');
        expect(execute.hazardConfirmationHidden).toBe(false);

        const dom = VC.buildVoiceHazardConfirmationDomExecutePlan(execute);
        expect(dom.shouldUpdate).toBe(true);
        expect(dom.elementId).toBe('hazardConfirmation');
        expect(dom.hidden).toBe(false);
        expect(dom.text).toBe('Thanks — report received.');
    });

    test('buildSimulateVoiceInputPlan trims transcript and skips empty input', () => {
        expect(VC.buildSimulateVoiceInputPlan('  Report speed camera  ')).toEqual({
            shouldProcess: true,
            transcript: 'Report speed camera',
        });
        expect(VC.buildSimulateVoiceInputPlan('')).toEqual({
            shouldProcess: false,
            transcript: '',
        });
        expect(VC.buildSimulateVoiceInputPlan(null).shouldProcess).toBe(false);
    });
});

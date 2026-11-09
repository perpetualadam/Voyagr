# Voice controls and provider-independent transcription

Investigated 9 November 2026. Implementation is opt-in and is not deployed.

## Findings

The app has three separate paths:

- **Wake phrase:** Picovoice Porcupine plus WebVoiceProcessor, enabled only when
  its browser assets/access key are configured. It is not the Listen recognizer.
- **Command transcription:** browser SpeechRecognition/webkitSpeechRecognition.
- **Command interpretation/output:** existing `/api/voice/command` deterministic
  parser and browser speech synthesis. Model output never selects an executable
  action directly or grants navigation eligibility.

The existing command path used en-US, could wrap its end handler repeatedly,
replace a microphone error with Processing, use interim-only text as a fallback,
throw on rapid starts, and accept a late command result after cancellation. This
increment uses en-GB, idempotent end processing, explicit final-only transcripts,
start/stop/error handling and cancellation/provider/background generation checks.
Background cleanup does nothing when voice input is inactive, preserving route
preview/simulation lifecycle behavior. Test speech cannot compete with the mic.

Picovoice's current FAQ describes an enterprise free trial followed by a paid-plan
sales process, and no dedicated personal/non-commercial plans. Do not assume a
previously working access key has a perpetual allowance. This does not establish
this installation's current account entitlement; that was not accessed.

## Alternatives and decision

| Path | Benefits | Practical limits |
| --- | --- | --- |
| Browser speech (default) | No new app-managed subscription or model deployment | Browser support is limited; recognition may use browser-vendor servers and need a network connection |
| OpenAI-compatible audio transcription (implemented, optional) | Server selects endpoint/model; supports compatible self-hosted and hosted services without a provider SDK | Requires a working service, capacity/quota and supported audio format; API compatibility is not universal model support |
| Speaches/faster-whisper (candidate self-hosted service) | OpenAI-compatible server with model selection and CPU/GPU support | Benchmark latency, RAM and concurrent recording load on an isolated candidate before using the already busy VPS; not installed by this change |
| openWakeWord (future wake-phrase investigation) | Separate open-source wake-word engine | Not a drop-in browser implementation; upstream describes required porting or streaming to a Python backend. Included pre-trained models are CC BY-NC-SA 4.0 although code is Apache 2.0. No models bundled |

The AI path replaces command transcription only. Picovoice remains optional for
wake activation. No continuous microphone stream is sent to an AI service by this
adapter: each activation is one bounded clip. If the existing wake phrase is also
enabled it can activate the selected recognizer; choosing AI is not a new wake-word
implementation. Replacing paid wake activation needs a separate browser/native
architecture, appropriately licensed model and road-noise/false-trigger testing.

## Configuration contract

Default: no AI service configured, no model download and no audio upload on page
load or engine selection. Browser speech remains selected unless the user changes
it in the voice card. AI unavailability never silently switches engines.

Operator configuration, **not applied automatically**:

```text
VOYAGR_STT_BASE_URL=https://chosen-service.example/v1
VOYAGR_STT_MODEL=chosen-transcription-model
VOYAGR_STT_API_KEY=server-side-credential-if-required
```

A local compatible service may use `http://127.0.0.1:9000/v1` without an API key.
Non-loopback services require HTTPS. Base URL must have no embedded credentials,
query or fragment. `/audio/transcriptions` is appended; the service must accept
multipart file/model/language=en/response_format=json and return `{ "text": "…" }`.
Use a model supporting English transcription and browser-produced WebM/Opus,
MP4 or Ogg; the adapter does not transcode or promise all services accept every
codec. The selected engine is a device-local preference, not a provider secret.

Only the availability boolean enters page context. Endpoint/model/key are chosen
on the server and cannot be supplied by an audio request. The browser sends raw
audio to same-origin `/api/voice/transcribe` with the app header. This endpoint
requires same-origin Origin/header checks, uses existing per-IP/shared rate limiter
infrastructure (6/min per IP, 30/min aggregate; fallback is per worker without
shared Redis), admits at most one upstream transcription per worker so requests
do not fill all threaded workers, and bounds audio to 1 MiB and upstream JSON to 64 KiB. Recording
stops at 15 seconds; audio stays in memory. Connect/read timeouts are 3/20 seconds,
with a cooperative response-read deadline; client upload has a 25-second abort.
No credentials follow redirects. Provider errors/bodies are not sent to clients.
Transcripts are capped at the existing command parser's 500-character limit.

Stopping, errors, Cancel, provider changes, page hiding and page exit release the
microphone and invalidate late client results. A client abort does not guarantee
a remote provider immediately stops already submitted work. Capacity/quota and
provider-side retention must be checked before enabling a hosted service. Voyagr
adds no recording storage, but cannot make retention promises for other services.

## Acceptance

Unit/API regressions cover final-only single processing, permission errors, stale
commands, provider changes, cancellation, limits, malformed results, disabled
configuration, origins, rate limits, redirects and secret-safe error responses.
Browser checks use production UI/controllers and real MediaRecorder with generated
audio; speech recognition/provider results and synthesis are boundary fixtures.
They establish plumbing, state, microphone release, keyboard and layout behavior,
not speech accuracy, real microphone permissions or provider readiness.

Before enabling AI: choose a service/model, validate codec support and quotas,
measure latency/capacity on representative audio, and test target phones, UK place
names/accents, road noise, wake handoff and interruptions. No production change or
new subscription has been made. Clear All and Save Location styling stay separate.

## Primary sources

- [Picovoice FAQ: Business Model & Pricing](https://picovoice.ai/docs/faq/general/)
- [MDN SpeechRecognition: availability and server-based recognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- [Speaches: OpenAI-compatible transcription and model loading](https://github.com/speaches-ai/speaches)
- [SYSTRAN faster-whisper: server integrations](https://github.com/SYSTRAN/faster-whisper)
- [openWakeWord: browser support and code/model licences](https://github.com/dscripka/openWakeWord)

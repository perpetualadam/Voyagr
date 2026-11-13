# Car and headphone audio in the PWA

Settings → Voice & alerts → Car & headphone audio provides an opt-in microphone
check, input selection where the browser exposes microphones, and an audio test
through the normal spoken-navigation path. The page opens no capture or device
list at startup. Checks release their tracks, and late permission results are
released after cancellation or hiding. Starting voice input cancels a pending
check. Device labels are rendered as text; device IDs stay in page memory and
are not sent to route APIs, analytics, sharing or storage.

The selected input is used by AI MediaRecorder capture and the existing wake
processor's documented `deviceId` option. Browser SpeechRecognition retains its
own system input selection. Device disappearance falls back to system default,
and available device-change events refresh/restart an active wake pipeline.
Focus/visibility refresh the available list after an audio check or successful app capture without a new
permission prompt. A recording whose input track ends is cancelled without an
upload or command action; it does not silently submit interrupted audio.

## Platform boundary

Pairing and connection belong to phone Bluetooth settings. Synthesized speech
has no `setSinkId` property; it follows the platform/browser output. Adding an
HTMLMediaElement output picker would not route current spoken directions.
Web Bluetooth exposes BLE GATT, not pairing/control of A2DP or HFP audio. No
Bluetooth pairing button or unverified connected-device badge is added.

Both built-in car systems and headphones can use the selected system media
output. A car microphone is usable only if Android/browser exposes it; a car
speaker connection does not establish microphone availability. Media/call audio
profiles, Chrome, the accessory and OS determine that routing. The PWA cannot
guarantee locked-screen capture, car steering-wheel button control, ducking of
other apps or every Bluetooth accessory. No subscription or native dependency
is introduced.

## Verification

- Jest: startup privacy, exposed input choices, actual capture constraints,
  fallback on disconnection/acquisition failure, permission denial, late check
  cancellation, active-command preservation, label escaping, interrupted capture
  and selected wake input.
- `node scripts/check-car-headphone-audio.cjs`: real Chromium media APIs with
  simulated hardware, real production controls/recording adapter, selected input
  settings and ended tracks. Direction synthesis is mocked at the boundary.
  Checks portrait/landscape and light/dark touch targets/overflow.
- These checks do not establish physical Bluetooth connection, audibility,
  speaker echo, car microphone capture, phone hardware or road-noise accuracy.

## Physical acceptance (parked; pending)

For Android Chrome and installed PWA, test each supported car and headphone:

1. Pair in system settings, enable media audio and select that output. Run Test
   directions, verifying audible complete directions at a suitable media volume.
2. Check microphone. Try the default and any actually exposed external input.
   Exercise wake phrase → command → spoken result → wake again. Test both
   configured speech providers; browser input selection is system-managed.
3. Disconnect/reconnect while idle and while recording. Verify no partial action,
   no stuck microphone indicator, appropriate fallback and a subsequent command.
4. Test a call interruption, speaker echo, foreground recovery and Bluetooth
   profile changes. Test locked/background behaviour separately; do not infer it
   from foreground acceptance.
5. Confirm phone-only directions/voice, navigation GPS and ETA remain unchanged.

## Sources

- https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance
- https://developer.mozilla.org/en-US/docs/Web/API/Audio_Output_Devices_API
- https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/deviceId
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/devicechange_event
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API
- Installed @picovoice/web-voice-processor `dist/types/types.d.ts` documents its
  input `deviceId` option (separate from output routing).

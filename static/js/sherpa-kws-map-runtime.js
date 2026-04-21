/**
 * Sherpa-ONNX KWS in the main PWA (always-on when enabled in Settings).
 * Loads WASM + spike glue lazily; mic capture without routing to speakers (no feedback).
 * SPDX snippets: Apache-2.0 sherpa-onnx / Voyagr glue.
 */
(function (global) {
    'use strict';

    var WASM_MAIN = '/static/vendor/sherpa-kws/wasm/sherpa-onnx-wasm-kws-main.js';
    var SPIKE_GLUE = '/static/js/sherpa-onnx-kws-spike.js';
    var KEYWORDS_URL = '/static/vendor/sherpa-kws/spike-config/keywords-hey-sat-nav.txt';

    var _loadPromise = null;
    var _rawUserMediaStream = null;
    var _recognizer = null;
    var _recognizerStream = null;
    var _listening = false;
    var _audioCtx = null;
    var _mediaStream = null;
    var _recorder = null;
    var _recordSampleRate = 16000;
    var _expectedSampleRate = 16000;
    var _onKeyword = null;

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src;
            s.async = false;
            s.onload = function () {
                resolve();
            };
            s.onerror = function () {
                reject(new Error('Failed to load ' + src));
            };
            document.head.appendChild(s);
        });
    }

    function downsampleBuffer(buffer, exportSampleRate) {
        if (exportSampleRate === _recordSampleRate) {
            return buffer;
        }
        var sampleRateRatio = _recordSampleRate / exportSampleRate;
        var newLength = Math.round(buffer.length / sampleRateRatio);
        var result = new Float32Array(newLength);
        var offsetResult = 0;
        var offsetBuffer = 0;
        while (offsetResult < result.length) {
            var nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
            var accum = 0;
            var count = 0;
            for (var i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
                accum += buffer[i];
                count++;
            }
            result[offsetResult] = count ? accum / count : 0;
            offsetResult++;
            offsetBuffer = nextOffsetBuffer;
        }
        return result;
    }

    function ensureSherpaScriptsAndWasm() {
        if (_recognizer) {
            return Promise.resolve();
        }
        if (_loadPromise) {
            return _loadPromise;
        }
        _loadPromise = new Promise(function (resolve, reject) {
            var timeout = setTimeout(function () {
                reject(new Error('Sherpa WASM init timed out (check static/vendor/sherpa-kws/wasm/)'));
            }, 120000);

            function doneOk() {
                clearTimeout(timeout);
                resolve();
            }

            function doneErr(e) {
                clearTimeout(timeout);
                reject(e);
            }

            loadScript(SPIKE_GLUE)
                .then(function () {
                    if (typeof createKws !== 'function') {
                        throw new Error('sherpa-onnx-kws-spike.js did not expose createKws');
                    }
                    global.Module = global.Module || {};
                    global.Module.locateFile = function (path) {
                        return '/static/vendor/sherpa-kws/wasm/' + path;
                    };
                    global.Module.onRuntimeInitialized = function () {
                        fetch(KEYWORDS_URL)
                            .then(function (r) {
                                if (!r.ok) {
                                    throw new Error('Missing ' + KEYWORDS_URL + ' (HTTP ' + r.status + ')');
                                }
                                return r.text();
                            })
                            .then(function (keywordsText) {
                                var myConfig = {
                                    featConfig: { samplingRate: 16000, featureDim: 80 },
                                    modelConfig: {
                                        transducer: {
                                            encoder: './encoder-epoch-12-avg-2-chunk-16-left-64.onnx',
                                            decoder: './decoder-epoch-12-avg-2-chunk-16-left-64.onnx',
                                            joiner: './joiner-epoch-12-avg-2-chunk-16-left-64.onnx',
                                        },
                                        tokens: './tokens.txt',
                                        provider: 'cpu',
                                        modelType: '',
                                        numThreads: 1,
                                        debug: 0,
                                        modelingUnit: 'phone+ppinyin',
                                        bpeVocab: '',
                                    },
                                    maxActivePaths: 4,
                                    numTrailingBlanks: 1,
                                    keywordsScore: 1.0,
                                    keywordsThreshold: 0.28,
                                    keywords: keywordsText.trim(),
                                };
                                _recognizer = createKws(global.Module, myConfig);
                                doneOk();
                            })
                            .catch(doneErr);
                    };

                    return loadScript(WASM_MAIN);
                })
                .catch(function (e) {
                    _loadPromise = null;
                    doneErr(e);
                });
        });
        return _loadPromise;
    }

    function onAudioProcess(e) {
        if (!_listening || !_recognizer || !_onKeyword) {
            return;
        }
        var samples = new Float32Array(e.inputBuffer.getChannelData(0));
        samples = downsampleBuffer(samples, _expectedSampleRate);

        if (_recognizerStream === null) {
            _recognizerStream = _recognizer.createStream();
        }

        _recognizerStream.acceptWaveform(_expectedSampleRate, samples);
        while (_recognizer.isReady(_recognizerStream)) {
            _recognizer.decode(_recognizerStream);
            var result = _recognizer.getResult(_recognizerStream);
            var kw = result && result.keyword != null ? String(result.keyword) : '';
            if (kw.length > 0) {
                _recognizer.reset(_recognizerStream);
                try {
                    _onKeyword(result);
                } catch (err) {
                    console.error('[Sherpa map]', err);
                }
            }
        }
    }

    global.VoyagrSherpaKwsMap = {
        isListening: function () {
            return _listening;
        },

        ensureLoaded: function () {
            return ensureSherpaScriptsAndWasm();
        },

        /**
         * @param {function(object): void} onKeyword — called when a keyword is spotted
         */
        start: function (onKeyword) {
            var self = this;
            if (_listening) {
                return Promise.resolve();
            }
            _onKeyword = onKeyword;
            return ensureSherpaScriptsAndWasm().then(function () {
                if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    return Promise.reject(new Error('Microphone not available'));
                }
                var constraints = { audio: true };
                return navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
                    _rawUserMediaStream = stream;
                    if (!_audioCtx) {
                        _audioCtx = new (global.AudioContext || global.webkitAudioContext)({ sampleRate: 16000 });
                    }
                    _recordSampleRate = _audioCtx.sampleRate;
                    _mediaStream = _audioCtx.createMediaStreamSource(stream);
                    var bufferSize = 4096;
                    var recorder = _audioCtx.createScriptProcessor(bufferSize, 1, 1);
                    _recorder = recorder;
                    recorder.onaudioprocess = onAudioProcess;
                    _mediaStream.connect(recorder);
                    var silent = _audioCtx.createGain();
                    silent.gain.value = 0;
                    recorder.connect(silent);
                    silent.connect(_audioCtx.destination);
                    _listening = true;
                    console.log('[Sherpa map] listening (sampleRate=' + _recordSampleRate + ')');
                });
            });
        },

        stop: function () {
            _listening = false;
            _onKeyword = null;
            _recognizerStream = null;
            try {
                if (_recorder) {
                    _recorder.disconnect();
                    _recorder.onaudioprocess = null;
                }
            } catch (e) {
                /* ignore */
            }
            _recorder = null;
            try {
                if (_mediaStream) {
                    _mediaStream.disconnect();
                }
            } catch (e2) {
                /* ignore */
            }
            _mediaStream = null;
            if (_rawUserMediaStream) {
                try {
                    _rawUserMediaStream.getTracks().forEach(function (t) {
                        t.stop();
                    });
                } catch (e4) {
                    /* ignore */
                }
                _rawUserMediaStream = null;
            }
            if (_audioCtx) {
                try {
                    _audioCtx.close();
                } catch (e3) {
                    /* ignore */
                }
                _audioCtx = null;
            }
            console.log('[Sherpa map] stopped');
        },
    };
})(typeof window !== 'undefined' ? window : this);

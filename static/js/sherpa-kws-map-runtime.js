/**
 * Sherpa-ONNX KWS in the main PWA (always-on when enabled in Settings).
 * Loads WASM + spike glue lazily; mic capture without routing to speakers (no feedback).
 * SPDX snippets: Apache-2.0 sherpa-onnx / Voyagr glue.
 */
(function (global) {
    'use strict';

    var WASM_DIR = '/static/vendor/sherpa-kws/wasm/';
    var WASM_MAIN = WASM_DIR + 'sherpa-onnx-wasm-kws-main.js';
    // IMPORTANT: the JS glue that calls into the WASM must be the copy that
    // was built *alongside* the .wasm / .data bundle — its struct marshalling
    // offsets only match that exact upstream commit. A drift between our
    // bundled static/js/sherpa-onnx-kws-spike.js and the vendor bundle here
    // silently corrupts config fields (e.g. modelingUnit) and causes opaque
    // integer-pointer exceptions out of SherpaOnnxCreateKeywordSpotter.
    var SPIKE_GLUE = WASM_DIR + 'sherpa-onnx-kws.js';
    var KEYWORDS_URL = '/static/vendor/sherpa-kws/spike-config/keywords-hey-sat-nav.txt';
    // Files referenced by the hardcoded model config in sherpa-onnx-kws-spike.js/createKws.
    // Emscripten's virtual FS loads these via HTTP from WASM_DIR on startup; if any are
    // 404 the native _SherpaOnnxCreateKeywordSpotter() call throws an *integer pointer*
    // exception that shows as "[Sherpa map] <number>" and is effectively useless.
    // We HEAD-probe them up front so the user sees a clear message instead.
    // Files we expect to be HTTP-reachable under WASM_DIR. The onnx transducer
    // weights are intentionally *not* listed here because the upstream WASM build
    // bakes them into sherpa-onnx-wasm-kws-main.data via Emscripten --preload-file,
    // served from a virtual FS rather than over HTTP. Including them would cause
    // false 404s on setups where .data is the source of truth.
    var REQUIRED_MODEL_FILES = [
        'tokens.txt',
    ];

    /**
     * Turn any thrown value into a useful human-readable message. Emscripten C++
     * exceptions arrive as raw integer pointers into the WASM heap; when the
     * module was compiled with exception helpers we can decode them, otherwise
     * we at least surface the pointer so the issue is visible.
     */
    function formatSherpaError(e) {
        if (e && typeof e === 'object' && typeof e.message === 'string') {
            return e.message;
        }
        if (typeof e === 'number') {
            var decoded = null;
            var mod = global.Module;
            // Strategy 1: modern Emscripten helper — returns [typeName, message].
            if (!decoded && mod && typeof mod.getExceptionMessage === 'function') {
                try {
                    var pair = mod.getExceptionMessage(e);
                    if (Array.isArray(pair)) {
                        decoded = pair.filter(Boolean).join(': ');
                    } else if (pair) {
                        decoded = String(pair);
                    }
                } catch (_e1) { /* swallow */ }
            }
            // Strategy 2: older Emscripten — ExceptionInfo class with get_what().
            if (!decoded && mod && typeof mod.ExceptionInfo === 'function') {
                try {
                    var info = new mod.ExceptionInfo(e);
                    var what = info.get_what && info.get_what();
                    if (what) {
                        decoded = String(what);
                    }
                } catch (_e2) { /* swallow */ }
            }
            // Strategy 3: last-ditch — poke the WASM heap. libc++ lays a
            // std::runtime_error out with a pointer to a what-string either at
            // offset 0 (small-string case) or dereferenced once (heap-backed).
            // Gate on "looks like a real message" (length + printable ratio) so
            // we don't surface garbage single bytes as if they were errors.
            function looksLikeMessage(s) {
                if (!s || s.length < 8 || s.length > 4096) return false;
                var printable = 0;
                for (var i = 0; i < s.length; i++) {
                    var c = s.charCodeAt(i);
                    if ((c >= 0x20 && c < 0x7f) || c === 0x0a || c === 0x09) {
                        printable++;
                    }
                }
                return printable / s.length > 0.9;
            }
            if (!decoded && mod && mod.HEAPU32 && typeof mod.UTF8ToString === 'function') {
                try {
                    var probe = mod.UTF8ToString(e);
                    if (looksLikeMessage(probe)) {
                        decoded = probe;
                    }
                } catch (_e3) { /* swallow */ }
                if (!decoded) {
                    try {
                        var indirect = mod.HEAPU32[e >> 2];
                        if (indirect) {
                            var probe2 = mod.UTF8ToString(indirect);
                            if (looksLikeMessage(probe2)) {
                                decoded = probe2;
                            }
                        }
                    } catch (_e4) { /* swallow */ }
                }
            }
            if (decoded) {
                return 'Sherpa C++ exception: ' + decoded + ' (ptr=' + e + ')';
            }
            return 'Sherpa WASM threw opaque exception (ptr=' + e + '). ' +
                'Likely cause: model files missing or incompatible under ' + WASM_DIR;
        }
        try {
            return String(e);
        } catch (err) {
            return '(unserialisable error)';
        }
    }
    global.VoyagrSherpaFormatError = formatSherpaError;

    /**
     * Recursively walk the Emscripten virtual FS and return every file found
     * with its absolute path and size. Standard Emscripten pseudo-dirs
     * (/tmp, /home, /dev, /proc) are skipped so the signal is the
     * preloaded model bundle. Depth-limited to avoid runaway on pathological
     * layouts. Purely diagnostic — safe after onRuntimeInitialized.
     */
    function dumpSherpaFs() {
        var result = [];
        var FS = global.Module && global.Module.FS;
        if (!FS || typeof FS.readdir !== 'function' || typeof FS.stat !== 'function') {
            return result;
        }
        var SKIP = { '.': 1, '..': 1, 'tmp': 1, 'home': 1, 'dev': 1, 'proc': 1 };
        function walk(absPath, depth) {
            if (depth > 4) return;
            var names;
            try { names = FS.readdir(absPath); } catch (_e) { return; }
            for (var i = 0; i < names.length; i++) {
                var n = names[i];
                if (SKIP[n]) continue;
                var child = (absPath === '/' ? '/' : absPath + '/') + n;
                var st;
                try { st = FS.stat(child); } catch (_e) { continue; }
                var isDir = (typeof FS.isDir === 'function') ? FS.isDir(st.mode) : (st.mode & 0o040000) !== 0;
                if (isDir) {
                    result.push({ path: child + '/', size: 0 });
                    walk(child, depth + 1);
                } else {
                    result.push({ path: child, size: st.size });
                }
            }
        }
        try { walk('/', 0); } catch (_e) { /* swallow */ }
        return result;
    }
    global.VoyagrSherpaDumpFs = dumpSherpaFs;

    /**
     * Right before calling createKws, resolve the exact paths we intend to
     * hand to the C++ side (both CWD-relative and absolute root-rooted) and
     * log whether each actually exists in the virtual FS + its byte size.
     * If any file is missing this is *the* explanation for ptr exceptions
     * coming out of SherpaOnnxCreateKeywordSpotter.
     */
    function probeSherpaAssets(config) {
        var FS = global.Module && global.Module.FS;
        if (!FS || typeof FS.stat !== 'function') {
            console.warn('[Sherpa map] FS not available — cannot probe asset paths.');
            return;
        }
        var cwd = 'unknown';
        try { cwd = FS.cwd && FS.cwd(); } catch (_e) { /* ignore */ }
        console.log('[Sherpa map] Emscripten FS cwd:', cwd);
        var candidates = [];
        try {
            var t = config.modelConfig.transducer;
            candidates.push(t.encoder);
            candidates.push(t.decoder);
            candidates.push(t.joiner);
            candidates.push(config.modelConfig.tokens);
        } catch (_e) { /* ignore */ }
        for (var i = 0; i < candidates.length; i++) {
            var rel = candidates[i];
            if (!rel) continue;
            var bare = rel.replace(/^\.\//, '');
            var tryPaths = [rel, bare, '/' + bare, (cwd || '/') + (bare[0] === '/' ? bare.slice(1) : bare)];
            var hits = [];
            for (var j = 0; j < tryPaths.length; j++) {
                var p = tryPaths[j];
                try {
                    var st = FS.stat(p);
                    hits.push({ path: p, size: st.size });
                } catch (_e) { /* miss */ }
            }
            if (hits.length) {
                console.log('[Sherpa map] Asset found:', rel, '→', hits);
            } else {
                console.warn('[Sherpa map] Asset MISSING in virtual FS:', rel,
                    '(tried:', tryPaths.join(', '), ')');
            }
        }
    }
    global.VoyagrSherpaProbeAssets = probeSherpaAssets;

    /**
     * Probe that every required asset is reachable before we hand control to the
     * WASM runtime. Returns a resolved promise on success, or rejects with a
     * descriptive Error listing the missing/unreachable URLs.
     */
    function preflightAssets() {
        if (typeof fetch !== 'function') {
            return Promise.resolve();
        }
        var targets = [WASM_MAIN, KEYWORDS_URL].concat(REQUIRED_MODEL_FILES.map(function (f) {
            return WASM_DIR + f;
        }));
        return Promise.all(targets.map(function (url) {
            return fetch(url, { method: 'HEAD', cache: 'no-store' })
                .then(function (r) { return { url: url, ok: r.ok, status: r.status }; })
                .catch(function (e) { return { url: url, ok: false, status: 0, err: String(e) }; });
        })).then(function (results) {
            var missing = results.filter(function (r) { return !r.ok; });
            if (missing.length) {
                var details = missing.map(function (r) {
                    return r.url + ' (HTTP ' + r.status + (r.err ? ', ' + r.err : '') + ')';
                }).join(', ');
                throw new Error('Sherpa assets unavailable: ' + details);
            }
        });
    }

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
                reject(new Error('Sherpa WASM init timed out (check ' + WASM_DIR + ')'));
            }, 120000);

            function doneOk() {
                clearTimeout(timeout);
                resolve();
            }

            function doneErr(e) {
                clearTimeout(timeout);
                reject(e);
            }

            preflightAssets()
                .then(function () {
                    return loadScript(SPIKE_GLUE);
                })
                .then(function () {
                    if (typeof createKws !== 'function') {
                        throw new Error('sherpa-onnx-kws-spike.js did not expose createKws');
                    }
                    global.Module = global.Module || {};
                    global.Module.locateFile = function (path) {
                        return WASM_DIR + path;
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
                                // Filenames below must match the names baked into
                                // sherpa-onnx-wasm-kws-main.data (the Emscripten --preload-file
                                // manifest from upstream wasm/kws/CMakeLists.txt). The stock
                                // build uses epoch-12 names regardless of the underlying model
                                // checkpoint, so we keep epoch-12 here and stage the zh-en-3M
                                // bundle files under those names when preparing assets.
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
                                        // debug=1 makes sherpa-onnx's C++ side print the
                                        // underlying failure reason to stderr (visible in
                                        // console as `sherpa-onnx-wasm-kws-main.js:1 …`)
                                        // instead of only raising an opaque WASM pointer.
                                        // Negligible runtime cost — a few extra log lines
                                        // during init, none during the hot audio loop.
                                        debug: 1,
                                        modelingUnit: 'phone+ppinyin',
                                        bpeVocab: '',
                                    },
                                    maxActivePaths: 4,
                                    numTrailingBlanks: 1,
                                    keywordsScore: 1.0,
                                    keywordsThreshold: 0.28,
                                    keywords: keywordsText.trim(),
                                };
                                try {
                                    var FSavail = !!(global.Module && global.Module.FS
                                        && typeof global.Module.FS.readdir === 'function');
                                    if (FSavail) {
                                        var fsSnapshot = dumpSherpaFs();
                                        if (fsSnapshot.length) {
                                            console.log('[Sherpa map] Virtual FS contents (' +
                                                fsSnapshot.length + ' entries):', fsSnapshot);
                                        } else {
                                            console.warn('[Sherpa map] Virtual FS appears empty — .data may not have preloaded.');
                                        }
                                        probeSherpaAssets(myConfig);
                                    } else {
                                        // Most upstream sherpa-onnx WASM builds don't include
                                        // FORCE_FILESYSTEM / don't export FS to JS. That's fine —
                                        // the C++ side still has the preload-file virtual FS,
                                        // we just can't introspect it from JS. Log once so the
                                        // absence of asset probes isn't confusing.
                                        console.log('[Sherpa map] Module.FS not exported — skipping JS-side FS probe (C++ side still has preloaded files).');
                                    }
                                } catch (_fsErr) { /* never let diagnostics break init */ }
                                try {
                                    _recognizer = createKws(global.Module, myConfig);
                                } catch (rawErr) {
                                    // Emscripten rethrows integer pointers here — decode them before surfacing.
                                    var msg = formatSherpaError(rawErr);
                                    throw new Error(msg);
                                }
                                // The C API logs "Errors in config!" and returns NULL on bad
                                // config instead of throwing. A zero handle means the recogniser
                                // is unusable — the pipeline would "start listening" but never
                                // detect anything. Catch this here so we surface a clear error
                                // instead of silently sitting on a dead recogniser.
                                if (!_recognizer || !_recognizer.handle) {
                                    _recognizer = null;
                                    throw new Error(
                                        'Sherpa KWS failed to initialise: the virtual FS inside ' +
                                        'sherpa-onnx-wasm-kws-main.data does not contain the ' +
                                        'encoder/decoder/joiner filenames we asked for. Check the ' +
                                        '"transducer ... does not exist" line logged by ' +
                                        'sherpa-onnx-wasm-kws-main.js just before this error.'
                                    );
                                }
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
                // Explicit diagnostic log — makes it trivial to confirm Sherpa
                // actually spotted the wake phrase (vs. the recogniser silently
                // running with a dead handle). Safe to leave on: one line per
                // detection, no behavioural impact.
                console.log('[Sherpa map] keyword detected:', kw, result);
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

/**
 * Copy Picovoice browser IIFE bundles into static/vendor/picovoice and fetch the
 * English Porcupine parameter model (.pv). Run via: npm run picovoice:sync
 * (also wired to postinstall).
 *
 * Custom wake keyword (.ppn from Picovoice Console, WASM target):
 *   Windows PowerShell:
 *     $env:PICOVOICE_CUSTOM_KEYWORD_SRC="C:\Users\YOU\Downloads\Hey-Satnav_en_wasm_v4_0_0_extracted"
 *     npm run picovoice:sync
 *   Or point at the .ppn file directly. Optional: PICOVOICE_CUSTOM_KEYWORD_OUT_NAME (default hey_satnav_wasm.ppn).
 *
 *   bash (use your real path — not /path/to/...):
 *     export PICOVOICE_CUSTOM_KEYWORD_SRC=/root/Hey-Satnav_en_wasm_v4_0_0_extracted
 *     npm run picovoice:sync
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'static', 'vendor', 'picovoice');
const PV_URL =
    'https://raw.githubusercontent.com/Picovoice/porcupine/master/lib/common/porcupine_params.pv';

/** Collect every .ppn under dir (recursive). */
function collectPpnFiles(dir, acc = []) {
    if (!fs.existsSync(dir)) return acc;
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_e) {
        return acc;
    }
    for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            collectPpnFiles(full, acc);
        } else if (ent.name.toLowerCase().endsWith('.ppn')) {
            acc.push(full);
        }
    }
    return acc;
}

/**
 * Resolve env PICOVOICE_CUSTOM_KEYWORD_SRC to a single .ppn path.
 * Prefers filenames containing "_wasm" when multiple exist.
 */
function resolveCustomKeywordPpn() {
    const raw = (process.env.PICOVOICE_CUSTOM_KEYWORD_SRC || '').trim();
    if (!raw) return null;

    const srcAbs = path.isAbsolute(raw) ? path.normalize(raw) : path.join(ROOT, raw);

    if (!fs.existsSync(srcAbs)) {
        console.warn('[picovoice:sync] PICOVOICE_CUSTOM_KEYWORD_SRC not found:', srcAbs);
        return null;
    }

    const st = fs.statSync(srcAbs);
    if (st.isFile()) {
        if (!srcAbs.toLowerCase().endsWith('.ppn')) {
            console.warn('[picovoice:sync] Expected a .ppn file:', srcAbs);
            return null;
        }
        return srcAbs;
    }

    if (!st.isDirectory()) {
        console.warn('[picovoice:sync] Not a file or directory:', srcAbs);
        return null;
    }

    const list = collectPpnFiles(srcAbs);
    if (list.length === 0) {
        console.warn('[picovoice:sync] No .ppn files under', srcAbs);
        return null;
    }

    const wasmPreferred = list.filter((p) => path.basename(p).toLowerCase().includes('_wasm'));
    const pool = wasmPreferred.length > 0 ? wasmPreferred : list;
    pool.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    const picked = pool[0];
    if (list.length > 1) {
        console.log('[picovoice:sync] Multiple .ppn files; using:', path.basename(picked));
    }
    return picked;
}

function copyCustomWakeKeyword() {
    const raw = (process.env.PICOVOICE_CUSTOM_KEYWORD_SRC || '').trim();
    if (!raw) return;

    const ppnSrc = resolveCustomKeywordPpn();
    if (!ppnSrc) {
        console.warn(
            '[picovoice:sync] Custom keyword was NOT copied. Fix PICOVOICE_CUSTOM_KEYWORD_SRC — use the real absolute path ' +
                'to your Picovoice WASM .ppn file or extracted folder (do not use placeholder paths like /path/to/...). ' +
                `Got: ${raw}`
        );
        return;
    }

    const outNameRaw = (process.env.PICOVOICE_CUSTOM_KEYWORD_OUT_NAME || 'hey_satnav_wasm.ppn').trim();
    const base = path.basename(outNameRaw);
    const outName = base.toLowerCase().endsWith('.ppn') ? base : `${base}.ppn`;

    fs.mkdirSync(OUT, { recursive: true });
    const dest = path.join(OUT, outName);

    try {
        fs.copyFileSync(ppnSrc, dest);
        const sz = fs.statSync(dest).size;
        if (sz < 64) {
            console.warn('[picovoice:sync] Copied keyword looks too small (%s bytes): %s', sz, dest);
        } else {
            console.log('[picovoice:sync] Copied custom keyword (%s bytes) → %s', sz, dest);
        }
    } catch (e) {
        console.warn('[picovoice:sync] Could not copy custom keyword:', e.message);
    }
}

function copyIfExists(src, dest) {
    if (!fs.existsSync(src)) {
        console.warn('[picovoice:sync] Missing source (npm install first?):', src);
        return false;
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.copyFileSync(src, dest);
    return true;
}

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https
            .get(url, (res) => {
                if (res.statusCode !== 200) {
                    file.close();
                    fs.unlink(dest, () => {});
                    reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                    return;
                }
                res.pipe(file);
                file.on('finish', () => file.close(resolve));
            })
            .on('error', (err) => {
                file.close();
                fs.unlink(dest, () => {});
                reject(err);
            });
    });
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    copyCustomWakeKeyword();
    const ok1 = copyIfExists(
        path.join(ROOT, 'node_modules', '@picovoice', 'porcupine-web', 'dist', 'iife', 'index.js'),
        path.join(OUT, 'porcupine-web.iife.js')
    );
    const ok2 = copyIfExists(
        path.join(ROOT, 'node_modules', '@picovoice', 'web-voice-processor', 'dist', 'iife', 'index.js'),
        path.join(OUT, 'web-voice-processor.iife.js')
    );
    const pvOut = path.join(OUT, 'porcupine_params.pv');
    try {
        if (!fs.existsSync(pvOut) || fs.statSync(pvOut).size < 10000) {
            console.log('[picovoice:sync] Downloading porcupine_params.pv …');
            await download(PV_URL, pvOut);
        } else {
            console.log('[picovoice:sync] porcupine_params.pv already present, skip download');
        }
    } catch (e) {
        console.warn('[picovoice:sync] Could not download porcupine_params.pv:', e.message);
    }
    if (ok1 && ok2) {
        console.log('[picovoice:sync] Picovoice web bundles copied to', OUT);
    }
}

main().catch((e) => {
    console.warn('[picovoice:sync] Failed:', e.message);
    process.exitCode = 0;
});

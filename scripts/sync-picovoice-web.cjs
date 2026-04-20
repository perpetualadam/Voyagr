/**
 * Copy Picovoice browser IIFE bundles into static/vendor/picovoice and fetch the
 * English Porcupine parameter model (.pv). Run via: npm run picovoice:sync
 * (also wired to postinstall).
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'static', 'vendor', 'picovoice');
const PV_URL =
    'https://raw.githubusercontent.com/Picovoice/porcupine/master/lib/common/porcupine_params.pv';

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

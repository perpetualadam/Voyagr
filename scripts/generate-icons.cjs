/* eslint-disable no-console */
/**
 * Rasterizes the SVG app icon into the PNG sizes required by the PWA manifest,
 * the shortcut icons, and the Android TWA bundle.
 *
 * Usage: node scripts/generate-icons.cjs
 */
const fs = require('fs');
const path = require('path');

const { Resvg } = require('@resvg/resvg-js');

const ROOT = path.resolve(__dirname, '..');
const ICON_DIR = path.join(ROOT, 'static', 'images', 'icons');
const ICON_SVG = path.join(ICON_DIR, 'icon.svg');
const ICON_MASKABLE_SVG = path.join(ICON_DIR, 'icon-maskable.svg');

const SIZES = [48, 72, 96, 128, 192, 512];

function rasterize(svgPath, outPath, size) {
    const svg = fs.readFileSync(svgPath, 'utf8');
    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: size },
        font: { loadSystemFonts: true },
    });
    const png = resvg.render().asPng();
    fs.writeFileSync(outPath, png);
    console.log(`wrote ${path.relative(ROOT, outPath)} (${size}x${size}, ${png.length} bytes)`);
}

function main() {
    if (!fs.existsSync(ICON_SVG)) {
        throw new Error(`Missing ${ICON_SVG}`);
    }
    if (!fs.existsSync(ICON_MASKABLE_SVG)) {
        throw new Error(`Missing ${ICON_MASKABLE_SVG}`);
    }

    for (const size of SIZES) {
        rasterize(ICON_SVG, path.join(ICON_DIR, `icon-${size}.png`), size);
    }
    rasterize(ICON_MASKABLE_SVG, path.join(ICON_DIR, 'icon-512-maskable.png'), 512);

    // Shortcut icons reuse the main artwork at 96px (manifest shortcut size).
    const shortcuts = ['shortcut-route.png', 'shortcut-history.png', 'shortcut-voice.png'];
    for (const name of shortcuts) {
        rasterize(ICON_SVG, path.join(ICON_DIR, name), 96);
    }

    // Favicon-style files for completeness (some tools look for these paths).
    rasterize(ICON_SVG, path.join(ICON_DIR, 'favicon-32.png'), 32);
    rasterize(ICON_SVG, path.join(ICON_DIR, 'favicon-16.png'), 16);
}

main();

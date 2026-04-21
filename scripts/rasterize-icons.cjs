/* Rasterize the master SVG icons into PWA PNG sizes.
 *
 * Usage: node scripts/rasterize-icons.cjs
 *
 * Reads:
 *   static/images/icons/icon.svg          (standard icon, used for any-purpose)
 *   static/images/icons/icon-maskable.svg (safe-zone variant for maskable)
 *
 * Writes: static/images/icons/icon-{48,72,96,128,192,512}.png
 *         static/images/icons/icon-512-maskable.png
 */
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const ICON_DIR = path.join(__dirname, '..', 'static', 'images', 'icons');
const SVG_ANY = fs.readFileSync(path.join(ICON_DIR, 'icon.svg'));
const SVG_MASK = fs.readFileSync(path.join(ICON_DIR, 'icon-maskable.svg'));

const ANY_SIZES = [48, 72, 96, 128, 192, 512];

function render(svgBuf, size) {
  const resvg = new Resvg(svgBuf, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
  });
  return resvg.render().asPng();
}

for (const size of ANY_SIZES) {
  const out = path.join(ICON_DIR, `icon-${size}.png`);
  fs.writeFileSync(out, render(SVG_ANY, size));
  console.log('wrote', out);
}

const maskOut = path.join(ICON_DIR, 'icon-512-maskable.png');
fs.writeFileSync(maskOut, render(SVG_MASK, 512));
console.log('wrote', maskOut);

console.log('done.');

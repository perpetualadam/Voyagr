/**
 * @file Google Encoded Polyline Algorithm — encode/decode (no DOM, no network).
 * @module modules/navigation/polyline-codec
 *
 * These are the polyline encode/decode functions previously inline in voyagr-app.js.
 * Extracted here so they can be unit-tested and shared. Precision 6 is Valhalla;
 * precision 5 is OSRM / GraphHopper.
 */
(function (root) {
    'use strict';

    /**
     * Decode an encoded polyline string to an array of [lat, lon] pairs.
     * @param {string} encoded
     * @param {number} [precision=6]
     * @returns {Array<[number, number]>}
     */
    function decodePolyline(encoded, precision) {
        precision = (precision == null) ? 6 : precision;
        if (!encoded || typeof encoded !== 'string') return [];
        var inv = 1.0 / Math.pow(10, precision);
        var decoded = [];
        var previous = [0, 0];
        var i = 0;
        try {
            while (i < encoded.length) {
                var ll = [0, 0];
                for (var j = 0; j < 2; j++) {
                    var shift = 0, result = 0, byte_;
                    do {
                        byte_ = encoded.charCodeAt(i++) - 63;
                        result |= (byte_ & 0x1f) << shift;
                        shift += 5;
                    } while (byte_ >= 0x20);
                    ll[j] = previous[j] + (result & 1 ? ~(result >> 1) : result >> 1);
                    previous[j] = ll[j];
                }
                decoded.push([ll[0] * inv, ll[1] * inv]);
            }
            return decoded;
        } catch (_) {
            return [];
        }
    }

    /**
     * Encode [lat, lon] vertex pairs to an encoded polyline string.
     * @param {Array<[number, number]>} points
     * @param {number} [precision=6]
     * @returns {string}
     */
    function encodePolyline(points, precision) {
        precision = (precision == null) ? 6 : precision;
        if (!Array.isArray(points) || points.length === 0) return '';
        var factor = Math.pow(10, precision);
        var prevLatR = 0, prevLonR = 0;
        var result = '';

        function chunk(delta) {
            var n = Math.round(delta);
            var u = ((n << 1) ^ (n >> 31)) >>> 0;
            while (u >= 0x20) {
                result += String.fromCharCode((0x20 | (u & 0x1f)) + 63);
                u >>>= 5;
            }
            result += String.fromCharCode((u >>> 0) + 63);
        }

        for (var p = 0; p < points.length; p++) {
            var pt = points[p];
            if (!pt || pt.length < 2) continue;
            var latR = Math.round(pt[0] * factor);
            var lonR = Math.round(pt[1] * factor);
            chunk(latR - prevLatR);
            chunk(lonR - prevLonR);
            prevLatR = latR;
            prevLonR = lonR;
        }
        return result;
    }

    var api = { decodePolyline: decodePolyline, encodePolyline: encodePolyline };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.VoyagrPolylineCodec = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

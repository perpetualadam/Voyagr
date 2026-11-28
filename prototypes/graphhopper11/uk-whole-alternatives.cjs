'use strict';
// Whole registered journeys, never independently spliced leg alternatives.
process.env.GH11_BROWSER_WHOLE='1';
process.env.GH11_BROWSER_MIXED='1';
require('./uk-stop-preview.cjs');

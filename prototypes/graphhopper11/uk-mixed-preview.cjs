'use strict';
// Reuse the real full-page stop scenario with the separate mixed-visit registry.
process.env.GH11_BROWSER_MIXED='1';
require('./uk-stop-preview.cjs');

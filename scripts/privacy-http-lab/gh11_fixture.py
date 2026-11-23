"""Test-only preview assets; never imported by the production entry point."""
from pathlib import Path
from flask import Response, abort

PROTOTYPE_FILES = ('isolated_viewer.html', 'isolated_viewer.js', 'saved_plans.js',
                   'journey_evidence.js', 'host_journey_adapter.js', 'uk_host_boot.js')


def register_gh11_fixture(app, root):
    root = Path(root)
    assets = {
        'isolated_viewer.js': 'prototypes/graphhopper11/isolated_viewer.js',
        'gh11-saved-plans.js': 'prototypes/graphhopper11/saved_plans.js',
        'gh11-journey-evidence.js': 'prototypes/graphhopper11/journey_evidence.js',
        'gh11-host-journey.js': 'prototypes/graphhopper11/host_journey_adapter.js',
        'gh11-uk-host-boot.js': 'prototypes/graphhopper11/uk_host_boot.js',
        'local-store.js': 'static/js/modules/privacy/local-store.js',
        'speed-gps.js': 'static/js/modules/navigation/speed-gps.js',
        'polyline-codec.js': 'static/js/modules/navigation/polyline-codec.js',
        'strict-route-policy.js': 'static/js/modules/navigation/strict-route-policy.js',
        'avoidance-integrity.js': 'static/js/modules/navigation/avoidance-integrity.js',
        'navigation-safety-ux.js': 'static/js/app/navigation-safety-ux.js',
    }

    @app.get('/__lab__/gh11-preview')
    def gh11_preview():
        html = (root / 'prototypes/graphhopper11/isolated_viewer.html').read_text()
        html = html.replace('/strict-assets/', '/__lab__/gh11-assets/').replace(
            '/prototype-viewer.js', '/__lab__/gh11-assets/isolated_viewer.js')
        return Response(html, mimetype='text/html', headers={'Cache-Control': 'no-store'})

    @app.get('/__lab__/gh11-assets/<name>')
    def gh11_asset(name):
        if name not in assets:
            abort(404)
        return Response((root / assets[name]).read_bytes(), mimetype='application/javascript',
                        headers={'Cache-Control': 'no-store'})

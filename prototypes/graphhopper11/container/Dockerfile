FROM eclipse-temurin@sha256:7a0b2bc7e1372bb05ee361fb79e8a9e822df47343b8716253b3bbaa75060653e AS jdk
FROM python@sha256:a83ba18aef0f865b1a4a611c2cf460fe446f2795673bbb9fe43be570439e3b39
COPY --from=jdk /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk PATH=/opt/java/openjdk/bin:$PATH PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY --chmod=0444 prototypes/graphhopper11/container/requirements.lock /app/requirements.lock
COPY --chmod=0555 prototypes/graphhopper11/container/wheels /wheels
RUN python -m pip install --no-index --find-links=/wheels --no-cache-dir --require-hashes -r /app/requirements.lock && java -version
COPY --chmod=0444 voyagr/avoidance_contract.py /app/voyagr/
COPY --chmod=0444 voyagr/services/routing/private_route_cache.py /app/voyagr/services/routing/
COPY --chmod=0444 prototypes/graphhopper11/host_journey_adapter.js prototypes/graphhopper11/journey_evidence.js prototypes/graphhopper11/saved_plans.js prototypes/graphhopper11/private_complete_cache.py prototypes/graphhopper11/app_request_bridge.py prototypes/graphhopper11/app_settings_adapter.py prototypes/graphhopper11/policy_compiler.py prototypes/graphhopper11/isolated_app.py prototypes/graphhopper11/prepare_app_manifest.py prototypes/graphhopper11/ReadOnlyRouteRegression.java prototypes/graphhopper11/isolated_viewer.html prototypes/graphhopper11/isolated_viewer.js /app/prototypes/graphhopper11/
COPY --chmod=0444 prototypes/graphhopper11/container/wsgi.py prototypes/graphhopper11/container/healthcheck.py /app/prototypes/graphhopper11/container/
COPY --chmod=0444 static/js/modules/navigation/speed-gps.js static/js/modules/navigation/polyline-codec.js static/js/modules/navigation/strict-route-policy.js static/js/modules/navigation/avoidance-integrity.js /app/static/js/modules/navigation/
COPY --chmod=0444 static/js/modules/privacy/local-store.js /app/static/js/modules/privacy/
COPY --chmod=0444 static/js/app/navigation-safety-ux.js /app/static/js/app/
RUN chmod 0555 /app/static /app/static/js /app/static/js/modules /app/static/js/modules/privacy /app/static/js/modules/navigation /app/static/js/app
RUN chmod 0555 /app /app/voyagr /app/voyagr/services /app/voyagr/services/routing /app/prototypes /app/prototypes/graphhopper11 /app/prototypes/graphhopper11/container
USER 10001:10001
ENTRYPOINT ["gunicorn", "--workers=1", "--threads=1", "--bind=unix:/run/gh11/service.sock", "--umask=0077", "--timeout=180", "--graceful-timeout=10", "--worker-tmp-dir=/tmp", "--access-logfile=/dev/null", "--error-logfile=-", "prototypes.graphhopper11.container.wsgi:app"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 CMD ["python", "-m", "prototypes.graphhopper11.container.healthcheck"]

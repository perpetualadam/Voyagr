FROM eclipse-temurin@sha256:7a0b2bc7e1372bb05ee361fb79e8a9e822df47343b8716253b3bbaa75060653e AS jdk
FROM python@sha256:a83ba18aef0f865b1a4a611c2cf460fe446f2795673bbb9fe43be570439e3b39
COPY --from=jdk /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk PATH=/opt/java/openjdk/bin:$PATH PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY --chmod=0444 prototypes/graphhopper11/container/requirements.lock /app/requirements.lock
COPY --chmod=0555 prototypes/graphhopper11/container/wheels /wheels
RUN python -m pip install --no-index --find-links=/wheels --no-cache-dir --require-hashes -r /app/requirements.lock && java -version
COPY --chmod=0444 prototypes/graphhopper11/isolated_app.py prototypes/graphhopper11/prepare_app_manifest.py prototypes/graphhopper11/ReadOnlyRouteRegression.java prototypes/graphhopper11/isolated_viewer.html prototypes/graphhopper11/isolated_viewer.js /app/prototypes/graphhopper11/
COPY --chmod=0444 prototypes/graphhopper11/container/wsgi.py prototypes/graphhopper11/container/healthcheck.py /app/prototypes/graphhopper11/container/
RUN chmod 0555 /app /app/prototypes /app/prototypes/graphhopper11 /app/prototypes/graphhopper11/container
USER 10001:10001
ENTRYPOINT ["gunicorn", "--workers=1", "--threads=1", "--bind=unix:/run/gh11/service.sock", "--umask=0077", "--timeout=180", "--graceful-timeout=10", "--worker-tmp-dir=/tmp", "--access-logfile=/dev/null", "--error-logfile=-", "prototypes.graphhopper11.container.wsgi:app"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 CMD ["python", "-m", "prototypes.graphhopper11.container.healthcheck"]

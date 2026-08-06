# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements file first (for better caching)
COPY requirements-web.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements-web.txt

# Copy all application files
COPY . .

# Verify critical files exist
RUN test -f voyagr_web.py || (echo "ERROR: voyagr_web.py not found" && exit 1)

# Picovoice PWA wake-word bundles (from npm run picovoice:sync / postinstall)
RUN test -f static/vendor/picovoice/porcupine-web.iife.js \
    && test -f static/vendor/picovoice/web-voice-processor.iife.js \
    && test -f static/vendor/picovoice/porcupine_params.pv \
    && test -f static/vendor/picovoice/hey_satnav_wasm.ppn \
    || (echo "ERROR: Picovoice vendor assets missing. Run: npm run picovoice:sync" && exit 1)

# Expose port
EXPOSE 5000

# Set environment variables
ENV FLASK_APP=voyagr_web.py
ENV FLASK_ENV=production
ENV PYTHONUNBUFFERED=1

# Run the application
CMD ["python", "voyagr_web.py"]


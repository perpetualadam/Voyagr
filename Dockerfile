# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements file first (for better caching)
COPY requirements-railway.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements-railway.txt

# Copy all application files
COPY . .

# Verify critical files exist
RUN test -f voyagr_web.py || (echo "ERROR: voyagr_web.py not found" && exit 1)

# Expose port
EXPOSE 5000

# Set environment variables
ENV FLASK_APP=voyagr_web.py
ENV FLASK_ENV=production
ENV PYTHONUNBUFFERED=1

# Run the application
CMD ["python", "voyagr_web.py"]


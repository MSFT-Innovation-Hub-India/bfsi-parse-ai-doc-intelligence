#!/bin/bash

# Azure App Service Startup Script for Flask API
# This script is executed when the App Service container starts

set -e  # Exit on error

echo "========================================="
echo "Starting Parse-AI Flask API Server..."
echo "========================================="

# Create uploads directory
mkdir -p /home/site/wwwroot/api-server/uploads
mkdir -p /home/site/wwwroot/api-server/uploads/analysis_jobs

# Start Gunicorn using wsgi.py at root
echo "Starting Gunicorn..."
gunicorn --bind=0.0.0.0:${PORT:-8000} \
         --workers=1 \
         --threads=8 \
         --timeout=300 \
         --access-logfile=- \
         --error-logfile=- \
         --log-level=info \
         --capture-output \
         wsgi:app

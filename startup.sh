#!/bin/bash

# Azure App Service Startup Script for Flask API
# This script is executed when the App Service container starts

set -e  # Exit on error

echo "========================================="
echo "Starting Parse-AI Flask API Server..."
echo "========================================="

# Create uploads directory if it doesn't exist
echo "Creating upload directories..."
mkdir -p /home/site/wwwroot/api-server/uploads
mkdir -p /home/site/wwwroot/api-server/uploads/analysis_jobs

# Start Gunicorn with chdir to api-server
echo "Starting Gunicorn..."
gunicorn --bind=0.0.0.0:${PORT:-8000} \
         --workers=2 \
         --threads=4 \
         --timeout=300 \
         --chdir=/home/site/wwwroot/api-server \
         --access-logfile=- \
         --error-logfile=- \
         --log-level=info \
         --capture-output \
         app:app

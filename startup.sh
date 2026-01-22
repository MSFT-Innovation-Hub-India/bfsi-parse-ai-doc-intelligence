#!/bin/bash

# Azure App Service Startup Script for Flask API
# This script is executed when the App Service container starts

set -e  # Exit on error

echo "========================================="
echo "Starting Parse-AI Flask API Server..."
echo "========================================="

# Get the application root directory
APP_ROOT="/home/site/wwwroot"

# Navigate to application root
cd "$APP_ROOT"

echo "Current directory: $(pwd)"
echo "Python version: $(python --version)"

# Install dependencies from root requirements.txt
echo "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Create uploads directory if it doesn't exist
echo "Creating upload directories..."
mkdir -p api-server/uploads
mkdir -p api-server/uploads/analysis_jobs

# Navigate to api-server and start
cd api-server
echo "Starting Gunicorn from: $(pwd)"

# Start the application with Gunicorn
# - Workers: 2-4 workers recommended for App Service
# - Timeout: 300 seconds for long-running AI analysis (increased from 120)
# - Bind to the PORT provided by Azure App Service
gunicorn --bind=0.0.0.0:${PORT:-8000} \
         --workers=2 \
         --threads=4 \
         --timeout=300 \
         --access-logfile=- \
         --error-logfile=- \
         --log-level=info \
         --capture-output \
         app:app

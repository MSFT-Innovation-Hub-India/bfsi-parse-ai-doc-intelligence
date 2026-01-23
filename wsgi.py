# WSGI entry point for Azure App Service
# This file allows Gunicorn to import the Flask app from the root directory

import sys
import os

# Add the api-server directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'api-server'))

# Add the medical-analysis directory to the path (for analysis modules)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'medical-analysis'))

# Add the docufraud directory to the path (for document fraud detection modules)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'docufraud'))

# Import the Flask app
from app import app

# This is what Gunicorn will use
application = app

if __name__ == "__main__":
    app.run()

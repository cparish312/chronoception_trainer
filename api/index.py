import sys
import os

# Add parent directory to path to import app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app

# Vercel serverless function entry point
# Vercel's @vercel/python runtime automatically handles WSGI apps
# We just need to expose the Flask app as the handler
def handler(request):
    """
    Vercel Python runtime handler
    The @vercel/python runtime will automatically handle WSGI conversion
    """
    # Return the Flask app - Vercel's runtime will handle WSGI conversion
    # If request has environ/start_response, use it directly
    if hasattr(request, 'environ') and hasattr(request, 'start_response'):
        return app(request.environ, request.start_response)
    
    # Otherwise, Vercel will handle the conversion automatically
    # We return a callable that Vercel can use
    return app

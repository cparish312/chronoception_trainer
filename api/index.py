"""
Vercel Python Serverless Function Handler for Flask Application

This handler bridges Vercel's serverless function interface with Flask's WSGI interface.
"""
import sys
import os
from io import BytesIO

# Add parent directory to Python path so we can import app.py
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

# Import Flask application
try:
    from app import app
except ImportError as e:
    # This error will appear in Vercel logs
    import traceback
    error_msg = f"""
    CRITICAL: Failed to import Flask app
    
    Error: {str(e)}
    Traceback:
    {traceback.format_exc()}
    
    Python path: {sys.path}
    Parent dir: {parent_dir}
    Current dir: {os.getcwd()}
    Files in parent: {os.listdir(parent_dir) if os.path.exists(parent_dir) else 'N/A'}
    """
    print(error_msg)
    raise

def handler(request):
    """
    Vercel Python runtime handler function.
    
    This function is called by Vercel's @vercel/python runtime for each HTTP request.
    It converts Vercel's request format to WSGI format that Flask expects.
    
    Args:
        request: Vercel request object with attributes:
            - method: HTTP method (str)
            - path: Request path (str)
            - headers: Request headers (dict-like)
            - body: Request body (bytes or str)
            - query_string: Query string (str)
    
    Returns:
        dict: Vercel response format with:
            - statusCode: HTTP status code (int)
            - headers: Response headers (dict)
            - body: Response body (str)
    """
    try:
        # Extract request attributes (Vercel provides these)
        method = getattr(request, 'method', 'GET')
        path = getattr(request, 'path', '/')
        headers = getattr(request, 'headers', {})
        body = getattr(request, 'body', b'')
        query_string = getattr(request, 'query_string', '')
        
        # Normalize headers to dict
        if not isinstance(headers, dict):
            headers = dict(headers) if headers else {}
        
        # Normalize body to bytes
        if isinstance(body, str):
            body = body.encode('utf-8')
        elif body is None:
            body = b''
        
        # Parse Host header for server info
        host = headers.get('Host', 'localhost')
        if ':' in host:
            server_name, server_port = host.split(':', 1)
        else:
            server_name = host
            server_port = '443'  # Vercel uses HTTPS
        
        # Build WSGI environ dictionary (PEP 3333 standard)
        # This is what Flask (a WSGI app) expects
        environ = {
            'REQUEST_METHOD': method,
            'PATH_INFO': path,
            'QUERY_STRING': query_string,
            'CONTENT_TYPE': headers.get('Content-Type', ''),
            'CONTENT_LENGTH': str(len(body)),
            'SERVER_NAME': server_name,
            'SERVER_PORT': server_port,
            'wsgi.version': (1, 0),
            'wsgi.url_scheme': 'https',  # Vercel uses HTTPS
            'wsgi.input': BytesIO(body),
            'wsgi.errors': sys.stderr,
            'wsgi.multithread': False,
            'wsgi.multiprocess': True,
            'wsgi.run_once': False,
        }
        
        # Add HTTP headers in WSGI format (HTTP_ prefix, uppercase, underscores)
        for key, value in headers.items():
            key_normalized = key.upper().replace('-', '_')
            # Skip special headers that go in environ directly
            if key_normalized not in ('CONTENT_TYPE', 'CONTENT_LENGTH'):
                environ['HTTP_' + key_normalized] = value
        
        # Track response status and headers
        status_code = [200]
        response_headers = []
        
        def start_response(wsgi_status, wsgi_headers):
            """
            WSGI start_response callback.
            Flask calls this to set status and headers.
            """
            status_code[0] = int(wsgi_status.split()[0])
            response_headers[:] = wsgi_headers
        
        # Call Flask WSGI application
        # Flask app is callable: app(environ, start_response)
        result = app(environ, start_response)
        
        # Collect response body from WSGI iterable
        # WSGI apps return an iterable of byte strings
        response_body = b''.join(result)
        
        # Decode to string for Vercel response format
        try:
            body_str = response_body.decode('utf-8')
        except UnicodeDecodeError:
            # Binary content (images, etc.) - keep as bytes
            # Vercel expects string, so we'd need base64 encoding for binary
            # For now, try to decode with error handling
            body_str = response_body.decode('utf-8', errors='replace')
        
        # Return Vercel-compatible response format
        return {
            'statusCode': status_code[0],
            'headers': dict(response_headers),
            'body': body_str
        }
        
    except Exception as e:
        # Comprehensive error handling for debugging
        import traceback
        error_trace = traceback.format_exc()
        error_details = f"""
        Handler Error Details:
        =====================
        Error Type: {type(e).__name__}
        Error Message: {str(e)}
        
        Full Traceback:
        {error_trace}
        
        Request Info:
        - Method: {getattr(request, 'method', 'N/A')}
        - Path: {getattr(request, 'path', 'N/A')}
        - Has headers: {hasattr(request, 'headers')}
        - Has body: {hasattr(request, 'body')}
        """
        print(error_details)
        
        # Return error response (this will show in browser)
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'text/plain; charset=utf-8',
            },
            'body': f'Internal Server Error\n\n{type(e).__name__}: {str(e)}\n\nCheck Vercel function logs for full details.'
        }

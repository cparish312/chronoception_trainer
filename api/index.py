import sys
import os
from io import BytesIO

# Add parent directory to path to import app
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

# Import Flask app
try:
    from app import app
except ImportError as e:
    # Log the error for debugging
    print(f"Import error: {e}")
    print(f"Python path: {sys.path}")
    print(f"Parent dir: {parent_dir}")
    raise

# Vercel serverless function entry point
def handler(request):
    """
    Vercel Python runtime handler
    Converts Vercel request to WSGI and calls Flask app
    """
    try:
        # Get request attributes with safe defaults
        method = getattr(request, 'method', 'GET')
        path = getattr(request, 'path', '/')
        headers = getattr(request, 'headers', {})
        body = getattr(request, 'body', b'')
        query_string = getattr(request, 'query_string', '')
        
        # Convert headers to dict if needed
        if not isinstance(headers, dict):
            headers = dict(headers) if headers else {}
        
        # Handle body - convert string to bytes if needed
        if isinstance(body, str):
            body = body.encode('utf-8')
        elif body is None:
            body = b''
        
        # Parse host
        host = headers.get('Host', 'localhost')
        if ':' in host:
            server_name, server_port = host.split(':', 1)
        else:
            server_name = host
            server_port = '80'
        
        # Build WSGI environ
        environ = {
            'REQUEST_METHOD': method,
            'PATH_INFO': path,
            'QUERY_STRING': query_string,
            'CONTENT_TYPE': headers.get('Content-Type', ''),
            'CONTENT_LENGTH': str(len(body)),
            'SERVER_NAME': server_name,
            'SERVER_PORT': server_port,
            'wsgi.version': (1, 0),
            'wsgi.url_scheme': 'https',
            'wsgi.input': BytesIO(body),
            'wsgi.errors': sys.stderr,
            'wsgi.multithread': False,
            'wsgi.multiprocess': True,
            'wsgi.run_once': False,
        }
        
        # Add HTTP headers
        for key, value in headers.items():
            if key.upper() not in ('CONTENT_TYPE', 'CONTENT_LENGTH'):
                environ_key = 'HTTP_' + key.upper().replace('-', '_')
                environ[environ_key] = value
        
        # Response tracking
        status = [200]
        headers_list = []
        
        def start_response(wsgi_status, wsgi_headers):
            status[0] = int(wsgi_status.split()[0])
            headers_list[:] = wsgi_headers
        
        # Call Flask app
        result = app(environ, start_response)
        
        # Collect response body
        response_body = b''.join(result)
        
        # Convert to string if it's text
        try:
            response_body_str = response_body.decode('utf-8')
        except UnicodeDecodeError:
            response_body_str = response_body
        
        # Return Vercel response format
        return {
            'statusCode': status[0],
            'headers': dict(headers_list),
            'body': response_body_str
        }
        
    except Exception as e:
        # Log full error for debugging
        import traceback
        error_trace = traceback.format_exc()
        error_msg = f"Handler error: {str(e)}\n{error_trace}"
        print(error_msg)
        
        # Return error response
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'text/plain; charset=utf-8'},
            'body': f'Internal Server Error\n\n{str(e)}\n\nCheck Vercel logs for details.'
        }

from flask import Flask, render_template, jsonify, request
from datetime import datetime, timedelta
import time

app = Flask(__name__)

# Game state
game_state = {
    'is_running': False,
    'interval': None,
    'time_before': None,
    'start_time': None,
    'stats': {
        'total': 0,
        'success': 0,
        'fail': 0
    }
}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/start', methods=['POST'])
def start_game():
    data = request.json
    interval_minutes = float(data.get('interval', 1))  # Interval in minutes
    time_before = float(data.get('time_before', 5))  # Time before in seconds
    
    # Convert interval from minutes to seconds
    interval_seconds = interval_minutes * 60
    
    if interval_minutes <= 0 or time_before <= 0 or time_before >= interval_seconds:
        return jsonify({'error': 'Invalid parameters'}), 400
    
    game_state['interval'] = interval_seconds  # Store in seconds internally
    game_state['time_before'] = time_before
    game_state['is_running'] = True
    game_state['start_time'] = time.time()
    
    return jsonify({
        'success': True,
        'interval': interval_seconds,  # Return in seconds for calculations
        'interval_minutes': interval_minutes,  # Also return in minutes for display
        'time_before': time_before,
        'start_time': game_state['start_time']
    })

@app.route('/api/click', methods=['POST'])
def handle_click():
    if not game_state['is_running']:
        return jsonify({'error': 'Game not running'}), 400
    
    current_time = time.time()
    elapsed = current_time - game_state['start_time']
    
    # User needs to click within time_before seconds before the interval ends
    # So the window is: [interval - time_before, interval]
    lower_bound = game_state['interval'] - game_state['time_before']
    upper_bound = game_state['interval']
    
    game_state['stats']['total'] += 1
    
    if lower_bound <= elapsed <= upper_bound:
        game_state['stats']['success'] += 1
        result = 'success'
        # Format elapsed time as minutes:seconds
        mins = int(elapsed // 60)
        secs = elapsed % 60
        message = f'Success! You clicked at {mins}:{secs:05.2f}'
    else:
        game_state['stats']['fail'] += 1
        result = 'fail'
        # Format elapsed time as minutes:seconds
        mins = int(elapsed // 60)
        secs = elapsed % 60
        if elapsed < lower_bound:
            message = f'Too early! You clicked at {mins}:{secs:05.2f}'
        else:
            message = f'Too late! You clicked at {mins}:{secs:05.2f}'
    
    # Automatically start next round - don't reset is_running
    # Just update the start_time for the next round
    game_state['start_time'] = time.time()
    
    return jsonify({
        'result': result,
        'message': message,
        'elapsed': elapsed,
        'target_window': [lower_bound, upper_bound],
        'stats': game_state['stats'],
        'continue': True  # Signal to continue automatically
    })

@app.route('/api/reset', methods=['POST'])
def reset_game():
    game_state['is_running'] = False
    game_state['start_time'] = None
    return jsonify({'success': True})

@app.route('/api/stats', methods=['GET'])
def get_stats():
    return jsonify(game_state['stats'])

@app.route('/api/timeout', methods=['POST'])
def handle_timeout():
    """Handle timeout when user doesn't click in time"""
    if not game_state['is_running']:
        return jsonify({'error': 'Game not running'}), 400
    
    game_state['stats']['total'] += 1
    game_state['stats']['fail'] += 1
    
    # Automatically start next round
    game_state['start_time'] = time.time()
    
    return jsonify({
        'result': 'fail',
        'message': "Time's up! You didn't click in time.",
        'stats': game_state['stats'],
        'continue': True
    })

@app.route('/api/reset_stats', methods=['POST'])
def reset_stats():
    game_state['stats'] = {'total': 0, 'success': 0, 'fail': 0}
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)


# Chronoception Trainer

A web application to train your ability to perceive and predict time intervals (chronoception).

## Features

- Set custom time intervals (in minutes) and prediction windows (in seconds)
- Real-time timer display in minutes:seconds format
- Continuous gameplay - automatically continues after each attempt
- Success/failure tracking with live statistics
- Clean, modern UI with visual feedback

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the application:
```bash
python app.py
```

3. Open your browser and navigate to:
```
http://127.0.0.1:5000
```

## How to Play

1. **Set your parameters:**
   - **Target Interval**: The total duration you need to predict (in **minutes**)
   - **Time Before**: How many **seconds** before the interval ends you need to click

2. **Click "Start Game"** to begin

3. **Watch the timer** (displayed as minutes:seconds) and click the button when you think there are `time_before` seconds remaining in the interval

4. **Get instant feedback** - a brief flash will show whether you succeeded or failed

5. **Game continues automatically** - after each attempt, a new round starts immediately. Your statistics are continuously updated.

6. **Track your progress** with the statistics panel showing your total attempts, successes, failures, and accuracy percentage

## Example

- Set Interval: **1 minute** (60 seconds)
- Set Time Before: **5 seconds**
- You need to click when the timer shows between **0:55** and **1:00**
- If you click within this window, you succeed!
- The game automatically starts a new round after showing the result

## Requirements

- Python 3.7+
- Flask 3.0.0+


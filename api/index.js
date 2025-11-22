const express = require('express');
const path = require('path');

const app = express();

// Middleware
app.use(express.json());

// Serve static files from public directory (Vercel serves this automatically)
// Also serve from static for local development compatibility
app.use(express.static(path.join(__dirname, '../public')));
app.use('/static', express.static(path.join(__dirname, '../static')));

// Game state (in-memory, resets on serverless cold start)
let gameState = {
  isRunning: false,
  interval: null,
  timeBefore: null,
  startTime: null,
  stats: {
    total: 0,
    success: 0,
    fail: 0
  },
  history: [] // Array of {result: 'success'/'fail', timestamp: Date.now()}
};

// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../templates/index.html'));
});

// API Routes
app.post('/api/start', (req, res) => {
  const { interval, time_before } = req.body;
  const intervalMinutes = parseFloat(interval) || 1;
  const timeBefore = parseFloat(time_before) || 5;
  
  // Convert interval from minutes to seconds
  const intervalSeconds = intervalMinutes * 60;
  
  if (intervalMinutes <= 0 || timeBefore <= 0 || timeBefore >= intervalSeconds) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }
  
  gameState.interval = intervalSeconds;
  gameState.timeBefore = timeBefore;
  gameState.isRunning = true;
  gameState.startTime = Date.now() / 1000; // Convert to seconds
  
  res.json({
    success: true,
    interval: intervalSeconds,
    interval_minutes: intervalMinutes,
    time_before: timeBefore,
    start_time: gameState.startTime
  });
});

app.post('/api/click', (req, res) => {
  if (!gameState.isRunning) {
    return res.status(400).json({ error: 'Game not running' });
  }
  
  const currentTime = Date.now() / 1000; // Convert to seconds
  const elapsed = currentTime - gameState.startTime;
  
  // User needs to click within time_before seconds before the interval ends
  const lowerBound = gameState.interval - gameState.timeBefore;
  const upperBound = gameState.interval;
  
  gameState.stats.total += 1;
  
  let result, message;
  if (lowerBound <= elapsed && elapsed <= upperBound) {
    gameState.stats.success += 1;
    result = 'success';
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    message = `Success! You clicked at ${mins}:${secs.toFixed(2).padStart(5, '0')}`;
  } else {
    gameState.stats.fail += 1;
    result = 'fail';
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    if (elapsed < lowerBound) {
      message = `Too early! You clicked at ${mins}:${secs.toFixed(2).padStart(5, '0')}`;
    } else {
      message = `Too late! You clicked at ${mins}:${secs.toFixed(2).padStart(5, '0')}`;
    }
  }
  
  // Add to history
  gameState.history.push({
    result: result,
    timestamp: Date.now() / 1000
  });
  
  // Keep only last 100 entries
  if (gameState.history.length > 100) {
    gameState.history = gameState.history.slice(-100);
  }
  
  // Automatically start next round
  gameState.startTime = Date.now() / 1000;
  
  res.json({
    result: result,
    message: message,
    elapsed: elapsed,
    target_window: [lowerBound, upperBound],
    stats: gameState.stats,
    history: gameState.history,
    continue: true
  });
});

app.post('/api/reset', (req, res) => {
  gameState.isRunning = false;
  gameState.startTime = null;
  res.json({ success: true });
});

app.get('/api/stats', (req, res) => {
  res.json({
    stats: gameState.stats,
    history: gameState.history
  });
});

app.post('/api/timeout', (req, res) => {
  if (!gameState.isRunning) {
    return res.status(400).json({ error: 'Game not running' });
  }
  
  gameState.stats.total += 1;
  gameState.stats.fail += 1;
  
  // Add to history
  gameState.history.push({
    result: 'fail',
    timestamp: Date.now() / 1000
  });
  
  // Keep only last 100 entries
  if (gameState.history.length > 100) {
    gameState.history = gameState.history.slice(-100);
  }
  
  // Automatically start next round
  gameState.startTime = Date.now() / 1000;
  
  res.json({
    result: 'fail',
    message: "Time's up! You didn't click in time.",
    stats: gameState.stats,
    history: gameState.history,
    continue: true
  });
});

app.post('/api/reset_stats', (req, res) => {
  gameState.stats = { total: 0, success: 0, fail: 0 };
  gameState.history = [];
  res.json({ success: true });
});

// For local development
if (require.main === module) {
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Vercel serverless function handler
module.exports = app;


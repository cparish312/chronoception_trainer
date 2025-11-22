let gameInterval = null;
let startTime = null;
let currentInterval = null;
let currentTimeBefore = null;
let currentIntervalMinutes = null;

const setupPanel = document.getElementById('setupPanel');
const gamePanel = document.getElementById('gamePanel');
const startBtn = document.getElementById('startBtn');
const clickBtn = document.getElementById('clickBtn');
const stopBtn = document.getElementById('stopBtn');
const resetStatsBtn = document.getElementById('resetStatsBtn');
const timerValue = document.getElementById('timerValue');
const targetInfo = document.getElementById('targetInfo');
const resultFlash = document.getElementById('resultFlash');
const resultFlashText = document.getElementById('resultFlashText');

// Stats elements
const totalStat = document.getElementById('totalStat');
const successStat = document.getElementById('successStat');
const failStat = document.getElementById('failStat');
const accuracyStat = document.getElementById('accuracyStat');

startBtn.addEventListener('click', startGame);
clickBtn.addEventListener('click', handleClick);
stopBtn.addEventListener('click', stopGame);
resetStatsBtn.addEventListener('click', resetStats);

async function startGame() {
    const intervalMinutes = parseFloat(document.getElementById('interval').value);
    const timeBefore = parseFloat(document.getElementById('timeBefore').value);
    
    // Convert interval to seconds for validation
    const intervalSeconds = intervalMinutes * 60;
    
    if (intervalMinutes <= 0 || timeBefore <= 0 || timeBefore >= intervalSeconds) {
        alert('Invalid parameters! Time before (in seconds) must be less than interval (in minutes converted to seconds).');
        return;
    }
    
    try {
        const response = await fetch('/api/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ interval: intervalMinutes, time_before: timeBefore })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentInterval = data.interval; // In seconds
            currentIntervalMinutes = data.interval_minutes;
            currentTimeBefore = timeBefore;
            startTime = data.start_time * 1000; // Convert to milliseconds
            
            setupPanel.style.display = 'none';
            gamePanel.style.display = 'block';
            
            // Format target window display
            const targetStart = currentInterval - currentTimeBefore;
            const mins = Math.floor(targetStart / 60);
            const secs = Math.floor(targetStart % 60);
            const endMins = Math.floor(currentInterval / 60);
            const endSecs = Math.floor(currentInterval % 60);
            const secsStr = secs < 10 ? '0' + secs : '' + secs;
            const endSecsStr = endSecs < 10 ? '0' + endSecs : '' + endSecs;
            targetInfo.textContent = `Click when timer reaches ${mins}:${secsStr} - ${endMins}:${endSecsStr}`;
            
            clickBtn.disabled = false;
            clickBtn.textContent = 'Click when ready!';
            
            // Hide result flash if visible
            resultFlash.style.display = 'none';
            
            // Start timer
            gameInterval = setInterval(updateTimer, 10);
        }
    } catch (error) {
        console.error('Error starting game:', error);
        alert('Error starting game. Please try again.');
    }
}

function updateTimer() {
    const elapsed = (Date.now() - startTime) / 1000;
    
    // Format as minutes:seconds.milliseconds
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const secsStr = secs.toFixed(2);
    const secsPadded = secsStr.length < 5 ? '0'.repeat(5 - secsStr.length) + secsStr : secsStr;
    timerValue.textContent = `${mins}:${secsPadded}`;
    
    // Check if time exceeded
    if (elapsed >= currentInterval) {
        // Time's up, automatically fail
        handleTimeout();
    }
}

async function handleClick() {
    if (!startTime) return;
    
    clearInterval(gameInterval);
    clickBtn.disabled = true;
    
    try {
        const response = await fetch('/api/click', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.error) {
            alert(data.error);
            return;
        }
        
        // Show brief result flash
        resultFlashText.textContent = data.result === 'success' ? '✓ Success!' : '✗ Failed';
        resultFlash.className = `result-flash ${data.result}`;
        resultFlash.style.display = 'block';
        
        // Update stats
        updateStats(data.stats);
        
        // Automatically start next round after brief delay
        setTimeout(() => {
            resultFlash.style.display = 'none';
            // Start next round automatically
            startNextRound();
        }, 1500); // Show result for 1.5 seconds
        
    } catch (error) {
        console.error('Error handling click:', error);
        alert('Error processing click. Please try again.');
    }
}

function startNextRound() {
    // Start a new round with the same settings
    fetch('/api/start', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
            interval: currentIntervalMinutes, 
            time_before: currentTimeBefore 
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            startTime = data.start_time * 1000;
            
            // Format target window display
            const targetStart = currentInterval - currentTimeBefore;
            const mins = Math.floor(targetStart / 60);
            const secs = Math.floor(targetStart % 60);
            const endMins = Math.floor(currentInterval / 60);
            const endSecs = Math.floor(currentInterval % 60);
            const secsStr = secs < 10 ? '0' + secs : '' + secs;
            const endSecsStr = endSecs < 10 ? '0' + endSecs : '' + endSecs;
            targetInfo.textContent = `Click when timer reaches ${mins}:${secsStr} - ${endMins}:${endSecsStr}`;
            
            clickBtn.disabled = false;
            clickBtn.textContent = 'Click when ready!';
            
            // Start timer
            gameInterval = setInterval(updateTimer, 10);
        }
    })
    .catch(error => {
        console.error('Error starting next round:', error);
    });
}

function handleTimeout() {
    clearInterval(gameInterval);
    clickBtn.disabled = true;
    
    // Call timeout endpoint to record failure
    fetch('/api/timeout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            console.error('Error handling timeout:', data.error);
            return;
        }
        
        // Show timeout message
        resultFlashText.textContent = '✗ Time\'s Up!';
        resultFlash.className = 'result-flash fail';
        resultFlash.style.display = 'block';
        
        // Update stats
        updateStats(data.stats);
        
        // Automatically start next round after brief delay
        setTimeout(() => {
            resultFlash.style.display = 'none';
            startNextRound();
        }, 1500);
    })
    .catch(error => {
        console.error('Error handling timeout:', error);
    });
}

function stopGame() {
    clearInterval(gameInterval);
    
    fetch('/api/reset', {
        method: 'POST'
    });
    
    setupPanel.style.display = 'block';
    gamePanel.style.display = 'none';
    resultFlash.style.display = 'none';
    
    startTime = null;
    currentInterval = null;
    currentTimeBefore = null;
    currentIntervalMinutes = null;
}

function updateStats(stats) {
    totalStat.textContent = stats.total;
    successStat.textContent = stats.success;
    failStat.textContent = stats.fail;
    
    const accuracy = stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : 0;
    accuracyStat.textContent = accuracy + '%';
}

async function resetStats() {
    if (!confirm('Are you sure you want to reset all statistics?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/reset_stats', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateStats({ total: 0, success: 0, fail: 0 });
        }
    } catch (error) {
        console.error('Error resetting stats:', error);
    }
}

// Load initial stats
fetch('/api/stats')
    .then(response => response.json())
    .then(data => updateStats(data))
    .catch(error => console.error('Error loading stats:', error));


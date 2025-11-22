let gameInterval = null;
let startTime = null;
let currentInterval = null;
let currentTimeBefore = null;
let currentIntervalMinutes = null;
let audioContext = null;
let wakeLock = null;
let notificationPermission = null;

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

// Chart initialization
let performanceChart = null;
const chartCanvas = document.getElementById('performanceChart');

// Initialize audio context (lazy initialization)
function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume audio context if it's suspended (e.g., when page was in background)
    if (audioContext.state === 'suspended') {
        audioContext.resume().catch(err => {
            console.error('Error resuming audio context:', err);
        });
    }
    return audioContext;
}

// Vibrate phone with a pattern
// On Android Chrome, vibration requires user gesture, so we use notifications as fallback
function vibrate(pattern) {
    if (navigator.vibrate) {
        try {
            // Try direct vibration first
            const result = navigator.vibrate(pattern);
            // If it returns false, it might be blocked - try notification vibration
            if (result === false && 'Notification' in window && notificationPermission === 'granted') {
                // Vibration will be handled via notification
                return false;
            }
            return result;
        } catch (error) {
            console.error('Error vibrating:', error);
            return false;
        }
    }
    return false;
}

// Request notification permission (needed for vibration when page is in background)
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        return false;
    }
    
    if (Notification.permission === 'granted') {
        notificationPermission = 'granted';
        return true;
    }
    
    if (Notification.permission !== 'denied') {
        try {
            const permission = await Notification.requestPermission();
            notificationPermission = permission;
            return permission === 'granted';
        } catch (error) {
            console.error('Error requesting notification permission:', error);
            return false;
        }
    }
    
    return false;
}

// Acquire wake lock to keep screen/page active
async function acquireWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => {
                console.log('Wake lock released');
            });
            return true;
        } catch (error) {
            console.error('Error acquiring wake lock:', error);
            return false;
        }
    }
    return false;
}

// Release wake lock
function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
    }
}

// Play beep sound when timer expires (repeats N=6 times)
function playTimeoutSound() {
    const N = 6; // Number of times to repeat the sound
    const beepDuration = 0.3; // Duration of each beep in seconds
    const pauseDuration = 0.2; // Pause between beeps in seconds
    
    // Vibrate with pattern matching the beeps
    const vibrationPattern = Array.from({ length: N * 2 }, (_, i) =>
        i % 2 === 0 ? Math.round(beepDuration * 1000) : Math.round(pauseDuration * 1000)
    );
    
    // Try to vibrate directly (works if called from user gesture)
    const vibrationWorked = vibrate(vibrationPattern);
    
    // If vibration didn't work (e.g., no user gesture context), use notification
    if (!vibrationWorked && 'Notification' in window && notificationPermission === 'granted') {
        try {
            const notification = new Notification('Time\'s Up!', {
                body: 'Click to return to the game',
                tag: 'timeout',
                requireInteraction: false,
                vibrate: vibrationPattern,
                silent: false // This allows sound to play
            });
            
            notification.onclick = () => {
                window.focus();
                notification.close();
            };
            
            // Auto-close after 3 seconds
            setTimeout(() => notification.close(), 3000);
        } catch (error) {
            console.error('Error showing notification:', error);
        }
    }
    
    try {
        const ctx = initAudioContext();
        
        // Ensure audio context is resumed (critical for background playback)
        if (ctx.state === 'suspended') {
            ctx.resume().then(() => {
                playBeeps(ctx, N, beepDuration, pauseDuration);
            }).catch(err => {
                console.error('Error resuming audio context:', err);
                // Fallback to Audio API
                playBeepsFallback(N, beepDuration, pauseDuration);
            });
        } else {
            playBeeps(ctx, N, beepDuration, pauseDuration);
        }
    } catch (error) {
        console.error('Error playing sound:', error);
        playBeepsFallback(N, beepDuration, pauseDuration);
    }
}

// Helper function to play beeps using Web Audio API
function playBeeps(ctx, N, beepDuration, pauseDuration) {
    for (let i = 0; i < N; i++) {
        const startTime = ctx.currentTime + i * (beepDuration + pauseDuration);
        
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        // Set frequency and type for a beep sound
        oscillator.frequency.value = 800; // 800 Hz
        oscillator.type = 'sine';
        
        // Set volume envelope (fade in/out)
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + beepDuration);
        
        // Play for beepDuration seconds
        oscillator.start(startTime);
        oscillator.stop(startTime + beepDuration);
    }
}

// Fallback: try to play beeps using Audio API
function playBeepsFallback(N, beepDuration, pauseDuration) {
    try {
        const beep = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjGH0fPTgjMGHm7A7+OZURAJR6Hh8sFvJgUwgM/z2IU3CB1ou+3nn00QDFCn4/C2YxwGOJHX8sx5LAUkd8fw3ZBAC');
        // Play N times with delays
        for (let i = 0; i < N; i++) {
            setTimeout(() => {
                const audioClone = beep.cloneNode();
                audioClone.play().catch(() => {
                    // Ignore if autoplay is blocked
                });
            }, i * (beepDuration * 1000 + pauseDuration * 1000));
        }
    } catch (e) {
        // Silently fail if audio is not available
    }
}

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
    
    // Request notification permission and acquire wake lock (within user gesture)
    await requestNotificationPermission();
    await acquireWakeLock();
    
    // Pre-initialize audio context while we have user gesture
    initAudioContext();
    
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
            
            // Set startTime to current client time right before starting timer
            // This ensures the timer starts at 0:00.00 instead of showing network delay
            startTime = Date.now();
            
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
    
    // Calculate elapsed time on client side (what the user actually sees)
    const clientElapsed = (Date.now() - startTime) / 1000;
    
    try {
        const response = await fetch('/api/click', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ elapsed: clientElapsed })
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
        
        // Vibrate based on result
        if (data.result === 'success') {
            // Success: two short vibrations
            vibrate([100, 50, 100]);
        } else {
            // Failure: one longer vibration
            vibrate([200]);
        }
        
        // Update stats and chart
        updateStats(data.stats, data.history);
        
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
            
            // Set startTime to current client time right before starting timer
            // This ensures the timer starts at 0:00.00 instead of showing network delay
            startTime = Date.now();
            
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
    
    // Play timeout sound
    playTimeoutSound();
    
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
        
        // Vibration is already handled in playTimeoutSound()
        
        // Update stats and chart
        updateStats(data.stats, data.history);
        
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
    
    // Release wake lock when stopping game
    releaseWakeLock();
    
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

function initChart() {
    if (performanceChart) {
        performanceChart.destroy();
    }
    
    const ctx = chartCanvas.getContext('2d');
    performanceChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Successes',
                    data: [],
                    borderColor: '#28a745',
                    backgroundColor: '#28a745',
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    showLine: false
                },
                {
                    label: 'Failures',
                    data: [],
                    borderColor: '#dc3545',
                    backgroundColor: '#dc3545',
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    showLine: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    display: false,
                    min: -0.5,
                    max: 0.5
                },
                x: {
                    title: {
                        display: true,
                        text: 'Attempt Number'
                    },
                    ticks: {
                        stepSize: 1
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            }
        }
    });
}

function updateChart(history) {
    if (!performanceChart) {
        initChart();
    }
    
    if (!history || history.length === 0) {
        performanceChart.data.datasets[0].data = [];
        performanceChart.data.datasets[1].data = [];
        performanceChart.update();
        return;
    }
    
    // Process history into individual attempts
    const successData = [];
    const failData = [];
    
    history.forEach((entry, index) => {
        // All points at y=0 (horizontal line), different datasets for color
        if (entry.result === 'success') {
            successData.push({ x: index + 1, y: 0 });
        } else {
            failData.push({ x: index + 1, y: 0 });
        }
    });
    
    performanceChart.data.datasets[0].data = successData;
    performanceChart.data.datasets[1].data = failData;
    performanceChart.update();
}

function updateStats(stats, history) {
    totalStat.textContent = stats.total;
    successStat.textContent = stats.success;
    failStat.textContent = stats.fail;
    
    const accuracy = stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : 0;
    accuracyStat.textContent = accuracy + '%';
    
    // Update chart if history is provided
    if (history !== undefined) {
        updateChart(history);
    }
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
            updateStats({ total: 0, success: 0, fail: 0 }, []);
        }
    } catch (error) {
        console.error('Error resetting stats:', error);
    }
}

// Initialize chart on page load
initChart();

// Load initial stats and history
fetch('/api/stats')
    .then(response => response.json())
    .then(data => updateStats(data.stats, data.history))
    .catch(error => console.error('Error loading stats:', error));

// Handle visibility change to reacquire wake lock if needed
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && gameInterval && !wakeLock) {
        // Reacquire wake lock if game is running and we lost it
        await acquireWakeLock();
    }
});


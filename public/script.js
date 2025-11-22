let gameInterval = null;
let startTime = null;
let currentInterval = null;
let currentTimeBefore = null;
let currentIntervalMinutes = null;
let audioContext = null;

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
    return audioContext;
}

// Play beep sound when timer expires (repeats N=6 times)
function playTimeoutSound() {
    const N = 6; // Number of times to repeat the sound
    const beepDuration = 0.3; // Duration of each beep in seconds
    const pauseDuration = 0.2; // Pause between beeps in seconds
    
    try {
        const ctx = initAudioContext();
        
        // Play N beeps with pauses between them
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
    } catch (error) {
        console.error('Error playing sound:', error);
        // Fallback: try to play beeps using Audio API
        try {
            const beep = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjGH0fPTgjMGHm7A7+OZURAJR6Hh8sFvJgUwgM/z2IU3CB1ou+3nn00QDFCn4/C2YxwGOJHX8sx5LAUkd8fw3ZBAC');
            // Play N times with delays
            for (let i = 0; i < N; i++) {
                setTimeout(() => {
                    beep.cloneNode().play().catch(() => {
                        // Ignore if autoplay is blocked
                    });
                }, i * (beepDuration * 1000 + pauseDuration * 1000));
            }
        } catch (e) {
            // Silently fail if audio is not available
        }
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


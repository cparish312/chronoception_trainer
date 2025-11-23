let gameInterval = null;
let startTime = null;
let currentInterval = null;
let currentTimeBefore = null;
let currentIntervalMinutes = null;
let audioContext = null;
let wakeLock = null;
let notificationPermission = null;
let isGameRunning = false;
let pendingTimeouts = [];
let pendingFetchAbortControllers = [];
let serviceWorkerRegistration = null;
let isProcessingTimeout = false; // Flag to prevent multiple timeout processing

const setupPanel = document.getElementById('setupPanel');
const gamePanel = document.getElementById('gamePanel');
const startBtn = document.getElementById('startBtn');
const clickBtn = document.getElementById('clickBtn');
const stopBtn = document.getElementById('stopBtn');
const resetStatsBtn = document.getElementById('resetStatsBtn');
const targetInfo = document.getElementById('targetInfo');
const resultFlash = document.getElementById('resultFlash');
const resultFlashText = document.getElementById('resultFlashText');
const resultImage = document.getElementById('resultImage');

// Stats elements
const totalStat = document.getElementById('totalStat');
const successStat = document.getElementById('successStat');
const failStat = document.getElementById('failStat');
const accuracyStat = document.getElementById('accuracyStat');

// Chart initialization
let performanceChart = null;
const chartCanvas = document.getElementById('performanceChart');

// Register Service Worker for background notifications
let serviceWorkerReady = false;

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    
    try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
            updateViaCache: 'none'
        });
        
        serviceWorkerRegistration = registration;
        
        // Wait for service worker to be ready
        if (registration.installing) {
            registration.installing.addEventListener('statechange', function() {
                if (this.state === 'activated') {
                    serviceWorkerReady = true;
                }
            });
        } else if (registration.waiting) {
            serviceWorkerReady = true;
        } else if (registration.active) {
            serviceWorkerReady = true;
        }
        
        // Listen for messages from service worker (only once)
        navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
        
    } catch (error) {
        console.error('Service Worker registration failed:', error);
    }
}

// Handle messages from service worker
function handleServiceWorkerMessage(event) {
    if (event.data && event.data.type === 'TIMEOUT_DETECTED') {
        // Only handle if we haven't already processed it and game is running
        if (isGameRunning && !isProcessingTimeout) {
            handleTimeout();
        }
    }
}

// Send message to service worker
function sendMessageToServiceWorker(message) {
    if (!serviceWorkerReady) return;
    
    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage(message);
    } else if (serviceWorkerRegistration && serviceWorkerRegistration.active) {
        serviceWorkerRegistration.active.postMessage(message);
    }
}

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
    
    // Clear any pending timeouts and abort any pending fetches from previous game
    clearAllPendingOperations();
    
    // Request notification permission and acquire wake lock (within user gesture)
    await requestNotificationPermission();
    await acquireWakeLock();
    
    // Pre-initialize audio context while we have user gesture
    initAudioContext();
    
    // Set game running flag
    isGameRunning = true;
    
    try {
        const response = await fetch('/api/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ interval: intervalMinutes, time_before: timeBefore })
        });
        
        const data = await response.json();
        
        if (data.success && isGameRunning) {
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
            clickBtn.textContent = 'It is time!';
            
            // Hide result flash if visible
            resultFlash.style.display = 'none';
            
            // Set startTime to current client time right before starting timer
            // This ensures the timer starts at 0:00.00 instead of showing network delay
            startTime = Date.now();
            
            // Notify service worker about the timeout time
            if (data.timeout_time) {
                sendMessageToServiceWorker({
                    type: 'START_GAME',
                    timeoutTime: data.timeout_time
                });
            }
            
            // Start timer
            gameInterval = setInterval(updateTimer, 10);
        }
    } catch (error) {
        isGameRunning = false;
        console.error('Error starting game:', error);
        alert('Error starting game. Please try again.');
    }
}

function updateTimer() {
    if (!isGameRunning || isProcessingTimeout) return;
    
    const elapsed = (Date.now() - startTime) / 1000;
    
    // Check if time exceeded
    if (elapsed >= currentInterval) {
        // Time's up, automatically fail
        handleTimeout();
    }
}

async function handleClick() {
    if (!startTime || !isGameRunning) return;
    
    clearInterval(gameInterval);
    clickBtn.disabled = true;
    
    // Stop service worker timeout checking since user clicked
    sendMessageToServiceWorker({
        type: 'STOP_GAME'
    });
    
    // Calculate elapsed time on client side (what the user actually sees)
    const clientElapsed = (Date.now() - startTime) / 1000;
    
    // Create abort controller for this fetch
    const abortController = new AbortController();
    pendingFetchAbortControllers.push(abortController);
    
    try {
        const response = await fetch('/api/click', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ elapsed: clientElapsed }),
            signal: abortController.signal
        });
        
        // Remove abort controller from pending list
        const index = pendingFetchAbortControllers.indexOf(abortController);
        if (index > -1) {
            pendingFetchAbortControllers.splice(index, 1);
        }
        
        // Check if game is still running before processing response
        if (!isGameRunning) return;
        
        const data = await response.json();
        
        if (data.error) {
            alert(data.error);
            return;
        }
        
        // Show brief result flash with appropriate image
        if (data.result === 'success') {
            resultImage.innerHTML = '<img src="/time_god.png" alt="Time God" style="width: 120px; height: auto;">';
            
            // Show exact time they got it on
            if (data.elapsed !== undefined) {
                const elapsedMins = Math.floor(data.elapsed / 60);
                const elapsedSecs = (data.elapsed % 60).toFixed(2);
                const elapsedStr = `${elapsedMins}:${elapsedSecs.padStart(5, '0')}`;
                resultFlashText.textContent = `✓ Time God Approves! Clicked at: ${elapsedStr}`;
                console.log(`Success! Clicked at: ${elapsedStr}`);
            } else {
                resultFlashText.textContent = '✓ Time God Approves!';
            }
        } else {
            resultImage.textContent = '🐵'; // Monkey
            let failureMessage = '✗ Primal Monkey Says Too Early/Late!';
            
            // If too early, print interval and how early they were (relative to interval end)
            if (data.target_window && data.elapsed !== undefined && currentInterval) {
                const [lowerBound, upperBound] = data.target_window;
                if (data.elapsed < lowerBound) {
                    // Calculate how early relative to interval end
                    const howEarly = currentInterval - data.elapsed;
                    const intervalMins = Math.floor(currentInterval / 60);
                    const intervalSecs = (currentInterval % 60).toFixed(2);
                    const earlyMins = Math.floor(howEarly / 60);
                    const earlySecs = (howEarly % 60).toFixed(2);
                    
                    const intervalStr = `${intervalMins}:${intervalSecs.padStart(5, '0')}`;
                    const earlyStr = earlyMins > 0 
                        ? `${earlyMins}:${earlySecs.padStart(5, '0')}` 
                        : `${earlySecs}s`;
                    
                    console.log(`Interval: ${intervalStr}, Too early by: ${earlyStr}`);
                    failureMessage = `✗ Too Early! Interval: ${intervalStr}, Early by: ${earlyStr}`;
                }
            }
            
            resultFlashText.textContent = failureMessage;
        }
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
        const timeoutId = setTimeout(() => {
            if (!isGameRunning) return;
            resultFlash.style.display = 'none';
            // Start next round automatically
            startNextRound();
        }, 1500); // Show result for 1.5 seconds
        pendingTimeouts.push(timeoutId);
        
    } catch (error) {
        // Remove abort controller from pending list
        const index = pendingFetchAbortControllers.indexOf(abortController);
        if (index > -1) {
            pendingFetchAbortControllers.splice(index, 1);
        }
        
        // Ignore abort errors (game was stopped)
        if (error.name === 'AbortError') {
            return;
        }
        
        console.error('Error handling click:', error);
        if (isGameRunning) {
            alert('Error processing click. Please try again.');
        }
    }
}

function startNextRound() {
    if (!isGameRunning) {
        isProcessingTimeout = false; // Reset flag if game stopped
        return;
    }
    
    // Ensure timeout flag is reset
    isProcessingTimeout = false;
    
    // Create abort controller for this fetch
    const abortController = new AbortController();
    pendingFetchAbortControllers.push(abortController);
    
    // Start a new round with the same settings
    fetch('/api/start', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
            interval: currentIntervalMinutes, 
            time_before: currentTimeBefore 
        }),
        signal: abortController.signal
    })
    .then(response => {
        // Remove abort controller from pending list
        const index = pendingFetchAbortControllers.indexOf(abortController);
        if (index > -1) {
            pendingFetchAbortControllers.splice(index, 1);
        }
        
        // Check if game is still running before processing response
        if (!isGameRunning) {
            isProcessingTimeout = false;
            return null;
        }
        
        return response.json();
    })
    .then(data => {
        if (!isGameRunning || !data || !data.success) {
            isProcessingTimeout = false;
            return;
        }
        
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
        clickBtn.textContent = 'It is time!';
        
        // Set startTime to current client time right before starting timer
        // This ensures the timer starts at 0:00.00 instead of showing network delay
        startTime = Date.now();
        
        // Notify service worker about the new timeout time
        if (data.timeout_time) {
            sendMessageToServiceWorker({
                type: 'START_GAME',
                timeoutTime: data.timeout_time
            });
        }
        
        // Start timer
        gameInterval = setInterval(updateTimer, 10);
    })
    .catch(error => {
        // Remove abort controller from pending list
        const index = pendingFetchAbortControllers.indexOf(abortController);
        if (index > -1) {
            pendingFetchAbortControllers.splice(index, 1);
        }
        
        // Reset flag on error
        isProcessingTimeout = false;
        
        // Ignore abort errors (game was stopped)
        if (error.name !== 'AbortError') {
            console.error('Error starting next round:', error);
        }
    });
}

function handleTimeout() {
    if (!isGameRunning || isProcessingTimeout) return;
    
    // Set flag to prevent multiple processing
    isProcessingTimeout = true;
    
    clearInterval(gameInterval);
    clickBtn.disabled = true;
    
    // Stop service worker timeout checking
    sendMessageToServiceWorker({
        type: 'STOP_GAME'
    });
    
    // Play timeout sound
    playTimeoutSound();
    
    // Create abort controller for this fetch
    const abortController = new AbortController();
    pendingFetchAbortControllers.push(abortController);
    
    // Call timeout endpoint to record failure
    fetch('/api/timeout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        signal: abortController.signal
    })
    .then(response => {
        // Remove abort controller from pending list
        const index = pendingFetchAbortControllers.indexOf(abortController);
        if (index > -1) {
            pendingFetchAbortControllers.splice(index, 1);
        }
        
        // Check if game is still running before processing response
        if (!isGameRunning) {
            isProcessingTimeout = false;
            return null;
        }
        
        return response.json();
    })
    .then(data => {
        if (!isGameRunning || !data) {
            isProcessingTimeout = false;
            return;
        }
        
        if (data.error) {
            console.error('Error handling timeout:', data.error);
            isProcessingTimeout = false;
            return;
        }
        
        // Show timeout message with monkey image
        resultImage.textContent = '🐵'; // Monkey
        resultFlashText.textContent = '✗ Time\'s Up! Primal Monkey Disappointed!';
        resultFlash.className = 'result-flash fail';
        resultFlash.style.display = 'block';
        
        // Vibration is already handled in playTimeoutSound()
        
        // Update stats and chart
        updateStats(data.stats, data.history);
        
        // Automatically start next round after brief delay
        // Use a longer delay if page was in background to ensure user sees the result
        const delay = document.visibilityState === 'visible' ? 1500 : 3000;
        const timeoutId = setTimeout(() => {
            if (!isGameRunning) {
                isProcessingTimeout = false;
                return;
            }
            resultFlash.style.display = 'none';
            // Reset the flag before starting next round
            isProcessingTimeout = false;
            startNextRound();
        }, delay);
        pendingTimeouts.push(timeoutId);
    })
    .catch(error => {
        // Remove abort controller from pending list
        const index = pendingFetchAbortControllers.indexOf(abortController);
        if (index > -1) {
            pendingFetchAbortControllers.splice(index, 1);
        }
        
        // Reset flag on error
        isProcessingTimeout = false;
        
        // Ignore abort errors (game was stopped)
        if (error.name !== 'AbortError') {
            console.error('Error handling timeout:', error);
        }
    });
}

function clearAllPendingOperations() {
    // Clear all pending timeouts
    pendingTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    pendingTimeouts = [];
    
    // Abort all pending fetch requests
    pendingFetchAbortControllers.forEach(controller => controller.abort());
    pendingFetchAbortControllers = [];
}

function stopGame() {
    // Set flag to stop game immediately
    isGameRunning = false;
    isProcessingTimeout = false; // Reset timeout processing flag
    
    // Clear the main game interval
    clearInterval(gameInterval);
    gameInterval = null;
    
    // Clear all pending timeouts and abort pending fetches
    clearAllPendingOperations();
    
    // Notify service worker to stop checking for timeouts
    sendMessageToServiceWorker({
        type: 'STOP_GAME'
    });
    
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
    
    // Detect if we're on mobile
    const isMobile = window.innerWidth <= 768;
    
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
                    pointRadius: isMobile ? 8 : 6,
                    pointHoverRadius: isMobile ? 10 : 8,
                    pointBorderWidth: 2,
                    showLine: false
                },
                {
                    label: 'Failures',
                    data: [],
                    borderColor: '#dc3545',
                    backgroundColor: '#dc3545',
                    pointRadius: isMobile ? 8 : 6,
                    pointHoverRadius: isMobile ? 10 : 8,
                    pointBorderWidth: 2,
                    showLine: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: !isMobile,
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
            },
            elements: {
                point: {
                    radius: isMobile ? 8 : 6,
                    hoverRadius: isMobile ? 10 : 8,
                    borderWidth: 2
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

// Register service worker on page load
registerServiceWorker();

// Load initial stats and history
fetch('/api/stats')
    .then(response => response.json())
    .then(data => updateStats(data.stats, data.history))
    .catch(error => console.error('Error loading stats:', error));

// Handle window resize to update chart for mobile/desktop changes
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (performanceChart) {
            // Save current data
            const currentData = {
                successData: [...performanceChart.data.datasets[0].data],
                failData: [...performanceChart.data.datasets[1].data]
            };
            // Reinitialize chart with new mobile/desktop settings
            initChart();
            // Restore data
            performanceChart.data.datasets[0].data = currentData.successData;
            performanceChart.data.datasets[1].data = currentData.failData;
            performanceChart.update();
        }
    }, 250);
});

// Handle visibility change - simplified
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        // Reacquire wake lock if needed
        if (gameInterval && !wakeLock) {
            await acquireWakeLock();
        }
        
        // Check if we missed a timeout while in background
        if (isGameRunning && !gameInterval && !isProcessingTimeout && startTime) {
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed >= currentInterval) {
                handleTimeout();
            }
        }
        
        // Restart service worker checking if game is active
        // This ensures it continues after page was in background
        if (isGameRunning && gameInterval && startTime && currentInterval) {
            const elapsed = (Date.now() - startTime) / 1000;
            const timeRemaining = currentInterval - elapsed;
            
            if (timeRemaining > 0) {
                const timeoutTime = Date.now() + (timeRemaining * 1000);
                sendMessageToServiceWorker({
                    type: 'START_GAME',
                    timeoutTime: timeoutTime
                });
            }
        }
    }
});


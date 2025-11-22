// Service Worker for background timeout notifications
const CACHE_NAME = 'chronoception-v1';
const TIMEOUT_CHECK_INTERVAL = 1000; // Check every second when game is running

// Install event - cache resources
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event - take control of all pages
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Handle push notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Time's Up!";
  const options = {
    body: data.body || "Click to return to the game",
    icon: '/time_god.png',
    badge: '/time_god.png',
    tag: 'timeout',
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200, 100, 200],
    data: data
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it
      for (let client of clientList) {
        if (client.url === self.location.origin && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Periodic background sync to check for timeouts
self.addEventListener('sync', (event) => {
  if (event.tag === 'check-timeout') {
    event.waitUntil(checkTimeout());
  }
});

// Message handler for communication with main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'START_GAME') {
    // Start periodic timeout checking
    startTimeoutChecking(event.data.timeoutTime);
  } else if (event.data && event.data.type === 'STOP_GAME') {
    // Stop timeout checking
    stopTimeoutChecking();
  } else if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

let timeoutCheckInterval = null;

function startTimeoutChecking(timeoutTime) {
  // Clear any existing interval
  if (timeoutCheckInterval) {
    clearInterval(timeoutCheckInterval);
  }
  
  // Calculate when to check (every second until timeout)
  const now = Date.now();
  const timeUntilTimeout = timeoutTime - now;
  
  if (timeUntilTimeout <= 0) {
    // Already timed out
    showTimeoutNotification();
    return;
  }
  
  // Check periodically (every 5 seconds to reduce battery usage)
  // Service workers are throttled when browser is closed, so we check less frequently
  timeoutCheckInterval = setInterval(() => {
    checkTimeout();
  }, 5000);
  
  // Also set a one-time check for the exact timeout time
  // This will fire even if the browser is closed (on supported platforms)
  setTimeout(() => {
    checkTimeout();
  }, timeUntilTimeout);
  
  // Register a background sync for the timeout time (if supported)
  if ('sync' in self.registration) {
    // Calculate delay until timeout
    const delay = Math.max(0, timeUntilTimeout);
    // Note: Background sync has limitations, but it's a good fallback
  }
}

function stopTimeoutChecking() {
  if (timeoutCheckInterval) {
    clearInterval(timeoutCheckInterval);
    timeoutCheckInterval = null;
  }
}

async function checkTimeout() {
  try {
    const response = await fetch('/api/check_timeout', {
      method: 'GET',
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.timedOut && data.isRunning) {
        // Only show notification if game is still running (hasn't been processed yet)
        showTimeoutNotification();
        stopTimeoutChecking();
        
        // Notify all clients
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({ type: 'TIMEOUT_DETECTED' });
        });
      } else if (!data.isRunning) {
        // Game stopped, stop checking
        stopTimeoutChecking();
      }
    }
  } catch (error) {
    console.error('Error checking timeout:', error);
    // Don't stop checking on error - might be temporary network issue
  }
}

function showTimeoutNotification() {
  const title = "Time's Up!";
  const options = {
    body: "Click to return to the game and continue",
    icon: '/time_god.png',
    badge: '/time_god.png',
    tag: 'timeout',
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200, 100, 200],
    data: { url: '/' }
  };
  
  return self.registration.showNotification(title, options);
}


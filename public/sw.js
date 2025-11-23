// Service Worker for background timeout notifications
let timeoutCheckInterval = null;
let currentTimeoutTime = null;
let lastNotificationTime = 0;
const NOTIFICATION_COOLDOWN = 3000; // 3 seconds cooldown between notifications

// Install event - take control immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event - take control of all pages
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let client of clientList) {
        if (client.url === self.location.origin && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Message handler for communication with main thread
self.addEventListener('message', (event) => {
  if (!event.data) return;
  
  if (event.data.type === 'START_GAME') {
    startChecking(event.data.timeoutTime);
  } else if (event.data.type === 'STOP_GAME') {
    stopChecking();
  }
});

function startChecking(timeoutTime) {
  // Stop any existing checking
  stopChecking();
  
  currentTimeoutTime = timeoutTime;
  lastNotificationTime = 0;
  
  // Check every 3 seconds
  timeoutCheckInterval = setInterval(() => {
    checkTimeout();
  }, 3000);
  
  // Also check immediately
  checkTimeout();
}

function stopChecking() {
  if (timeoutCheckInterval) {
    clearInterval(timeoutCheckInterval);
    timeoutCheckInterval = null;
  }
  currentTimeoutTime = null;
}

async function checkTimeout() {
  // If no timeout time set, don't check
  if (!currentTimeoutTime) return;
  
  try {
    const response = await fetch('/api/check_timeout', {
      method: 'GET',
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
    
    if (!response.ok) return;
    
    const data = await response.json();
    
    // If game stopped, stop checking
    if (!data.isRunning) {
      stopChecking();
      return;
    }
    
    // If timeout occurred and game is still running
    if (data.timedOut && data.isRunning) {
      const now = Date.now();
      
      // Only show notification if cooldown has passed
      if (now - lastNotificationTime > NOTIFICATION_COOLDOWN) {
        showNotification();
        lastNotificationTime = now;
        
        // Notify client once
        const clients = await self.clients.matchAll();
        if (clients.length > 0) {
          clients[0].postMessage({ type: 'TIMEOUT_DETECTED' });
        }
      }
      
      // Continue checking - client will send STOP_GAME or START_GAME
    }
  } catch (error) {
    console.error('Error checking timeout:', error);
  }
}

function showNotification() {
  return self.registration.showNotification("Time's Up!", {
    body: "Click to return to the game",
    icon: '/time_god.png',
    badge: '/time_god.png',
    tag: 'timeout',
    requireInteraction: true,
    vibrate: [200, 100, 200]
  });
}

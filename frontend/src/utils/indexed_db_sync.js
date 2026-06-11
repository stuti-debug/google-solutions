const DB_NAME = 'CrisisGridOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'syncQueue';

// Initialize the IndexedDB database
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

// Queue a request for offline execution
export async function queueRequest(url, method, body, type = 'unknown') {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const item = {
        url,
        method,
        body: JSON.stringify(body),
        type,
        timestamp: Date.now(),
      };

      const request = store.add(item);
      request.onsuccess = () => {
        console.log(`Queued offline request of type: ${type}`);
        resolve(true);
      };
      request.onerror = (e) => {
        reject(e.target.error);
      };
    });
  } catch (err) {
    console.error('Failed to queue request in IndexedDB', err);
    return false;
  }
}

// Get all items in the queue
export async function getQueue() {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = (e) => {
        reject(e.target.error);
      };
    });
  } catch (err) {
    console.error('Failed to read sync queue', err);
    return [];
  }
}

// Delete an item from the queue
export async function deleteQueueItem(id) {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve(true);
      };
      request.onerror = (e) => {
        reject(e.target.error);
      };
    });
  } catch (err) {
    console.error(`Failed to delete queue item ${id}`, err);
    return false;
  }
}

// Process the sync queue
export async function processQueue() {
  if (!navigator.onLine) {
    console.log('App is offline, skipping queue sync.');
    return;
  }

  const queue = await getQueue();
  if (queue.length === 0) {
    return;
  }

  console.log(`Processing ${queue.length} queued offline requests...`);

  for (const item of queue) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: item.body,
      });

      if (response.ok || response.status < 500) {
        // If the request succeeded or returned a client error (e.g. 400 bad request, which cannot be fixed by retrying)
        // remove it from the queue
        await deleteQueueItem(item.id);
        console.log(`Successfully synced offline request ID: ${item.id}`);
      } else {
        // Server error, keep in queue and retry later
        console.warn(`Temporary server error (${response.status}) for offline request ID: ${item.id}. Keeping in queue.`);
        break; // Stop processing further queue items to maintain ordering
      }
    } catch (err) {
      console.error(`Network error executing offline request ID: ${item.id}. Sync halted.`, err);
      break; // Stop processing since network is likely unstable
    }
  }
}

// Setup sync listeners
export function setupOfflineSync() {
  window.addEventListener('online', () => {
    console.log('App is back online. Syncing queue...');
    processQueue();
  });

  // Run on startup
  if (navigator.onLine) {
    processQueue();
  }
}

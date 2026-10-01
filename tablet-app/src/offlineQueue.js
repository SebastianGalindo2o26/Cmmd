const DB_NAME = 'pos-restaurante-tablet';
const STORE_NAME = 'operaciones-pendientes';
const DB_VERSION = 1;
const FALLBACK_KEY = 'pos_restaurante_offline_queue';

function localQueue() {
  try {
    return JSON.parse(localStorage.getItem(FALLBACK_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveLocalQueue(queue) {
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(queue));
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function canUseIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

export async function enqueue(operation) {
  const record = { ...operation, createdAt: new Date().toISOString() };
  if (!canUseIndexedDb()) {
    const queue = localQueue();
    queue.push({ ...record, id: `${Date.now()}-${Math.random()}` });
    saveLocalQueue(queue);
    return record;
  }

  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).add(record);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  return record;
}

export async function listPending() {
  if (!canUseIndexedDb()) return localQueue();
  const database = await openDatabase();
  const records = await new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return records.sort((left, right) => left.id - right.id);
}

export async function removePending(id) {
  if (!canUseIndexedDb()) {
    saveLocalQueue(localQueue().filter((item) => item.id !== id));
    return;
  }
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function pendingCount() {
  return (await listPending()).length;
}

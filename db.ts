import { LibraryEntry } from './types';

const DB_NAME = 'BabelbackLibraryDB';
const DB_VERSION = 1;
const STORE_NAME = 'songs';

let db: IDBDatabase | null = null;

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('IndexedDB error:', request.error);
      reject('Error opening IndexedDB.');
    };

    request.onsuccess = (event) => {
      db = request.result;
      console.log('IndexedDB opened successfully.');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const tempDb = request.result;
      if (!tempDb.objectStoreNames.contains(STORE_NAME)) {
        const store = tempDb.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('title', 'title', { unique: false });
        console.log('IndexedDB object store created.');
      }
    };
  });
};

export const addSongToLibrary = async (entry: Omit<LibraryEntry, 'id'>): Promise<number> => {
  const currentDb = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = currentDb.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(entry);

    request.onsuccess = () => {
      resolve(request.result as number);
    };

    request.onerror = () => {
      console.error('Error adding song to library:', request.error);
      reject('Failed to add song to library.');
    };
  });
};

export const getAllSongsFromLibrary = async (): Promise<LibraryEntry[]> => {
  const currentDb = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = currentDb.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.index('timestamp').getAll(); // Sort by timestamp implicitly by getting all and sorting later if needed, or use cursor with 'prev'

    request.onsuccess = () => {
      // Sort by timestamp descending (newest first)
      const sortedEntries = (request.result as LibraryEntry[]).sort((a, b) => b.timestamp - a.timestamp);
      resolve(sortedEntries);
    };

    request.onerror = () => {
      console.error('Error fetching songs from library:', request.error);
      reject('Failed to fetch songs from library.');
    };
  });
};

export const getSongFromLibrary = async (id: number): Promise<LibraryEntry | undefined> => {
  const currentDb = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = currentDb.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result as LibraryEntry | undefined);
    };

    request.onerror = () => {
      console.error('Error fetching song by ID:', request.error);
      reject('Failed to fetch song by ID.');
    };
  });
};

export const deleteSongFromLibrary = async (id: number): Promise<void> => {
  const currentDb = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = currentDb.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      console.error('Error deleting song from library:', request.error);
      reject('Failed to delete song from library.');
    };
  });
};

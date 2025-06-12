
import { LibraryEntry, PracticeAttempt } from './types';

const DB_NAME = 'BabelbackLibraryDB';
const DB_VERSION = 2; // Incremented version for schema update
const SONGS_STORE_NAME = 'songs';
const PRACTICE_ATTEMPTS_STORE_NAME = 'practiceAttempts';

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
      if (!tempDb.objectStoreNames.contains(SONGS_STORE_NAME)) {
        const store = tempDb.createObjectStore(SONGS_STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('title', 'title', { unique: false });
        console.log('IndexedDB: Songs object store created.');
      }

      if (!tempDb.objectStoreNames.contains(PRACTICE_ATTEMPTS_STORE_NAME)) {
        const store = tempDb.createObjectStore(PRACTICE_ATTEMPTS_STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('librarySongId', 'librarySongId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('IndexedDB: PracticeAttempts object store created.');
      }
    };
  });
};

// --- Song Library Functions ---
export const addSongToLibrary = async (entry: Omit<LibraryEntry, 'id'>): Promise<number> => {
  const currentDb = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = currentDb.transaction(SONGS_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(SONGS_STORE_NAME);
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
    const transaction = currentDb.transaction(SONGS_STORE_NAME, 'readonly');
    const store = transaction.objectStore(SONGS_STORE_NAME);
    const request = store.index('timestamp').getAll(); 

    request.onsuccess = () => {
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
    const transaction = currentDb.transaction(SONGS_STORE_NAME, 'readonly');
    const store = transaction.objectStore(SONGS_STORE_NAME);
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
    const transaction = currentDb.transaction(SONGS_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(SONGS_STORE_NAME);
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

// --- Practice Attempts Functions ---
export const addPracticeAttemptToDB = async (attempt: Omit<PracticeAttempt, 'id'>): Promise<number> => {
  const currentDb = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = currentDb.transaction(PRACTICE_ATTEMPTS_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(PRACTICE_ATTEMPTS_STORE_NAME);
    const request = store.add(attempt);

    request.onsuccess = () => {
      resolve(request.result as number);
    };
    request.onerror = () => {
      console.error('Error adding practice attempt:', request.error);
      reject('Failed to add practice attempt.');
    };
  });
};

export const getPracticeAttemptsForSongFromDB = async (librarySongId: number): Promise<PracticeAttempt[]> => {
  const currentDb = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = currentDb.transaction(PRACTICE_ATTEMPTS_STORE_NAME, 'readonly');
    const store = transaction.objectStore(PRACTICE_ATTEMPTS_STORE_NAME);
    const index = store.index('librarySongId');
    const request = index.getAll(librarySongId);

    request.onsuccess = () => {
      // Sort by timestamp descending (newest practice first)
      const sortedAttempts = (request.result as PracticeAttempt[]).sort((a, b) => b.timestamp - a.timestamp);
      resolve(sortedAttempts);
    };
    request.onerror = () => {
      console.error('Error fetching practice attempts for song:', request.error);
      reject('Failed to fetch practice attempts for song.');
    };
  });
};

export const deletePracticeAttemptFromDB = async (id: number): Promise<void> => {
  const currentDb = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = currentDb.transaction(PRACTICE_ATTEMPTS_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(PRACTICE_ATTEMPTS_STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.error('Error deleting practice attempt:', request.error);
      reject('Failed to delete practice attempt.');
    };
  });
};

export const deleteAllPracticeAttemptsForSongFromDB = async (librarySongId: number): Promise<void> => {
  const currentDb = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = currentDb.transaction(PRACTICE_ATTEMPTS_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(PRACTICE_ATTEMPTS_STORE_NAME);
    const index = store.index('librarySongId');
    const request = index.openCursor(IDBKeyRange.only(librarySongId));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      } else {
        resolve(); // All matching entries deleted
      }
    };
    request.onerror = () => {
      console.error('Error deleting all practice attempts for song:', request.error);
      reject('Failed to delete all practice attempts for song.');
    };
  });
};

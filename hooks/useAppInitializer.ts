
/** Resolves one-time client init tasks (e.g., IndexedDB). No client API key required. */
import { useState, useEffect } from 'react';
import { initDB } from '../db';

export interface UseAppInitializerReturn {
  apiKeyMissing: boolean;
  initializationError: string | null;
  isInitializing: boolean;
  resolvedApiKey: string | null; // Added to store the actual key
}

export const useAppInitializer = (): UseAppInitializerReturn => {
  const [apiKeyMissing, setApiKeyMissing] = useState<boolean>(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [resolvedApiKey, setResolvedApiKey] = useState<string | null>(null);

  // API key now lives on the server; no client-side key is required.
  useEffect(() => {
    setApiKeyMissing(false);
    setResolvedApiKey(null);
  }, []);

  useEffect(() => {
    const initializeDatabase = async () => {
      // console.log('[useAppInitializer useEffect initDB] Initializing IndexedDB.');
      setIsInitializing(true); // Should be set before async operation
      try {
        await initDB();
        // console.log('[useAppInitializer useEffect initDB] IndexedDB initialized successfully.');
      } catch (dbError: any) {
        console.error("[useAppInitializer useEffect initDB] Failed to initialize IndexedDB:", dbError);
        setInitializationError(prevError => {
          const dbInitError = "Could not initialize song library.";
          return prevError && !prevError.includes(dbInitError) ? `${prevError} And ${dbInitError.toLowerCase()}` : dbInitError;
        });
      } finally {
        setIsInitializing(false);
      }
    };
    // Only initialize DB if API key is not missing or if we want DB to init regardless
    // For now, let's assume DB initialization can proceed even if API key is missing,
    // as the library view might still be useful.
    initializeDatabase();
  }, []); // Removed apiKeyMissing dependency for DB init, so it always tries

  return { apiKeyMissing, initializationError, isInitializing, resolvedApiKey };
};

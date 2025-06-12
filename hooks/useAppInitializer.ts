
import { useState, useEffect } from 'react';
import { initDB } from '../db';

export interface UseAppInitializerReturn {
  apiKeyMissing: boolean;
  initializationError: string | null;
  isInitializing: boolean;
  resolvedApiKey: string | null; // Added to store the actual key
}

export const useAppInitializer = (): UseAppInitializerReturn => {
  const [apiKeyMissing, setApiKeyMissing] = useState<boolean>(true); // Default to true
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [resolvedApiKey, setResolvedApiKey] = useState<string | null>(null);

  useEffect(() => {
    let keyAvailable = false;
    let keySource = "Unknown";
    let actualKey: string | null = null;

    try {
      // Check process.env.GEMINI_API_KEY
      if (typeof process !== 'undefined' && process.env && typeof process.env.GEMINI_API_KEY === 'string' && process.env.GEMINI_API_KEY.length > 0) {
        actualKey = process.env.GEMINI_API_KEY;
        keyAvailable = true;
        keySource = "process.env.GEMINI_API_KEY";
      }
      // Else, check process.env.API_KEY
      else if (typeof process !== 'undefined' && process.env && typeof process.env.API_KEY === 'string' && process.env.API_KEY.length > 0) {
        actualKey = process.env.API_KEY;
        keyAvailable = true;
        keySource = "process.env.API_KEY";
      }
      
      // Else, check import.meta.env.VITE_GEMINI_API_KEY (for Vite environments)
      // Ensure Vite client types are included in tsconfig.json (e.g., "types": ["vite/client"]) for proper import.meta.env typing
      if (!keyAvailable) {
        // Check if import.meta.env exists and has VITE_GEMINI_API_KEY
        // Using `as any` to avoid TypeScript errors if vite/client types aren't explicitly in tsconfig for the project this code is injected into.
        const viteEnv = (typeof import.meta !== 'undefined' && (import.meta as any).env) ? (import.meta as any).env : null;
        if (viteEnv && typeof viteEnv.VITE_GEMINI_API_KEY === 'string' && viteEnv.VITE_GEMINI_API_KEY.length > 0) {
          actualKey = viteEnv.VITE_GEMINI_API_KEY;
          keyAvailable = true;
          keySource = "import.meta.env.VITE_GEMINI_API_KEY";
        }
      }
    } catch (e) {
      console.warn("[useAppInitializer useEffect API_KEY] Error accessing environment variables for API Key:", e);
    }

    if (keyAvailable && actualKey) {
      setApiKeyMissing(false);
      setResolvedApiKey(actualKey);
      setInitializationError(null); // Clear any previous API key error if key is found
      console.log(`[useAppInitializer useEffect API_KEY] Gemini API Key found via ${keySource}.`);
    } else {
      setApiKeyMissing(true);
      setResolvedApiKey(null);
      setInitializationError("Gemini API Key is missing. This application cannot function without it. Ensure GEMINI_API_KEY, API_KEY, or VITE_GEMINI_API_KEY is set.");
      console.error("[useAppInitializer useEffect API_KEY] Gemini API Key is missing from all checked sources.");
    }
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

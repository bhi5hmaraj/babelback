
import { useState, useEffect } from 'react';
import { initDB } from '../db';

export interface UseAppInitializerReturn {
  apiKeyMissing: boolean;
  initializationError: string | null;
  isInitializing: boolean;
}

export const useAppInitializer = (): UseAppInitializerReturn => {
  const [apiKeyMissing, setApiKeyMissing] = useState<boolean>(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  useEffect(() => {
    // console.log('[useAppInitializer useEffect API_KEY] Checking for API Key.');
    let keyAvailable = false;
    let keySource = "Unknown";

    try {
      // Check process.env.GEMINI_API_KEY
      if (typeof process !== 'undefined' && process.env && typeof process.env.GEMINI_API_KEY === 'string' && process.env.GEMINI_API_KEY.length > 0) {
        keyAvailable = true;
        keySource = "process.env.GEMINI_API_KEY";
      }
      // Else, check process.env.API_KEY
      else if (typeof process !== 'undefined' && process.env && typeof process.env.API_KEY === 'string' && process.env.API_KEY.length > 0) {
        keyAvailable = true;
        keySource = "process.env.API_KEY";
      }
      // Else, check import.meta.env.VITE_GEMINI_API_KEY (for Vite environments)
      // Ensure Vite client types are included in tsconfig.json (e.g., "types": ["vite/client"]) for proper import.meta.env typing
      const viteEnv = (import.meta as any).env;
      if (!keyAvailable && viteEnv && typeof viteEnv.VITE_GEMINI_API_KEY === 'string' && viteEnv.VITE_GEMINI_API_KEY.length > 0) {
        keyAvailable = true;
        keySource = "import.meta.env.VITE_GEMINI_API_KEY";
      }
    } catch (e) {
      console.warn("[useAppInitializer useEffect API_KEY] Error accessing environment variables for API Key:", e);
    }

    if (!keyAvailable) {
      setApiKeyMissing(true);
      // The error message from Vercel was "Configuration Error: Gemini API Key is missing."
      // Let's use a similar one for consistency if this hook is the source.
      setInitializationError("Configuration Error: Gemini API Key is missing. This application cannot function without it.");
      console.error("[useAppInitializer useEffect API_KEY] Critical: Gemini API Key is missing. App functionality will be impaired.");
    } else {
      setApiKeyMissing(false);
      console.log(`[useAppInitializer useEffect API_KEY] Gemini API Key found via ${keySource}.`);
    }
  }, []);

  useEffect(() => {
    const initializeDatabase = async () => {
      // console.log('[useAppInitializer useEffect initDB] Initializing IndexedDB.');
      setIsInitializing(true);
      try {
        await initDB();
        // console.log('[useAppInitializer useEffect initDB] IndexedDB initialized successfully.');
      } catch (dbError: any) {
        console.error("[useAppInitializer useEffect initDB] Failed to initialize IndexedDB:", dbError);
        setInitializationError((prevError: string | null) => prevError ? `${prevError} And failed to initialize song library.` : "Could not initialize song library.");
      } finally {
        setIsInitializing(false);
      }
    };
    initializeDatabase();
  }, []);

  return { apiKeyMissing, initializationError, isInitializing };
};

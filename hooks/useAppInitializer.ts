
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
    try {
      if (typeof process !== 'undefined' && process.env && typeof process.env.API_KEY === 'string' && process.env.API_KEY.length > 0) {
        keyAvailable = true;
      }
    } catch (e) {
      console.warn("[useAppInitializer useEffect API_KEY] Could not access process.env.API_KEY", e);
    }
    if (!keyAvailable) {
      setApiKeyMissing(true);
      setInitializationError("Gemini API Key is missing. This application cannot function without it.");
      console.error("[useAppInitializer useEffect API_KEY] Gemini API Key is missing.");
    } else {
      setApiKeyMissing(false);
      // console.log("[useAppInitializer useEffect API_KEY] Gemini API Key found.");
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
        setInitializationError(prevError => prevError ? `${prevError} And failed to initialize song library.` : "Could not initialize song library.");
      } finally {
        setIsInitializing(false);
      }
    };
    initializeDatabase();
  }, []);

  return { apiKeyMissing, initializationError, isInitializing };
};

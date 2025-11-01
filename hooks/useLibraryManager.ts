
/** Loads and toggles the local song library (IndexedDB). */
import { useState, useEffect, useCallback } from 'react';
import { LibraryEntry } from '../types';
import { getAllSongsFromLibrary } from '../db';

export interface UseLibraryManagerReturn {
  libraryEntries: LibraryEntry[];
  showLibraryView: boolean;
  isLoadingLibrary: boolean;
  refreshLibrary: () => Promise<void>;
  toggleLibraryView: () => void;
  setLibraryEntries: React.Dispatch<React.SetStateAction<LibraryEntry[]>>; // Allow external update
}

export const useLibraryManager = (): UseLibraryManagerReturn => {
  const [libraryEntries, setLibraryEntries] = useState<LibraryEntry[]>([]);
  const [showLibraryView, setShowLibraryView] = useState<boolean>(false);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState<boolean>(true);

  const refreshLibrary = useCallback(async () => {
    // console.log('[useLibraryManager refreshLibrary] Refreshing library entries.');
    setIsLoadingLibrary(true);
    try {
      const entries = await getAllSongsFromLibrary();
      setLibraryEntries(entries);
      // console.log('[useLibraryManager refreshLibrary] Library refreshed. Entries count:', entries.length);
    } catch (dbError) {
      console.error("[useLibraryManager refreshLibrary] Failed to refresh library:", dbError);
      // Consider setting an error state here if needed by UI
    } finally {
      setIsLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  const toggleLibraryView = useCallback(() => {
    setShowLibraryView(prev => !prev);
  }, []);

  return { libraryEntries, showLibraryView, isLoadingLibrary, refreshLibrary, toggleLibraryView, setLibraryEntries };
};

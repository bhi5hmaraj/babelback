
import { useState, useCallback, useRef, useEffect } from 'react';
import { Language, SongData, LibraryEntry } from '../types';
import { SUPPORTED_LANGUAGES, AI_THOUGHTS_AND_JOKES } from '../constants';
import { fetchSongDataFromGemini } from '../services/geminiService';

export interface UseSongDataManagerProps {
  apiKeyMissing: boolean;
  refreshLibraryCallback: () => Promise<void>;
  practiceExitCallback: (resetGlobalConsent?: boolean) => void;
}

export interface SongProcessingResult {
  songData: SongData;
  processingTimeSeconds: number | undefined;
  songDuration: number | null;
}

export interface UseSongDataManagerReturn {
  audioFile: File | null;
  audioSrc: string | null;
  targetLanguage: Language;
  songData: SongData | null;
  isLoading: boolean;
  loadingMessage: string | null;
  funLoadingMessage: string;
  elapsedLoadingTime: number;
  error: string | null;
  isKaraokeMode: boolean;
  currentSongDurationRef: React.RefObject<number | null>;
  
  setAudioFile: React.Dispatch<React.SetStateAction<File | null>>;
  setAudioSrc: React.Dispatch<React.SetStateAction<string | null>>;
  setTargetLanguage: React.Dispatch<React.SetStateAction<Language>>;
  setSongData: React.Dispatch<React.SetStateAction<SongData | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsKaraokeMode: React.Dispatch<React.SetStateAction<boolean>>;

  handleAudioSubmit: (file: File) => Promise<SongProcessingResult | null>;
  handleLanguageChange: (newLanguage: Language) => Promise<SongProcessingResult | null>;
  handleKaraokeModeToggle: () => void;
  handleSongDurationAvailable: (duration: number) => void;
  loadSongFromLibraryEntry: (entry: LibraryEntry, audioPlayerRef: React.RefObject<HTMLAudioElement | null>) => void;
  clearCurrentSong: (audioPlayerRef: React.RefObject<HTMLAudioElement | null>) => void;
}

export const useSongDataManager = ({
  apiKeyMissing,
  refreshLibraryCallback,
  practiceExitCallback,
}: UseSongDataManagerProps): UseSongDataManagerReturn => {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState<Language>(SUPPORTED_LANGUAGES[0]);
  const [songData, setSongData] = useState<SongData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [funLoadingMessage, setFunLoadingMessage] = useState<string>('');
  const [elapsedLoadingTime, setElapsedLoadingTime] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isKaraokeMode, setIsKaraokeMode] = useState<boolean>(false);

  const processingStartTimeRef = useRef<number | null>(null);
  const currentSongDurationRef = useRef<number | null>(null);

  useEffect(() => {
    let funMessageIntervalId: NodeJS.Timeout | null = null;
    let timerIntervalId: NodeJS.Timeout | null = null;

    if (isLoading) {
      setFunLoadingMessage(AI_THOUGHTS_AND_JOKES[Math.floor(Math.random() * AI_THOUGHTS_AND_JOKES.length)]);
      funMessageIntervalId = setInterval(() => {
        setFunLoadingMessage(AI_THOUGHTS_AND_JOKES[Math.floor(Math.random() * AI_THOUGHTS_AND_JOKES.length)]);
      }, 3500);
      
      setElapsedLoadingTime(0);
      timerIntervalId = setInterval(() => {
        setElapsedLoadingTime(prevTime => prevTime + 1);
      }, 1000);
    } else {
      if (funMessageIntervalId) clearInterval(funMessageIntervalId);
      if (timerIntervalId) clearInterval(timerIntervalId);
      setFunLoadingMessage('');
    }
    return () => {
      if (funMessageIntervalId) clearInterval(funMessageIntervalId);
      if (timerIntervalId) clearInterval(timerIntervalId);
    };
  }, [isLoading]);

  const handleFetchSongDataInternal = useCallback(async (file: File, lang: Language, karaokeEnabled: boolean): Promise<SongProcessingResult | null> => {
    if (apiKeyMissing) return null;
    if (!file) return null;

    setIsLoading(true);
    setLoadingMessage("Initializing process...");
    setError(null);
    setSongData(null); // Clear previous song data
    processingStartTimeRef.current = Date.now();

    const onProgressUpdate = (message: string) => setLoadingMessage(message);

    try {
      const data = await fetchSongDataFromGemini(file, lang, karaokeEnabled, onProgressUpdate);
      const processingTimeSeconds = processingStartTimeRef.current ? (Date.now() - processingStartTimeRef.current) / 1000 : undefined;
      const durationToSave = currentSongDurationRef.current;

      if (data && (data.verses?.length > 0 || data.originalLanguage === "Instrumental")) {
        setSongData(data);
        if (data.originalLanguage === "Instrumental" && data.verses.length === 0) setError(null);
        
        // Library addition is now handled in App.tsx after this call resolves
        // but we need to await refreshLibraryCallback if it's called from here for consistency,
        // however, addSongToLibrary itself is not here anymore.
        // This simplifies the hook: it just fetches and sets data. App.tsx coordinates library.

      } else {
        const errorMsg = data?.verses?.length === 0 ? "AI found no lyrical verses. It might be instrumental." : "No valid song data received from AI.";
        setError(errorMsg);
        setSongData(data); // Set even if partial or just instrumental
      }
      // Ensure data is not null before constructing the result.
      // If data is null due to an early exit or major AI error, this part shouldn't be reached
      // or should handle 'data' being potentially null if AI could return null for SongData.
      // fetchSongDataFromGemini is typed to return SongData, so data should be SongData here.
      return { songData: data, processingTimeSeconds, songDuration: durationToSave };
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred.");
      setSongData(null);
      return null; // Indicate failure
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
      processingStartTimeRef.current = null;
    }
  }, [apiKeyMissing]);


  const handleAudioSubmit = useCallback(async (file: File): Promise<SongProcessingResult | null> => {
    // Player reset is handled in App.tsx
    setAudioFile(file);
    const newObjectUrl = URL.createObjectURL(file);
    setAudioSrc(newObjectUrl); // Old URL revoked in App.tsx's effect
    setSongData(null);
    // currentVerseIndex and playbackTime reset handled in App.tsx via playbackManager
    currentSongDurationRef.current = null;
    setError(null);
    practiceExitCallback(false);
    
    return handleFetchSongDataInternal(file, targetLanguage, isKaraokeMode);
  }, [targetLanguage, isKaraokeMode, practiceExitCallback, handleFetchSongDataInternal]);

  const handleLanguageChange = useCallback(async (newLanguage: Language): Promise<SongProcessingResult | null> => {
    setTargetLanguage(newLanguage);
    if (audioFile && !apiKeyMissing) {
      // Player reset handled in App.tsx
      setSongData(null);
      // currentVerseIndex and playbackTime reset handled in App.tsx
      setError(null);
      currentSongDurationRef.current = null;
      practiceExitCallback(false);
      return handleFetchSongDataInternal(audioFile, newLanguage, isKaraokeMode);
    }
    return null;
  }, [audioFile, apiKeyMissing, isKaraokeMode, practiceExitCallback, handleFetchSongDataInternal]);
  
  const handleKaraokeModeToggle = useCallback(() => {
    const newKaraokeMode = !isKaraokeMode;
    setIsKaraokeMode(newKaraokeMode);
    if (songData && audioFile) { // If a song is loaded
        setError("Karaoke mode changed. Re-process audio (e.g., change language or re-upload) for this setting to apply to the current song's detailed timings.");
    }
  }, [isKaraokeMode, songData, audioFile]);

  const handleSongDurationAvailable = useCallback((duration: number) => {
    currentSongDurationRef.current = duration;
  }, []);
  
  const loadSongFromLibraryEntry = useCallback((entry: LibraryEntry, audioPlayerRef: React.RefObject<HTMLAudioElement | null>) => {
    if (audioPlayerRef?.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }
    const loadedFile = new File([entry.audioFileBlob], entry.audioFileName, { type: entry.audioFileType });
    setAudioFile(loadedFile);
    const newObjectUrl = URL.createObjectURL(loadedFile);
    setAudioSrc(newObjectUrl); // Old URL revoked in App.tsx's effect
    setSongData(entry.songData);
    setTargetLanguage(entry.targetLanguage);
    currentSongDurationRef.current = entry.songDurationSeconds ?? null;
    const loadedSongHasKaraokeData = !!entry.songData.verses[0]?.transliterationSegments?.length;
    setIsKaraokeMode(loadedSongHasKaraokeData);
    setError(null);
    setIsLoading(false);
    practiceExitCallback(false);
  }, [practiceExitCallback]);

  const clearCurrentSong = useCallback((audioPlayerRef: React.RefObject<HTMLAudioElement | null>) => {
    if (audioPlayerRef?.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
    }
    setSongData(null);
    setAudioFile(null);
    // audioSrc revocation handled by App.tsx's useEffect on audioSrc change
    setAudioSrc(null); 
    currentSongDurationRef.current = null;
    practiceExitCallback(true); // Reset global consent as well
  }, [practiceExitCallback]);


  return {
    audioFile, setAudioFile,
    audioSrc, setAudioSrc,
    targetLanguage, setTargetLanguage,
    songData, setSongData,
    isLoading, setIsLoading,
    loadingMessage, 
    funLoadingMessage,
    elapsedLoadingTime,
    error, setError,
    isKaraokeMode, setIsKaraokeMode,
    currentSongDurationRef,
    handleAudioSubmit,
    handleLanguageChange,
    handleKaraokeModeToggle,
    handleSongDurationAvailable,
    loadSongFromLibraryEntry,
    clearCurrentSong,
  };
};

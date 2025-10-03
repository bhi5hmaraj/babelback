
import { useState, useCallback, useRef, useEffect } from 'react';
import { Language, SongData, LibraryEntry } from '../types';
import { SUPPORTED_LANGUAGES, AI_THOUGHTS_AND_JOKES } from '../constants';
import { fetchSongDataFromGemini, fetchSongDataFromUrl } from '../services/geminiService';

export interface UseSongDataManagerProps {
  apiKeyMissing: boolean;
  selectedModelId: string; // Added selectedModelId
  refreshLibraryCallback: () => Promise<void>;
  practiceExitCallback: (resetGlobalConsent?: boolean) => void;
}

export interface SongProcessingResult {
  songData: SongData;
  processingTimeSeconds: number | undefined;
  songDuration: number | null;
  modelIdUsed: string; // Added to result
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
  handleUrlAnalyze: (url: string, opts?: { fileName?: string; mimeType?: string }) => Promise<SongProcessingResult | null>;
  handleLanguageChange: (newLanguage: Language) => Promise<SongProcessingResult | null>;
  handleKaraokeModeToggle: () => void;
  handleSongDurationAvailable: (duration: number) => void;
  loadSongFromLibraryEntry: (entry: LibraryEntry, audioPlayerRef: React.RefObject<HTMLAudioElement | null>) => void;
  clearCurrentSong: (audioPlayerRef: React.RefObject<HTMLAudioElement | null>) => void;
}

export const useSongDataManager = ({
  apiKeyMissing,
  selectedModelId, // Destructure selectedModelId
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
    let funMessageIntervalId: number | null = null; 
    let timerIntervalId: number | null = null; 

    if (isLoading) {
      setFunLoadingMessage(AI_THOUGHTS_AND_JOKES[Math.floor(Math.random() * AI_THOUGHTS_AND_JOKES.length)]);
      funMessageIntervalId = window.setInterval(() => { 
        setFunLoadingMessage(AI_THOUGHTS_AND_JOKES[Math.floor(Math.random() * AI_THOUGHTS_AND_JOKES.length)]);
      }, 3500);
      
      setElapsedLoadingTime(0);
      timerIntervalId = window.setInterval(() => { 
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

  const handleFetchSongDataInternal = useCallback(async (file: File, lang: Language, karaokeEnabled: boolean, modelToUse: string): Promise<SongProcessingResult | null> => {
    if (apiKeyMissing) return null;
    if (!file) return null;
    if (!modelToUse) {
        setError("AI Model not selected. Please choose a model.");
        return null;
    }

    setIsLoading(true);
    setLoadingMessage("Initializing process...");
    setError(null);
    setSongData(null); 
    processingStartTimeRef.current = Date.now();

    const onProgressUpdate = (message: string) => setLoadingMessage(message);

    try {
      const data = await fetchSongDataFromGemini(file, lang, karaokeEnabled, modelToUse, onProgressUpdate);
      const processingTimeSeconds = processingStartTimeRef.current ? (Date.now() - processingStartTimeRef.current) / 1000 : undefined;
      const durationToSave = currentSongDurationRef.current;

      if (data && (data.verses?.length > 0 || data.originalLanguage === "Instrumental")) {
        setSongData(data);
        if (data.originalLanguage === "Instrumental" && data.verses.length === 0) setError(null);
      } else {
        const errorMsg = data?.verses?.length === 0 ? "AI found no lyrical verses. It might be instrumental." : "No valid song data received from AI.";
        setError(errorMsg);
        setSongData(data); 
      }
      return { songData: data, processingTimeSeconds, songDuration: durationToSave, modelIdUsed: modelToUse };
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred.");
      setSongData(null);
      return null; 
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
      processingStartTimeRef.current = null;
    }
  }, [apiKeyMissing]);


  const handleAudioSubmit = useCallback(async (file: File): Promise<SongProcessingResult | null> => {
    setAudioFile(file);
    const newObjectUrl = URL.createObjectURL(file);
    setAudioSrc(newObjectUrl); 
    setSongData(null);
    currentSongDurationRef.current = null;
    setError(null);
    practiceExitCallback(false);
    
    return handleFetchSongDataInternal(file, targetLanguage, isKaraokeMode, selectedModelId);
  }, [targetLanguage, isKaraokeMode, selectedModelId, practiceExitCallback, handleFetchSongDataInternal]);

  const handleLanguageChange = useCallback(async (newLanguage: Language): Promise<SongProcessingResult | null> => {
    setTargetLanguage(newLanguage);
    if (audioFile && !apiKeyMissing) {
      setSongData(null);
      setError(null);
      currentSongDurationRef.current = null; 
      practiceExitCallback(false);
      return handleFetchSongDataInternal(audioFile, newLanguage, isKaraokeMode, selectedModelId);
    }
    return null;
  }, [audioFile, apiKeyMissing, isKaraokeMode, selectedModelId, practiceExitCallback, handleFetchSongDataInternal]);

  const handleUrlAnalyze = useCallback(async (url: string, opts?: { fileName?: string; mimeType?: string }): Promise<SongProcessingResult | null> => {
    if (apiKeyMissing) return null;
    if (!url) return null;
    setAudioFile(null);
    setAudioSrc(url);
    setSongData(null);
    currentSongDurationRef.current = null;
    setError(null);
    practiceExitCallback(false);

    setIsLoading(true);
    setLoadingMessage('Initializing process...');
    processingStartTimeRef.current = Date.now();
    const onProgressUpdate = (m: string) => setLoadingMessage(m);
    try {
      const data = await fetchSongDataFromUrl(url, targetLanguage, isKaraokeMode, selectedModelId, { fileName: opts?.fileName, mimeType: opts?.mimeType }, onProgressUpdate);
      const processingTimeSeconds = processingStartTimeRef.current ? (Date.now() - processingStartTimeRef.current) / 1000 : undefined;
      const durationToSave = currentSongDurationRef.current;
      setSongData(data);
      if (data.originalLanguage === 'Instrumental' && data.verses.length === 0) setError(null);
      return { songData: data, processingTimeSeconds, songDuration: durationToSave, modelIdUsed: selectedModelId };
    } catch (e: any) {
      setError(e?.message || 'Failed to analyze URL');
      setSongData(null);
      return null;
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
      processingStartTimeRef.current = null;
    }
  }, [apiKeyMissing, targetLanguage, isKaraokeMode, selectedModelId, practiceExitCallback]);
  
  const handleKaraokeModeToggle = useCallback(() => {
    const newKaraokeMode = !isKaraokeMode;
    setIsKaraokeMode(newKaraokeMode);
    if (songData && audioFile) { 
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
    setAudioSrc(newObjectUrl); 
    setSongData(entry.songData);
    setTargetLanguage(entry.targetLanguage);
    currentSongDurationRef.current = entry.songDurationSeconds ?? null;
    const loadedSongHasKaraokeData = !!entry.songData.verses[0]?.transliterationSegments?.length;
    setIsKaraokeMode(loadedSongHasKaraokeData);
    setError(null);
    setIsLoading(false);
    practiceExitCallback(false);
    // Note: The selectedModelId in App.tsx is NOT changed here.
    // If the user wants to re-process this library song with a different model,
    // they would change the model in ModelSelector, then trigger re-processing (e.g., by changing language).
  }, [practiceExitCallback]);

  const clearCurrentSong = useCallback((audioPlayerRef: React.RefObject<HTMLAudioElement | null>) => {
    if (audioPlayerRef?.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
    }
    setSongData(null);
    setAudioFile(null);
    setAudioSrc(null); 
    currentSongDurationRef.current = null;
    practiceExitCallback(true); 
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
    handleUrlAnalyze,
    handleLanguageChange,
    handleKaraokeModeToggle,
    handleSongDurationAvailable,
    loadSongFromLibraryEntry,
    clearCurrentSong,
  };
};

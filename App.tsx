
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Language, SongData, Verse, PanelVisibility, LibraryEntry, PracticeModeStatus, SingingScore } from './types'; 
import { INITIAL_PANEL_VISIBILITY, AVAILABLE_MODELS, DEFAULT_MODEL_ID, AI_THOUGHTS_AND_JOKES } from './constants';
import AudioUpload from './components/AudioUpload';
import AudioPlayer from './components/AudioPlayer';
import LanguageSelector from './components/LanguageSelector';
import VerseDisplay from './components/VerseDisplay';
import LoadingSpinner from './components/LoadingSpinner';
import PanelToggle from './components/PanelToggle';
import KaraokeModeToggle from './components/KaraokeModeToggle';
import PracticeModeToggle from './components/PracticeModeToggle';
import EarphoneConsentModal from './components/EarphoneConsentModal';
import PracticeVersePanel from './components/PracticeVersePanel';
import Icon from './components/Icon';
import AboutBabelback from './components/AboutBabelback';
import LibraryView from './components/LibraryView';
import DeviceSelector from './components/DeviceSelector';
import ModelSelector from './components/ModelSelector'; 
import YouTubeDownloader from './components/YouTubeDownloader';
import YouTubeInput from './components/YouTubeInput';
import RecordingInfoBanner from './components/RecordingInfoBanner';
import AboutPage from './components/AboutPage';
import TechDetailsPage from './components/TechDetailsPage';
import ChangelogPage from './components/ChangelogPage'; // Import ChangelogPage
import { trackEvent } from './services/analytics';
import { addSongToLibrary, deleteSongFromLibrary, deleteAllPracticeAttemptsForSongFromDB } from './db';
import { useSingingPractice, UseSingingPracticeReturn } from './hooks/useSingingPractice'; 
import { initializeAiClient } from './services/geminiService'; // Import AI client initializer

import { useAppInitializer } from './hooks/useAppInitializer';
import { useLibraryManager } from './hooks/useLibraryManager';
import { useSongDataManager, type SongProcessingResult } from './hooks/useSongDataManager';
import { useAudioPlaybackManager } from './hooks/useAudioPlaybackManager';
import { useDeviceManager } from './hooks/useDeviceManager';
import TabsBar from './components/TabsBar';
import PlayerBar from './components/PlayerBar';

type CurrentAppPage = 'main' | 'about' | 'techDetails' | 'changelog'; // Add 'changelog'

const App: React.FC = () => {
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [activeTab, setActiveTab] = useState<'setup' | 'lyrics' | 'meaning' | 'practice' | 'library'>('setup');
  const [headerCollapsed, setHeaderCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  const [currentPage, setCurrentPage] = useState<CurrentAppPage>('main');
  const [currentLibraryEntryId, setCurrentLibraryEntryId] = useState<number | null>(null);
  const [panelVisibility, setPanelVisibility] = useState<PanelVisibility>(INITIAL_PANEL_VISIBILITY);
  const [isPracticeModeGloballyEnabled, setIsPracticeModeGloballyEnabled] = useState<boolean>(false);
  const [globalHasEarphoneConsent, setGlobalHasEarphoneConsent] = useState<boolean>(false);
  const [showRecordingHelpBanner, setShowRecordingHelpBanner] = useState<boolean>(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [showDeviceConfig, setShowDeviceConfig] = useState<boolean>(false);
  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [sourceMode, setSourceMode] = useState<'file' | 'youtube'>('youtube');
  const [selectedLocalFile, setSelectedLocalFile] = useState<File | null>(null);
  const [ytUrl, setYtUrl] = useState('');
  const [ytFormat, setYtFormat] = useState<'m4a' | 'mp3'>('m4a');
  const [ytWorking, setYtWorking] = useState(false);
  const [ytFun, setYtFun] = useState('');


  // --- Core Hooks ---
  const { apiKeyMissing, initializationError: rawInitializationError, isInitializing: isAppInitializing, resolvedApiKey } = useAppInitializer();

  // Initialize AI Client once resolvedApiKey is available
  useEffect(() => {
    // Server handles Gemini calls now; client initialization is a no-op.
    initializeAiClient('');
  }, []);

  useEffect(() => {
    trackEvent('model_change', { model: selectedModelId })
  }, [selectedModelId])

  const deviceManager = useDeviceManager();
  const {
    inputDevices, outputDevices,
    selectedInputDeviceId, selectedOutputDeviceId,
    deviceError: rawDeviceError, isLoadingDevices,
    permissionGranted: devicePermissionGranted,
    setSelectedInputDeviceId, setSelectedOutputDeviceId,
    requestDevicePermissions
  } = deviceManager;

  const {
    libraryEntries,
    isLoadingLibrary,
    refreshLibrary,
  } = useLibraryManager();

  const singingPracticeHooksRef = useRef<UseSingingPracticeReturn | null>(null);

  const songManager = useSongDataManager({
    apiKeyMissing, // Pass apiKeyMissing status
    selectedModelId, 
    refreshLibraryCallback: refreshLibrary,
    practiceExitCallback: (resetGlobalConsent?: boolean) => {
        singingPracticeHooksRef.current?.exitPractice(resetGlobalConsent);
    },
  });

  const {
    audioFile, audioSrc, targetLanguage, songData, isLoading: isLoadingSongData, loadingMessage,
    funLoadingMessage, elapsedLoadingTime, analysisProgressPercent, error: songProcessingError, isKaraokeMode,
    currentSongDurationRef,
    handleAudioSubmit: smHandleAudioSubmit,
    handleUrlAnalyze: smHandleUrlAnalyze,
    handleLanguageChange: smHandleLanguageChange,
    handleKaraokeModeToggle: smHandleKaraokeModeToggle,
    handleSongDurationAvailable: smHandleSongDurationAvailable,
    loadSongFromLibraryEntry: smLoadSongFromLibraryEntry,
    clearCurrentSong: smClearCurrentSong,
  } = songManager;

  const playbackManager = useAudioPlaybackManager({ songData, audioPlayerRef });
  const {
    currentVerseIndex, playbackTime, handleTimeUpdate, seekToVerse,
    handleNextVerse, handlePrevVerse, setCurrentVerseIndex, setPlaybackTime
  } = playbackManager;

  const singingPractice = useSingingPractice({
    songData: songData,
    targetLanguage: targetLanguage,
    currentVerseIndex: currentVerseIndex,
    audioPlayerRef,
    currentSongDurationRef: currentSongDurationRef,
    initialHasEarphoneConsent: globalHasEarphoneConsent,
    onEarphoneConsentGlobalUpdate: setGlobalHasEarphoneConsent,
    isKaraokeMode: isKaraokeMode,
    selectedInputDeviceId, 
    playbackTime: playbackTime,
    currentLibrarySongId: currentLibraryEntryId,
    selectedModelId, 
  });

  useEffect(() => {
    singingPracticeHooksRef.current = singingPractice;
  }, [singingPractice]);

  useEffect(() => {
    if (rawInitializationError) {
      setAppError(rawInitializationError);
    } else if (songProcessingError) {
      setAppError(songProcessingError);
    } else if (rawDeviceError && !rawDeviceError.includes("Microphone permission not granted")) {
      // Only set device error as appError if it's NOT the specific permission informational message.
      setAppError(rawDeviceError);
    } else if (!rawInitializationError && !songProcessingError && (!rawDeviceError || rawDeviceError.includes("Microphone permission not granted"))) {
      // If other errors are clear, and deviceError is either null or just the permission info, clear appError.
      setAppError(null);
    }
  }, [rawInitializationError, songProcessingError, rawDeviceError]);
  
  useEffect(() => {
    if (devicePermissionGranted || !showDeviceConfig) {
      // If permission is now granted, or device config is hidden,
      // and the current appError was specifically the "permission not granted" message, clear it.
      if (appError && appError.includes("Microphone permission not granted")) {
        setAppError(null);
      }
    }
  }, [devicePermissionGranted, showDeviceConfig, appError]);

  useEffect(() => {
    if (singingPractice.practiceVerseStatus === PracticeModeStatus.RECORDING) {
      setShowRecordingHelpBanner(true);
    } else {
      setShowRecordingHelpBanner(false);
    }
  }, [singingPractice.practiceVerseStatus]);

  useEffect(() => {
    if (!audioSrc) return;
    const isMobile = typeof window !== 'undefined' ? window.innerWidth < 640 : true;
    if (!isMobile) return;
    if (playbackTime > 0 || activeTab !== 'setup') {
      setHeaderCollapsed(true);
    }
  }, [audioSrc, playbackTime, activeTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      if (window.innerWidth >= 640) {
        setHeaderCollapsed(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const prevSelectedModelIdRef = useRef(selectedModelId);
  useEffect(() => {
    if (prevSelectedModelIdRef.current !== selectedModelId && audioFile && !isLoadingSongData) {
      console.log(`Model changed from ${prevSelectedModelIdRef.current} to ${selectedModelId}. Re-processing current song.`);
      handleLanguageChange(targetLanguage); 
    }
    prevSelectedModelIdRef.current = selectedModelId;
  }, [selectedModelId, audioFile, targetLanguage, isLoadingSongData, smHandleLanguageChange]);


  const handlePanelToggle = useCallback((panel: keyof PanelVisibility) => {
    setPanelVisibility(prev => ({ ...prev, [panel]: !prev[panel] }));
  }, []);

  const toggleDeviceConfig = () => setShowDeviceConfig(prev => !prev);

  const handleAudioSubmit = async (file: File) => {
    if (apiKeyMissing) {
      setAppError(rawInitializationError || "Cannot process audio: API Key is missing.");
      return;
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }
    setCurrentVerseIndex(0);
    setPlaybackTime(0);
    setCurrentLibraryEntryId(null);
    const result: SongProcessingResult | null = await smHandleAudioSubmit(file);
    if (result && result.songData && result.modelIdUsed) {
       const newLibraryEntry: Omit<LibraryEntry, 'id'> = {
          title: result.songData.title || file.name,
          originalLanguage: result.songData.originalLanguage,
          targetLanguage: targetLanguage, 
          timestamp: Date.now(),
          audioFileBlob: file,
          audioFileName: file.name,
          audioFileType: file.type,
          songData: result.songData,
          processingTimeSeconds: result.processingTimeSeconds ? parseFloat(result.processingTimeSeconds.toFixed(1)) : undefined,
          songDurationSeconds: result.songDuration ? parseFloat(result.songDuration.toFixed(1)) : undefined,
          modelIdUsed: result.modelIdUsed,
        };
        try {
            const newId = await addSongToLibrary(newLibraryEntry);
            setCurrentLibraryEntryId(newId);
            await refreshLibrary();
            setActiveTab('lyrics');
            setHeaderCollapsed(true);
        } catch (dbError) {
            console.error("[App.tsx handleAudioSubmit] Failed to add to library:", dbError);
            setAppError( (prevError) => (prevError ? prevError + " " : "") + "Failed to save song to library.");
        }
    }
  };

  const handleLanguageChange = async (newLanguage: Language) => {
    if (apiKeyMissing) {
      setAppError(rawInitializationError || "Cannot process language change: API Key is missing.");
      return;
    }
    if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
    }
    setCurrentVerseIndex(0);
    setPlaybackTime(0);
    setCurrentLibraryEntryId(null); 
    const result: SongProcessingResult | null = await smHandleLanguageChange(newLanguage);
     if (result && result.songData && audioFile && result.modelIdUsed) { 
       const newLibraryEntry: Omit<LibraryEntry, 'id'> = {
          title: result.songData.title || audioFile.name,
          originalLanguage: result.songData.originalLanguage,
          targetLanguage: newLanguage,
          timestamp: Date.now(),
          audioFileBlob: audioFile,
          audioFileName: audioFile.name,
          audioFileType: audioFile.type,
          songData: result.songData,
          processingTimeSeconds: result.processingTimeSeconds ? parseFloat(result.processingTimeSeconds.toFixed(1)) : undefined,
          songDurationSeconds: result.songDuration ? parseFloat(result.songDuration.toFixed(1)) : undefined,
          modelIdUsed: result.modelIdUsed, 
        };
        try {
            const newId = await addSongToLibrary(newLibraryEntry);
            setCurrentLibraryEntryId(newId); 
            await refreshLibrary();
        } catch (dbError) {
            console.error("[App.tsx handleLanguageChange] Failed to add to library:", dbError);
            setAppError( (prevError) => (prevError ? prevError + " " : "") + "Failed to save re-processed song to library.");
        }
    }
  };

  const handleKaraokeModeToggleApp = () => {
    smHandleKaraokeModeToggle();
  };

  const handleLoadSongFromLibrary = (entry: LibraryEntry) => {
    smLoadSongFromLibraryEntry(entry, audioPlayerRef);
    setCurrentVerseIndex(0);
    setPlaybackTime(0);
    setCurrentLibraryEntryId(entry.id);
    setSelectedModelId(entry.modelIdUsed || DEFAULT_MODEL_ID); 
    setCurrentPage('main');
    setActiveTab('lyrics');
    setHeaderCollapsed(true);
  };

  const handleDeleteSongFromLibrary = async (id: number) => {
    if (window.confirm("Delete this song and its practice history from library?")) {
      try {
        const entryToDelete = libraryEntries.find(entry => entry.id === id);
        await deleteSongFromLibrary(id);
        await deleteAllPracticeAttemptsForSongFromDB(id);
        await refreshLibrary();

        if (songData && entryToDelete && audioFile && entryToDelete.audioFileName === audioFile.name && entryToDelete.targetLanguage === targetLanguage && entryToDelete.modelIdUsed === selectedModelId) {
             smClearCurrentSong(audioPlayerRef);
             setCurrentVerseIndex(0);
             setPlaybackTime(0);
             setCurrentLibraryEntryId(null);
        } else if (currentLibraryEntryId === id) { 
             smClearCurrentSong(audioPlayerRef);
             setCurrentVerseIndex(0);
             setPlaybackTime(0);
             setCurrentLibraryEntryId(null);
        }
      } catch (dbError) {
        console.error("[App.tsx handleDeleteSongFromLibrary] Failed to delete song:", dbError);
        setAppError("Failed to delete song from library.");
      }
    }
  };

  const handlePracticeModeGlobalToggle = async () => {
    if (!isPracticeModeGloballyEnabled) { 
      let hasPermission = devicePermissionGranted;
      if (!hasPermission) {
        hasPermission = await requestDevicePermissions();
      }
      if (hasPermission && selectedInputDeviceId) {
        setAppError(null); 
        setIsPracticeModeGloballyEnabled(true);
      } else {
        setAppError(rawDeviceError || "Microphone access and a selected input device are required for Practice Mode. Please grant permission and check device settings.");
        setIsPracticeModeGloballyEnabled(false); 
      }
    } else { 
      setIsPracticeModeGloballyEnabled(false);
      singingPracticeHooksRef.current?.exitPractice(true); 
    }
  };
  
  const handleInitiatePracticeForVerse = async (verse: Verse) => {
    if (apiKeyMissing) {
      setAppError(rawInitializationError || "Cannot start practice: API Key is missing.");
      return;
    }
    let hasPermission = devicePermissionGranted;
    if (!hasPermission) {
      hasPermission = await requestDevicePermissions();
    }
  
    if (hasPermission && selectedInputDeviceId) {
      setAppError(null);
      singingPracticeHooksRef.current?.initiatePracticeForVerse(verse);
    } else {
      setAppError(rawDeviceError || "Microphone access and a selected input device are required to practice this verse. Please grant permission and check device settings.");
    }
  };


  useEffect(() => {
    const currentAudioSrcRevoke = audioSrc;
    return () => {
      if (currentAudioSrcRevoke && currentAudioSrcRevoke.startsWith('blob:')) {
        URL.revokeObjectURL(currentAudioSrcRevoke);
      }
    };
  }, [audioSrc]);

  const handleNavigate = (page: CurrentAppPage) => {
    if (page !== 'main' && audioPlayerRef.current && !audioPlayerRef.current.paused) {
      audioPlayerRef.current.pause();
    }
    if (page !== 'main' && singingPractice.practiceVerseStatus !== PracticeModeStatus.IDLE) {
      singingPracticeHooksRef.current?.exitPractice(false);
    }
    setCurrentPage(page);
  };


  const currentVerseData: Verse | undefined = songData?.verses[currentVerseIndex];

  if (isAppInitializing || (isLoadingLibrary && libraryEntries.length === 0 && currentPage === 'main')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900 text-slate-100 p-4 md:p-8 flex flex-col items-center justify-center">
        <LoadingSpinner message="Preparing Babelback for you..." />
      </div>
    );
  }

  const isPracticeActive = singingPractice.activePracticeVerses.length > 0 &&
                           singingPractice.practiceVerseStatus !== PracticeModeStatus.IDLE &&
                           singingPractice.practiceVerseStatus !== PracticeModeStatus.CONSENT_GIVEN;

  const globalIsLoading = isLoadingSongData || isLoadingDevices || isAppInitializing || ytWorking;

  const mainContentMaxWidth = currentPage === 'main' && songData ? 'max-w-4xl' : 'max-w-3xl'; // Adjusted for changelog

  const renderSetupPane = () => (
    <section className={`w-full ${mainContentMaxWidth} bg-slate-800/70 backdrop-blur-md p-5 md:p-8 rounded-xl shadow-2xl mt-6`}>
      {!songData && !audioFile && !isLoadingSongData && (
        <div className="mb-6">
          <AboutBabelback />
        </div>
      )}

      <button
        onClick={toggleDeviceConfig}
        className="w-full mb-3 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-sky-300 rounded-md transition-colors text-sm flex items-center justify-center disabled:opacity-50"
        disabled={globalIsLoading || isPracticeActive}
      >
        <Icon name={showDeviceConfig ? 'gear-six-slash' : 'gear-six'} weight="bold" className="mr-2" />
        {showDeviceConfig ? 'Hide Audio Settings' : 'Show Audio Settings'}
      </button>

      {showDeviceConfig && (
        <DeviceSelector
          inputDevices={inputDevices}
          outputDevices={outputDevices}
          selectedInputDeviceId={selectedInputDeviceId}
          selectedOutputDeviceId={selectedOutputDeviceId}
          onSelectInputDevice={setSelectedInputDeviceId}
          onSelectOutputDevice={setSelectedOutputDeviceId}
          onRequestPermissions={requestDevicePermissions}
          permissionGranted={devicePermissionGranted}
          isLoading={isLoadingDevices}
          disabled={globalIsLoading || isPracticeActive}
          error={rawDeviceError}
        />
      )}

      <div className="text-sm text-slate-300 font-semibold mt-5 mb-1">1. Choose Source</div>
      <div className="w-full mb-3 flex items-center justify-center gap-2">
        <button
          onClick={() => setSourceMode('file')}
          className={`px-3 py-1.5 rounded-md text-xs ${sourceMode === 'file' ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
        >From File</button>
        <button
          onClick={() => setSourceMode('youtube')}
          className={`px-3 py-1.5 rounded-md text-xs ${sourceMode === 'youtube' ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
        >From YouTube</button>
      </div>
      {sourceMode === 'youtube' ? (
        <YouTubeInput youtubeUrl={ytUrl} setYoutubeUrl={setYtUrl} audioFormat={ytFormat} setAudioFormat={setYtFormat} />
      ) : (
        <AudioUpload pickerOnly onFileSelected={setSelectedLocalFile} isLoading={isLoadingSongData} disabled={globalIsLoading || isPracticeActive || apiKeyMissing} />
      )}

      <div className="text-sm text-slate-300 font-semibold mt-5 mb-1">2. AI Model</div>
      <ModelSelector
        selectedModelId={selectedModelId}
        onModelChange={setSelectedModelId}
        disabled={globalIsLoading || isPracticeActive}
      />

      <div className="text-sm text-slate-300 font-semibold mt-5 mb-1">3. Translate Target Language</div>
      <LanguageSelector
        selectedLanguage={targetLanguage}
        onLanguageChange={handleLanguageChange}
        disabled={globalIsLoading || isPracticeActive || apiKeyMissing}
      />

      <div className="text-sm text-slate-300 font-semibold mt-5 mb-1">4. Modes</div>
      <KaraokeModeToggle
        isKaraokeMode={isKaraokeMode}
        onToggle={handleKaraokeModeToggleApp}
        disabled={globalIsLoading || isPracticeActive || apiKeyMissing}
      />
      <PracticeModeToggle
        isPracticeModeEnabled={isPracticeModeGloballyEnabled}
        onToggle={handlePracticeModeGlobalToggle}
        disabled={
          globalIsLoading ||
          isPracticeActive ||
          !songData ||
          !songData.verses ||
          songData.verses.length === 0 ||
          !currentLibraryEntryId ||
          (!selectedInputDeviceId && !devicePermissionGranted) ||
          apiKeyMissing
        }
      />

      <div className="mt-6 flex items-center justify-center">
        <button
          className="px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow flex items-center"
          disabled={globalIsLoading || isLoadingSongData || isPracticeActive || apiKeyMissing}
          onClick={async () => {
            try {
              if (sourceMode === 'file') {
                if (!selectedLocalFile) { setAppError('Please choose an audio file.'); return; }
                await handleAudioSubmit(selectedLocalFile);
              } else {
                if (!ytUrl || !/^https?:\/\//i.test(ytUrl)) { setAppError('Please paste a valid YouTube URL.'); return; }
                setAppError(null);
                setYtWorking(true);
                const jokes = AI_THOUGHTS_AND_JOKES;
                let i = 0;
                const interval = window.setInterval(() => { setYtFun(jokes[i++ % jokes.length]); }, 2500);
                try {
                  const { startDownload, getDownloadStatus } = await import('./services/downloadsService');
                  const start = await startDownload(ytUrl, ytFormat);
                  let status = await getDownloadStatus(start.jobId);
                  const t0 = Date.now();
                  while (status.status !== 'completed' && status.status !== 'failed' && Date.now() - t0 < 15 * 60 * 1000) {
                    await new Promise((r) => setTimeout(r, 2000));
                    status = await getDownloadStatus(start.jobId);
                  }
                  if (status.status !== 'completed' || !status.url) { setAppError('Failed to process YouTube audio.'); return; }
                  setYtWorking(false);
                  setYtFun('');
                  const result = await smHandleUrlAnalyze(status.url, { fileName: status.gcsObject?.path?.split('/')?.pop(), mimeType: status.gcsObject?.contentType, jobId: start.jobId });
                  if (result && result.songData) {
                    try {
                      const resp = await fetch(`/api/proxy?url=${encodeURIComponent(status.url)}`);
                      const buf = await resp.arrayBuffer();
                      const blob = new Blob([buf], { type: status.gcsObject?.contentType || 'audio/mpeg' });
                      const fileName = status.gcsObject?.path?.split('/')?.pop() || 'downloaded-audio';
                      const file = new File([blob], fileName, { type: blob.type });
                      const newLibraryEntry: Omit<LibraryEntry, 'id'> = {
                        title: result.songData.title || fileName,
                        originalLanguage: result.songData.originalLanguage,
                        targetLanguage: targetLanguage,
                        timestamp: Date.now(),
                        audioFileBlob: file,
                        audioFileName: file.name,
                        audioFileType: file.type,
                        songData: result.songData,
                        processingTimeSeconds: result.processingTimeSeconds ? parseFloat(result.processingTimeSeconds.toFixed(1)) : undefined,
                        songDurationSeconds: result.songDuration ? parseFloat((result.songDuration || 0).toFixed(1)) : undefined,
                        modelIdUsed: result.modelIdUsed,
                      };
                      const newId = await addSongToLibrary(newLibraryEntry);
                      setCurrentLibraryEntryId(newId);
                      await refreshLibrary();
                      setActiveTab('lyrics');
                      setHeaderCollapsed(true);
                    } catch (e) {
                      console.error('[AnalyzeFromUrl] failed to cache in library', e);
                    }
                  }
                } finally {
                  window.clearInterval(interval);
                  setYtWorking(false);
                  setYtFun('');
                }
              }
            } catch (e) {
              setAppError(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          <Icon name="sparkle" className="mr-2" /> Babelback
        </button>
      </div>
    </section>
  );

  const renderLyricsPane = () => {
    if (!songData) {
      return (
        <section className={`w-full ${mainContentMaxWidth} bg-slate-800/70 backdrop-blur-md p-6 rounded-xl shadow-2xl mt-6 text-center text-slate-300`}>
          <Icon name="music-notes-simple" weight="bold" size="2xl" className="mb-3 text-sky-400" />
          <p className="text-lg">Process a song to explore synchronized lyrics.</p>
          <p className="text-xs mt-2">Upload audio from the Setup tab or fetch from YouTube.</p>
        </section>
      );
    }

    const verse = currentVerseData;
    const isInstrumental = songData.originalLanguage === 'Instrumental' && songData.verses.length === 0;

    return (
      <section className={`w-full ${mainContentMaxWidth} p-2 mt-2`}>
        <div className="mb-4 text-center">
          <h2 className="text-2xl font-semibold text-sky-300">{songData.title || (audioFile ? audioFile.name : 'Uploaded Track')}</h2>
          {songData.originalLanguage && <p className="text-sm text-slate-400">(Original Lyrics: {songData.originalLanguage})</p>}
        </div>

        {isInstrumental ? (
          <div className="text-center py-6 text-slate-300">
            <Icon name="speaker-simple-slash" weight="bold" size="2xl" className="mb-3 text-sky-400" />
            <p className="text-lg">This track appears to be instrumental.</p>
            <p className="text-xs mt-1">No lyrical verses found.</p>
          </div>
        ) : (
          <>
            <PanelToggle panelVisibility={panelVisibility} onToggle={handlePanelToggle} />
            {verse && (
              <VerseDisplay
                verse={verse}
                targetLanguage={targetLanguage}
                originalLanguageLabel={songData.originalLanguage}
                panelVisibility={panelVisibility}
                currentTime={playbackTime}
                isKaraokeMode={isKaraokeMode}
                onLyricAreaFocus={() => setHeaderCollapsed(true)}
                onLyricAreaScrollUp={() => setHeaderCollapsed(false)}
              />
            )}
            {isPracticeModeGloballyEnabled && songData.verses.length > 0 && songData.originalLanguage !== 'Instrumental' && verse && (
              <button
                onClick={() => handleInitiatePracticeForVerse(verse)}
                className="mt-4 w-full px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors text-sm flex items-center justify-center disabled:bg-slate-500 disabled:opacity-70"
                disabled={
                  globalIsLoading ||
                  isPracticeActive ||
                  !audioPlayerRef.current ||
                  !currentSongDurationRef.current ||
                  currentSongDurationRef.current <= 0 ||
                  (!selectedInputDeviceId && !devicePermissionGranted) ||
                  !currentLibraryEntryId ||
                  apiKeyMissing
                }
              >
                <Icon name="waveform" weight="bold" className="mr-2" /> Practice this Verse
              </button>
            )}
          </>
        )}
      </section>
    );
  };

  const renderMeaningPane = () => {
    if (!songData) {
      return (
        <section className={`w-full ${mainContentMaxWidth} bg-slate-800/70 backdrop-blur-md p-6 rounded-xl shadow-2xl mt-6 text-center text-slate-300`}>
          <Icon name="book-open" weight="bold" size="2xl" className="mb-3 text-sky-400" />
          <p className="text-lg">Process a song to view summaries and analysis.</p>
        </section>
      );
    }

    return (
      <section className={`w-full ${mainContentMaxWidth} bg-slate-800/70 backdrop-blur-md p-5 md:p-8 rounded-xl shadow-2xl mt-6`}>
        <div className="mb-4 text-center">
          <h2 className="text-2xl font-semibold text-sky-300">{songData.title || (audioFile ? audioFile.name : 'Track')}</h2>
          {songData.originalLanguage && <p className="text-sm text-slate-400">(Original Lyrics: {songData.originalLanguage})</p>}
        </div>

        {songData.summary && (
          <div className="my-4 p-4 bg-slate-700/60 backdrop-blur-sm rounded-lg shadow">
            <h3 className="text-md font-semibold text-sky-400 mb-2 flex items.center"><Icon name="info" weight="bold" className="mr-2" /> Song Summary</h3>
            <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{songData.summary}</p>
          </div>
        )}

        {songData.detailedAnalysis && (
          <div className="my-4 p-4 bg-slate-700/60 backdrop-blur-sm rounded-lg shadow">
            <h3 className="text-md font-semibold text-teal-400 mb-2 flex items-center"><Icon name="chart-line" weight="bold" className="mr-2" /> Detailed Analysis</h3>
            <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{songData.detailedAnalysis}</p>
          </div>
        )}

        {!songData.summary && !songData.detailedAnalysis && (
          <div className="text-center py-6 text-slate-300">No analysis available for this song yet.</div>
        )}
      </section>
    );
  };

  const renderPracticePane = () => {
    if (!songData) {
      return (
        <section className={`w-full ${mainContentMaxWidth} bg-slate-800/70 backdrop-blur-md p-6 rounded-xl shadow-2xl mt-6 text-center text-slate-300`}>
          <Icon name="microphone" weight="bold" size="2xl" className="mb-3 text-sky-400" />
          <p className="text-lg">Process a song and enable Practice Mode in Setup to begin.</p>
        </section>
      );
    }

    if (!isPracticeModeGloballyEnabled) {
      return (
        <section className={`w-full ${mainContentMaxWidth} bg-slate-800/70 backdrop-blur-md p-6 rounded-xl shadow-2xl mt-6 text-center text-slate-300`}>
          <Icon name="headset" weight="bold" size="2xl" className="mb-3 text-sky-400" />
          <p className="text-lg">Turn on Practice Mode in Setup and grant microphone access.</p>
          <p className="text-xs mt-2">Once enabled, start practice from Lyrics or from this tab.</p>
        </section>
      );
    }

    return (
      <section className={`w-full ${mainContentMaxWidth} bg-slate-800/70 backdrop-blur-md p-5 md:p-8 rounded-xl shadow-2xl mt-6`}>
        {isPracticeActive ? (
          <PracticeVersePanel
            practiceTargetVerses={singingPractice.activePracticeVerses}
            status={singingPractice.practiceVerseStatus}
            score={singingPractice.practiceScore}
            error={singingPractice.practiceError}
            recordedAudioUrl={singingPractice.userPracticeAudioUrl}
            onStartRecording={singingPracticeHooksRef.current.startRecording}
            onStopRecording={singingPracticeHooksRef.current.stopRecording}
            onTryAgain={singingPracticeHooksRef.current.tryAgainPractice}
            onSubmitForScoring={singingPracticeHooksRef.current.submitForScoring}
            onExit={() => singingPracticeHooksRef.current.exitPractice(false)}
            currentTimeForHighlight={playbackTime}
            isKaraokeModeEnabled={isKaraokeMode}
            recordingFormattedTime={singingPractice.recordingFormattedTime}
            originalSongDataForDisplay={songData}
          />
        ) : (
          <div className="text-center text-slate-300 py-10">
            <Icon name="waveform" weight="bold" size="2xl" className="mb-3 text-sky-400" />
            <p className="text-lg">Pick a verse from Lyrics and tap “Practice this Verse.”</p>
            <p className="text-xs mt-2">You can also start recording from this tab once a verse is selected.</p>
          </div>
        )}
      </section>
    );
  };

  const renderLibraryPane = () => (
    <section className="w-full max-w-3xl bg-slate-800/70 backdrop-blur-md p-5 md:p-8 rounded-xl shadow-2xl mt-6">
      {isLoadingLibrary && libraryEntries.length === 0 ? (
        <LoadingSpinner message="Loading library..." />
      ) : (
        <LibraryView
          entries={libraryEntries}
          onLoadSong={handleLoadSongFromLibrary}
          onDeleteSong={handleDeleteSongFromLibrary}
          currentPlayingLibraryId={currentLibraryEntryId}
        />
      )}
    </section>
  );

  const renderMainTabs = () => {
    let content: JSX.Element | null;
    switch (activeTab) {
      case 'setup':
        content = renderSetupPane();
        break;
      case 'lyrics':
        content = renderLyricsPane();
        break;
      case 'meaning':
        content = renderMeaningPane();
        break;
      case 'practice':
        content = renderPracticePane();
        break;
      case 'library':
        content = renderLibraryPane();
        break;
      default:
        content = renderSetupPane();
        break;
    }

    if (!content) return null;

    if (apiKeyMissing) {
      return (
        <div className="w-full flex flex-col items-center gap-3">
          <div className="w-full max-w-3xl my-3 p-4 bg-red-800/80 border border-red-600 text-red-100 rounded-lg shadow text-center">
            <Icon name="warning-octagon" weight="bold" className="inline-block mr-2 text-red-300" size="lg" />
            <strong>Configuration Error:</strong> {appError || 'Gemini API Key is missing or invalid.'}
          </div>
          {content}
        </div>
      );
    }

    return content;
  };

  const infoPageClass = 'w-full max-w-4xl bg-slate-800/70 backdrop-blur-md p-5 md:p-8 rounded-xl shadow-2xl mt-6';

  const renderPageContent = () => {
    if (currentPage === 'about') {
      return <div className={infoPageClass}><AboutPage onNavigateBack={() => handleNavigate('main')} /></div>;
    }
    if (currentPage === 'techDetails') {
      return <div className={infoPageClass}><TechDetailsPage onNavigateBack={() => handleNavigate('main')} /></div>;
    }
    if (currentPage === 'changelog') {
      return <div className={infoPageClass}><ChangelogPage onNavigateBack={() => handleNavigate('main')} /></div>;
    }
    return renderMainTabs();
  };

  const mainPaneScrollClass = currentPage === 'main' && activeTab === 'lyrics'
    ? 'overflow-y-hidden'
    : 'overflow-y-auto';



  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900 text-slate-100 p-4 md:p-8 flex flex-col items-center selection:bg-sky-500 selection:text-white">
      {!headerCollapsed && (
      <header className={`w-full max-w-5xl mb-3 text-center shrink-0`}>
        <div className="flex items-center justify-center mb-2">
          <img src="https://i.postimg.cc/Cxjbf5Pd/bb-logo.png" alt="Babelback Logo" className="h-12 md:h-16 mr-3 md:mr-4" />
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-sky-300 tracking-tight">Babelback</h1>
          {audioSrc && (
            <button
              className="ml-2 px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-sky-200"
              onClick={() => setHeaderCollapsed(h => !h)}
            >{headerCollapsed ? 'Expand' : 'Collapse'}</button>
          )}
        </div>
        {!headerCollapsed && (
          <p className="text-slate-300 text-md md:text-lg">Upload audio, play, and explore lyrics in sync.</p>
        )}

        {!headerCollapsed && (
        <div className="mt-2 mb-2 space-x-2 sm:space-x-3 flex flex-wrap justify-center">
            <button
              onClick={() => handleNavigate('main')}
              className={`text-xs px-2.5 py-1.5 sm:px-3 sm:py-1 rounded-md transition-colors my-1
                          ${currentPage === 'main' ? 'bg-sky-600 text-white font-semibold' : 'bg-slate-700 hover:bg-sky-700 text-sky-300 hover:text-white'}`}
            >
              <Icon name="house" weight="bold" className="mr-1 sm:mr-1.5" />Main App
            </button>
            <button
              onClick={() => handleNavigate('about')}
              className={`text-xs px-2.5 py-1.5 sm:px-3 sm:py-1 rounded-md transition-colors my-1
                          ${currentPage === 'about' ? 'bg-purple-600 text-white font-semibold' : 'bg-slate-700 hover:bg-purple-700 text-purple-300 hover:text-white'}`}
            >
              <Icon name="info" weight="bold" className="mr-1 sm:mr-1.5" />About
            </button>
            <button
              onClick={() => handleNavigate('techDetails')}
              className={`text-xs px-2.5 py-1.5 sm:px-3 sm:py-1 rounded-md transition-colors my-1
                          ${currentPage === 'techDetails' ? 'bg-teal-600 text-white font-semibold' : 'bg-slate-700 hover:bg-teal-700 text-teal-300 hover:text-white'}`}
            >
              <Icon name="code" weight="bold" className="mr-1 sm:mr-1.5" />Tech Details
            </button>
            <button
              onClick={() => handleNavigate('changelog')}
              className={`text-xs px-2.5 py-1.5 sm:px-3 sm:py-1 rounded-md transition-colors my-1
                          ${currentPage === 'changelog' ? 'bg-orange-600 text-white font-semibold' : 'bg-slate-700 hover:bg-orange-700 text-orange-300 hover:text-white'}`}
            >
              <Icon name="megaphone" weight="bold" className="mr-1 sm:mr-1.5" />Changelog
            </button>
        </div>
        )}

        {/* Library toggle button hidden; use Library tab */}
        {/* Tabs moved below into content area */}
      </header>
      )}

      {headerCollapsed && (
        <button
          className="fixed top-2 right-2 z-40 px-2.5 py-1.5 text-xs rounded bg-slate-800/90 hover:bg-slate-700 text-sky-200 border border-slate-700"
          onClick={() => setHeaderCollapsed(false)}
          aria-label="Show header"
        >Menu</button>
      )}

      {/* Content pane that can scroll while the page remains fixed */}
      <main className="w-full flex-1 flex flex-col items-center pb-24 overflow-hidden">
        {currentPage === 'main' && (
          <div className="w-full max-w-5xl sticky top-0 z-20 py-1 bg-gradient-to-b from-slate-900/80 via-slate-900/40 to-transparent backdrop-blur-sm">
            <TabsBar
              tabs={[
                { id: 'setup', label: 'Setup', icon: 'sliders' },
                { id: 'lyrics', label: 'Lyrics', icon: 'music-notes' },
                { id: 'meaning', label: 'Meaning', icon: 'book-open' },
                { id: 'practice', label: 'Practice', icon: 'microphone' },
                { id: 'library', label: 'Library', icon: 'books' },
              ]}
              activeTab={activeTab}
              onChange={(id) => setActiveTab(id as any)}
              disabled={isPracticeActive}
            />
          </div>
        )}

        {(ytWorking || isLoadingSongData) && (
          <div className="w-full max-w-5xl mt-3">
            <LoadingSpinner
              message={isLoadingSongData ? (loadingMessage || 'Analyzing song…') : 'Fetching audio from YouTube…'}
              funMessage={isLoadingSongData ? funLoadingMessage : (ytFun || undefined)}
              progressPercent={isLoadingSongData ? (analysisProgressPercent ?? undefined) : undefined}
            />
          </div>
        )}

        {showRecordingHelpBanner && (
          <div className="w-full max-w-5xl mt-2">
            <RecordingInfoBanner isVisible={showRecordingHelpBanner} />
          </div>
        )}

        {appError && !isLoadingSongData && !apiKeyMissing && (
          <div className="w-full max-w-5xl my-3 p-4 bg-red-700/60 border border-red-500 text-red-200 rounded-lg shadow text-center">
            <Icon name="warning-circle" weight="bold" className="inline-block mr-2" size="lg" />
            <strong>Error:</strong> {appError}
          </div>
        )}

        <div className={`w-full flex-1 ${mainPaneScrollClass} flex justify-center`}>
          {renderPageContent()}
        </div>
      </main>

      <EarphoneConsentModal
        isOpen={singingPractice.showEarphoneModal}
        onConfirm={singingPracticeHooksRef.current.confirmEarphoneConsent}
        onCancel={singingPracticeHooksRef.current.cancelEarphoneConsent}
      />

      {/* Sticky bottom playback bar */}
      <PlayerBar
        audioSrc={audioSrc}
        onTimeUpdate={handleTimeUpdate}
        setAudioElement={(el) => (audioPlayerRef.current = el)}
        onLoadedData={() => {
          if (songData?.verses?.length && audioPlayerRef.current) {
            handleTimeUpdate(audioPlayerRef.current.currentTime);
          }
        }}
        onDurationAvailable={smHandleSongDurationAvailable}
        outputDeviceId={selectedOutputDeviceId}
        totalVerses={songData?.verses?.length || 0}
        currentVerseIndex={currentVerseIndex}
        onSeekToVerse={seekToVerse}
        onPrevVerseClick={handlePrevVerse}
        onNextVerseClick={handleNextVerse}
        disabled={isPracticeActive}
        compact
      />
    </div>
  );
};
export default App;

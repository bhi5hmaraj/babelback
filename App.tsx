
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Language, SongData, Verse, PanelVisibility, LibraryEntry, PracticeModeStatus, SingingScore } from './types'; // Added SingingScore type
import { INITIAL_PANEL_VISIBILITY } from './constants';
import AudioUpload from './components/AudioUpload';
import AudioPlayer from './components/AudioPlayer';
import LanguageSelector from './components/LanguageSelector';
import VerseDisplay from './components/VerseDisplay';
import PlayerControls from './components/PlayerControls';
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
import RecordingInfoBanner from './components/RecordingInfoBanner';
import AboutPage from './components/AboutPage';
import TechDetailsPage from './components/TechDetailsPage';
import { addSongToLibrary, deleteSongFromLibrary, deleteAllPracticeAttemptsForSongFromDB } from './db';
import { useSingingPractice, UseSingingPracticeReturn } from './hooks/useSingingPractice'; // Added UseSingingPracticeReturn

import { useAppInitializer } from './hooks/useAppInitializer';
import { useLibraryManager } from './hooks/useLibraryManager';
import { useSongDataManager, type SongProcessingResult } from './hooks/useSongDataManager';
import { useAudioPlaybackManager } from './hooks/useAudioPlaybackManager';
import { useDeviceManager } from './hooks/useDeviceManager';

type CurrentAppPage = 'main' | 'about' | 'techDetails';

const App: React.FC = () => {
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [currentPage, setCurrentPage] = useState<CurrentAppPage>('main');
  const [currentLibraryEntryId, setCurrentLibraryEntryId] = useState<number | null>(null);
  const [panelVisibility, setPanelVisibility] = useState<PanelVisibility>(INITIAL_PANEL_VISIBILITY);
  const [isPracticeModeGloballyEnabled, setIsPracticeModeGloballyEnabled] = useState<boolean>(false);
  const [globalHasEarphoneConsent, setGlobalHasEarphoneConsent] = useState<boolean>(false);
  const [showRecordingHelpBanner, setShowRecordingHelpBanner] = useState<boolean>(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [showDeviceConfig, setShowDeviceConfig] = useState<boolean>(false);


  // --- Core Hooks ---
  const { apiKeyMissing, initializationError: rawInitializationError, isInitializing: isAppInitializing } = useAppInitializer();

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
    showLibraryView,
    isLoadingLibrary,
    refreshLibrary,
    toggleLibraryView
  } = useLibraryManager();

  // singingPracticeHooksRef needs to be defined before useSongDataManager if its callback uses it.
  const singingPracticeHooksRef = useRef<UseSingingPracticeReturn | null>(null);

  const songManager = useSongDataManager({
    apiKeyMissing,
    refreshLibraryCallback: refreshLibrary,
    practiceExitCallback: (resetGlobalConsent?: boolean) => {
        singingPracticeHooksRef.current?.exitPractice(resetGlobalConsent);
    },
  });
  // Destructure after songManager is defined
  const {
    audioFile, audioSrc, targetLanguage, songData, isLoading: isLoadingSongData, loadingMessage,
    funLoadingMessage, elapsedLoadingTime, error: songProcessingError, isKaraokeMode,
    currentSongDurationRef,
    handleAudioSubmit: smHandleAudioSubmit,
    handleLanguageChange: smHandleLanguageChange,
    handleKaraokeModeToggle: smHandleKaraokeModeToggle,
    handleSongDurationAvailable: smHandleSongDurationAvailable,
    loadSongFromLibraryEntry: smLoadSongFromLibraryEntry,
    clearCurrentSong: smClearCurrentSong,
  } = songManager;

  // playbackManager depends on songData from songManager
  const playbackManager = useAudioPlaybackManager({ songData, audioPlayerRef });
  // Destructure after playbackManager is defined
  const {
    currentVerseIndex, playbackTime, handleTimeUpdate, seekToVerse,
    handleNextVerse, handlePrevVerse, setCurrentVerseIndex, setPlaybackTime
  } = playbackManager;

  // singingPractice hook depends on many states defined above
  const singingPractice = useSingingPractice({
    songData: songData,
    targetLanguage: targetLanguage,
    currentVerseIndex: currentVerseIndex,
    audioPlayerRef,
    currentSongDurationRef: currentSongDurationRef,
    initialHasEarphoneConsent: globalHasEarphoneConsent,
    onEarphoneConsentGlobalUpdate: setGlobalHasEarphoneConsent,
    isKaraokeMode: isKaraokeMode,
    selectedInputDeviceId, // From deviceManager
    playbackTime: playbackTime,
    currentLibrarySongId: currentLibraryEntryId,
  });

  // Update the ref after singingPractice is defined
  useEffect(() => {
    singingPracticeHooksRef.current = singingPractice;
  }, [singingPractice]);


  useEffect(() => {
    if (rawInitializationError) setAppError(rawInitializationError);
    else if (rawDeviceError && currentPage === 'main') setAppError(rawDeviceError); // Only show device error on main page if relevant
    else if (songProcessingError) setAppError(songProcessingError);
    else if (!rawInitializationError && !rawDeviceError && !songProcessingError) setAppError(null);
  }, [rawInitializationError, rawDeviceError, songProcessingError, currentPage]);
  
  // Clear device error if permission gets granted later or device config is hidden
  useEffect(() => {
    if (devicePermissionGranted || !showDeviceConfig) {
      if (appError === rawDeviceError) setAppError(null);
    }
  }, [devicePermissionGranted, showDeviceConfig, appError, rawDeviceError]);

  useEffect(() => {
    if (singingPractice.practiceVerseStatus === PracticeModeStatus.RECORDING) {
      setShowRecordingHelpBanner(true);
    } else {
      setShowRecordingHelpBanner(false);
    }
  }, [singingPractice.practiceVerseStatus]);


  const handlePanelToggle = useCallback((panel: keyof PanelVisibility) => {
    setPanelVisibility(prev => ({ ...prev, [panel]: !prev[panel] }));
  }, []);

  const toggleDeviceConfig = () => setShowDeviceConfig(prev => !prev);

  const handleAudioSubmit = async (file: File) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }
    setCurrentVerseIndex(0);
    setPlaybackTime(0);
    setCurrentLibraryEntryId(null);
    const result: SongProcessingResult | null = await smHandleAudioSubmit(file);
    if (result && result.songData) {
       const newLibraryEntry: Omit<LibraryEntry, 'id'> = {
          title: result.songData.title || file.name,
          originalLanguage: result.songData.originalLanguage,
          targetLanguage: targetLanguage, // Use targetLanguage from songManager state
          timestamp: Date.now(),
          audioFileBlob: file,
          audioFileName: file.name,
          audioFileType: file.type,
          songData: result.songData,
          processingTimeSeconds: result.processingTimeSeconds ? parseFloat(result.processingTimeSeconds.toFixed(1)) : undefined,
          songDurationSeconds: result.songDuration ? parseFloat(result.songDuration.toFixed(1)) : undefined,
        };
        try {
            const newId = await addSongToLibrary(newLibraryEntry);
            setCurrentLibraryEntryId(newId);
            await refreshLibrary();
        } catch (dbError) {
            console.error("[App.tsx handleAudioSubmit] Failed to add to library:", dbError);
            setAppError( (prevError) => (prevError ? prevError + " " : "") + "Failed to save song to library.");
        }
    }
  };

  const handleLanguageChange = async (newLanguage: Language) => {
    if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
    }
    setCurrentVerseIndex(0);
    setPlaybackTime(0);
    setCurrentLibraryEntryId(null);
    const result: SongProcessingResult | null = await smHandleLanguageChange(newLanguage);
     if (result && result.songData && audioFile) { // audioFile from songManager state
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
    if (showLibraryView) toggleLibraryView();
    smLoadSongFromLibraryEntry(entry, audioPlayerRef);
    setCurrentVerseIndex(0);
    setPlaybackTime(0);
    setCurrentLibraryEntryId(entry.id);
    setCurrentPage('main');
  };

  const handleDeleteSongFromLibrary = async (id: number) => {
    if (window.confirm("Delete this song and its practice history from library?")) {
      try {
        const entryToDelete = libraryEntries.find(entry => entry.id === id);
        await deleteSongFromLibrary(id);
        await deleteAllPracticeAttemptsForSongFromDB(id);
        await refreshLibrary();

        if (songData && entryToDelete && audioFile && entryToDelete.audioFileName === audioFile.name && entryToDelete.targetLanguage === targetLanguage) {
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
    if (!isPracticeModeGloballyEnabled) { // Trying to enable practice mode
      let hasPermission = devicePermissionGranted;
      if (!hasPermission) {
        hasPermission = await requestDevicePermissions();
      }
      if (hasPermission && selectedInputDeviceId) {
        setAppError(null); // Clear previous permission errors
        setIsPracticeModeGloballyEnabled(true);
      } else {
        setAppError(rawDeviceError || "Microphone access and a selected input device are required for Practice Mode. Please grant permission and check device settings.");
        setIsPracticeModeGloballyEnabled(false); // Ensure it's off if permission failed
      }
    } else { // Trying to disable practice mode
      setIsPracticeModeGloballyEnabled(false);
      singingPracticeHooksRef.current?.exitPractice(true); // resetGlobalConsent = true
    }
  };
  
  const handleInitiatePracticeForVerse = async (verse: Verse) => {
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

  if (isAppInitializing || (isLoadingLibrary && libraryEntries.length === 0 && !showLibraryView && currentPage === 'main')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900 text-slate-100 p-4 md:p-8 flex flex-col items-center justify-center">
        <LoadingSpinner message="Preparing Babelback for you..." />
      </div>
    );
  }

  const isPracticeActive = singingPractice.activePracticeVerses.length > 0 &&
                           singingPractice.practiceVerseStatus !== PracticeModeStatus.IDLE &&
                           singingPractice.practiceVerseStatus !== PracticeModeStatus.CONSENT_GIVEN;

  const globalIsLoading = isLoadingSongData || isLoadingDevices || isAppInitializing;

  const mainContentMaxWidth = currentPage === 'main' && songData ? 'max-w-4xl' : 'max-w-2xl';

  const renderMainContent = () => {
    if (currentPage === 'about') {
      return <div className={`w-full ${mainContentMaxWidth} bg-slate-800/70 backdrop-blur-md p-5 md:p-8 rounded-xl shadow-2xl mt-6`}><AboutPage onNavigateBack={() => handleNavigate('main')} /></div>;
    }
    if (currentPage === 'techDetails') {
      return <div className={`w-full ${mainContentMaxWidth} bg-slate-800/70 backdrop-blur-md p-5 md:p-8 rounded-xl shadow-2xl mt-6`}><TechDetailsPage onNavigateBack={() => handleNavigate('main')} /></div>;
    }

    // Main App UI
    if (showLibraryView && !apiKeyMissing) {
      return (
        <div className="w-full max-w-3xl bg-slate-800/70 backdrop-blur-md p-5 md:p-8 rounded-xl shadow-2xl mt-6">
          {isLoadingLibrary && libraryEntries.length === 0 ?
            <LoadingSpinner message="Loading library..."/> :
            <LibraryView
              entries={libraryEntries}
              onLoadSong={handleLoadSongFromLibrary}
              onDeleteSong={handleDeleteSongFromLibrary}
              currentPlayingLibraryId={currentLibraryEntryId}
            />
          }
        </div>
      );
    }

    return (
      <>
        {!apiKeyMissing && !audioFile && currentPage === 'main' && (
          <div className={`w-full ${mainContentMaxWidth}`}>
             <AboutBabelback />
          </div>
        )}
        <div className={`w-full ${mainContentMaxWidth} bg-slate-800/70 backdrop-blur-md p-5 md:p-8 rounded-xl shadow-2xl mt-6`}>
          {apiKeyMissing && (
              <div className="my-6 p-4 bg-red-800/80 border border-red-600 text-red-100 rounded-lg shadow text-center">
                  <Icon name="warning-octagon" weight="bold" className="inline-block mr-2 text-red-300" size="lg"/>
                  <strong>Configuration Error:</strong> {appError}
              </div>
          )}

          {!apiKeyMissing && (
              <>
                  <button
                    onClick={toggleDeviceConfig}
                    className="w-full mb-3 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-sky-300 rounded-md transition-colors text-sm flex items-center justify-center disabled:opacity-50"
                    disabled={globalIsLoading || isPracticeActive}
                  >
                    <Icon name={showDeviceConfig ? "gear-six-slash" : "gear-six"} weight="bold" className="mr-2" />
                    {showDeviceConfig ? "Hide Audio Settings" : "Show Audio Settings"}
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
                        error={rawDeviceError} // Display specific device errors here
                    />
                  )}
                  <AudioUpload
                      onAudioSubmit={handleAudioSubmit}
                      isLoading={isLoadingSongData}
                      disabled={globalIsLoading || isPracticeActive || !selectedInputDeviceId && !showDeviceConfig} // Also disable if device config isn't shown and no input device is selected
                  />
                  <LanguageSelector
                      selectedLanguage={targetLanguage}
                      onLanguageChange={handleLanguageChange}
                      disabled={globalIsLoading || isPracticeActive}
                  />
                  <KaraokeModeToggle
                      isKaraokeMode={isKaraokeMode}
                      onToggle={handleKaraokeModeToggleApp}
                      disabled={globalIsLoading || isPracticeActive}
                  />
                  <PracticeModeToggle
                      isPracticeModeEnabled={isPracticeModeGloballyEnabled}
                      onToggle={handlePracticeModeGlobalToggle}
                      disabled={globalIsLoading || !songData || !songData.verses || songData.verses.length === 0 || !currentLibraryEntryId || (!selectedInputDeviceId && !devicePermissionGranted) }
                  />
              </>
          )}

          {isLoadingSongData && <LoadingSpinner message={loadingMessage || undefined} funMessage={funLoadingMessage} elapsedTime={elapsedLoadingTime} />}
          {appError && !isLoadingSongData && !apiKeyMissing && (
            <div className="my-6 p-4 bg-red-700/60 border border-red-500 text-red-200 rounded-lg shadow text-center">
              <Icon name="warning-circle" weight="bold" className="inline-block mr-2" size="lg"/>
              <strong>Error:</strong> {appError}
            </div>
          )}

          <RecordingInfoBanner isVisible={showRecordingHelpBanner} />

          {isPracticeActive && (
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
          )}


          {songData && !isLoadingSongData && !apiKeyMissing && !isPracticeActive && (
            <>
              <div className="mb-4 text-center">
                <h2 className="text-2xl font-semibold text-sky-300">{songData.title || (audioFile ? audioFile.name : "Uploaded Track")}</h2>
                {songData.originalLanguage && <p className="text-sm text-slate-400">(Original Lyrics: {songData.originalLanguage})</p>}
              </div>
              {songData.summary && ( <div className="my-6 p-4 bg-slate-700/60 backdrop-blur-sm rounded-lg shadow"> <h3 className="text-md font-semibold text-sky-400 mb-2 flex items-center"> <Icon name="info" weight="bold" className="mr-2" /> Song Summary </h3> <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{songData.summary}</p> </div> )}
              {songData.detailedAnalysis && ( <div className="my-6 p-4 bg-slate-700/60 backdrop-blur-sm rounded-lg shadow"> <h3 className="text-md font-semibold text-teal-400 mb-2 flex items-center"> <Icon name="chart-line" weight="bold" className="mr-2" /> Detailed Song Analysis </h3> <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{songData.detailedAnalysis}</p> </div> )}

              {currentVerseData ? (
                <>
                  <PanelToggle panelVisibility={panelVisibility} onToggle={handlePanelToggle} />
                  <VerseDisplay verse={currentVerseData} targetLanguage={targetLanguage} originalLanguageLabel={songData.originalLanguage} panelVisibility={panelVisibility} currentTime={playbackTime} isKaraokeMode={isKaraokeMode} />
                  {isPracticeModeGloballyEnabled && songData.verses.length > 0 && songData.originalLanguage !== "Instrumental" && (
                      <button
                          onClick={() => handleInitiatePracticeForVerse(currentVerseData)}
                          className="mt-4 w-full px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors text-sm flex items-center justify-center disabled:bg-slate-500 disabled:opacity-70"
                          disabled={globalIsLoading ||
                                    isPracticeActive ||
                                    !audioPlayerRef.current ||
                                    !currentSongDurationRef.current ||
                                    currentSongDurationRef.current <= 0 ||
                                    (!selectedInputDeviceId && !devicePermissionGranted) || // Ensure mic is ready or permission can be asked
                                    !currentLibraryEntryId
                                   }
                      >
                          <Icon name="waveform" weight="bold" className="mr-2" /> Practice this Verse
                      </button>
                  )}
                  {songData.verses.length > 0 && (
                    <PlayerControls
                        currentVerseIndex={currentVerseIndex}
                        totalVerses={songData.verses.length}
                        onSeekToVerse={seekToVerse}
                        onPrevVerseClick={handlePrevVerse}
                        onNextVerseClick={handleNextVerse}
                        disabled={globalIsLoading || isPracticeActive || !audioSrc}
                    />
                  )}
                </>
              ) : ( songData.originalLanguage === "Instrumental" && songData.verses.length === 0 && !appError && ( <div className="text-center py-6 text-slate-300"> <Icon name="speaker-simple-slash" weight="bold" size="2xl" className="mb-3 text-sky-400" /> <p className="text-lg">This track appears to be instrumental.</p> <p className="text-xs mt-1">No lyrical verses found.</p> </div> ))}

            </>
          )}

          {!apiKeyMissing && audioSrc && (
              <AudioPlayer
                  src={audioSrc}
                  onTimeUpdate={handleTimeUpdate}
                  setAudioElement={(el) => audioPlayerRef.current = el}
                  onLoadedData={() => {
                      if (songData?.verses?.length && audioPlayerRef.current) {
                          handleTimeUpdate(audioPlayerRef.current.currentTime);
                      }
                  }}
                  onDurationAvailable={smHandleSongDurationAvailable}
                  outputDeviceId={selectedOutputDeviceId}
              />
          )}

          {!songData && !isLoadingSongData && !appError && !apiKeyMissing && !showLibraryView && !isPracticeActive && ( <div className="text-center py-10 text-slate-400"> <Icon name="music-notes-simple" weight="bold" size="2xl" className="mb-3 text-sky-400" /> <p className="text-lg">Configure audio devices, then upload audio and select language to begin.</p> <p className="text-xs mt-2">Enable Karaoke Mode for word-by-word synchronized transliteration!</p> </div> )}
        </div>
        <EarphoneConsentModal
          isOpen={singingPractice.showEarphoneModal}
          onConfirm={singingPracticeHooksRef.current.confirmEarphoneConsent}
          onCancel={singingPracticeHooksRef.current.cancelEarphoneConsent}
        />
      </>
    );
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900 text-slate-100 p-4 md:p-8 flex flex-col items-center selection:bg-sky-500 selection:text-white">
      <header className="w-full max-w-4xl mb-6 text-center">
        <div className="flex items-center justify-center mb-2">
          <img src="https://i.postimg.cc/Cxjbf5Pd/bb-logo.png" alt="Babelback Logo" className="h-12 md:h-16 mr-3 md:mr-4" />
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-sky-300 tracking-tight">Babelback</h1>
        </div>
        <p className="text-slate-300 text-md md:text-lg mb-3">Upload audio, play, and explore lyrics in sync.</p>

        <div className="mb-3 space-x-3">
            <button
              onClick={() => handleNavigate('main')}
              className={`text-xs px-3 py-1 rounded-md transition-colors
                          ${currentPage === 'main' ? 'bg-sky-600 text-white font-semibold' : 'bg-slate-700 hover:bg-sky-700 text-sky-300 hover:text-white'}`}
            >
              <Icon name="house" weight="bold" className="mr-1.5" />Main App
            </button>
            <button
              onClick={() => handleNavigate('about')}
              className={`text-xs px-3 py-1 rounded-md transition-colors
                          ${currentPage === 'about' ? 'bg-purple-600 text-white font-semibold' : 'bg-slate-700 hover:bg-purple-700 text-purple-300 hover:text-white'}`}
            >
              <Icon name="info" weight="bold" className="mr-1.5" />About
            </button>
            <button
              onClick={() => handleNavigate('techDetails')}
              className={`text-xs px-3 py-1 rounded-md transition-colors
                          ${currentPage === 'techDetails' ? 'bg-teal-600 text-white font-semibold' : 'bg-slate-700 hover:bg-teal-700 text-teal-300 hover:text-white'}`}
            >
              <Icon name="code" weight="bold" className="mr-1.5" />Tech Details
            </button>
        </div>

        {!apiKeyMissing && currentPage === 'main' && (
            <button
              onClick={toggleLibraryView}
              className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm flex items-center mx-auto disabled:bg-slate-500 disabled:opacity-70"
              disabled={isPracticeActive}
            >
                <Icon name={showLibraryView ? "music-notes-plus" : "books"} weight="bold" className="mr-2" />
                {showLibraryView ? "Back to Main App" : "View My Song Library"} ({libraryEntries.length})
            </button>
        )}
      </header>

      <main className={`w-full flex flex-col items-center`}>
        {renderMainContent()}
      </main>

      <footer className="w-full max-w-4xl mt-12 text-center text-xs text-slate-500">
        <p className="mb-1">Babelback: AI-Powered Lyric Explorer. Powered by Gemini.</p>
        <p>AI processing may not always be perfectly accurate. For conceptual and entertainment purposes.</p>
      </footer>
    </div>
  );
};
export default App;
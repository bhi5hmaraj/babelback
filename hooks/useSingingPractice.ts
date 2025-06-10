
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Verse, PracticeModeStatus, SingingScore, Language, SongData } from '../types';
import { fetchSingingFeedback } from '../services/geminiService';

interface UseSingingPracticeProps {
  songData: SongData | null;
  targetLanguage: Language;
  currentVerseIndex: number; 
  audioPlayerRef: React.RefObject<HTMLAudioElement | null>; 
  currentSongDurationRef: React.RefObject<number | null>;
  initialHasEarphoneConsent: boolean;
  onEarphoneConsentGlobalUpdate: (consent: boolean) => void;
  isKaraokeMode: boolean; 
  selectedInputDeviceId: string | null; 
  playbackTime: number; 
}

export interface UseSingingPracticeReturn {
  practiceVerseStatus: PracticeModeStatus;
  activePracticeVerses: Verse[]; 
  showEarphoneModal: boolean;
  practiceScore: SingingScore | null;
  practiceError: string | null;
  userPracticeAudioUrl: string | null;
  recordingFormattedTime: string;
  initiatePracticeForVerse: (verse: Verse) => void;
  confirmEarphoneConsent: () => void;
  cancelEarphoneConsent: () => void;
  exitPractice: (resetGlobalConsent?: boolean) => void;
  startRecording: () => void; 
  stopRecording: () => void; 
  tryAgainPractice: () => void; 
  submitForScoring: () => void;
}

const formatTimer = (seconds: number) => {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

export const useSingingPractice = ({
  songData,
  targetLanguage,
  audioPlayerRef, 
  currentSongDurationRef,
  initialHasEarphoneConsent,
  onEarphoneConsentGlobalUpdate,
  selectedInputDeviceId, 
  playbackTime, 
}: UseSingingPracticeProps): UseSingingPracticeReturn => {
  const [practiceVerseStatus, setPracticeVerseStatus] = useState<PracticeModeStatus>(PracticeModeStatus.IDLE);
  const [activePracticeVerses, setActivePracticeVerses] = useState<Verse[]>([]);
  const [showEarphoneModal, setShowEarphoneModal] = useState<boolean>(false);
  const [hasEarphoneConsent, setHasEarphoneConsent] = useState<boolean>(initialHasEarphoneConsent);
  const [userPracticeAudioBlob, setUserPracticeAudioBlob] = useState<Blob | null>(null);
  const [userPracticeAudioUrl, setUserPracticeAudioUrl] = useState<string | null>(null);
  const [practiceScore, setPracticeScore] = useState<SingingScore | null>(null);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [recordingTimer, setRecordingTimer] = useState(0);


  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const practiceInitiationVerseIndexRef = useRef<number>(0); 
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setHasEarphoneConsent(initialHasEarphoneConsent);
  }, [initialHasEarphoneConsent]);

  useEffect(() => {
    if (practiceVerseStatus === PracticeModeStatus.RECORDING) {
      setRecordingTimer(0);
      timerIntervalRef.current = setInterval(() => {
        setRecordingTimer(prev => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [practiceVerseStatus]);
  
  const recordingFormattedTime = formatTimer(recordingTimer);

  useEffect(() => { 
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current?.stream?.getTracks().forEach(track => track.stop());
    };
  }, []);


  const requestMicrophonePermissionAndSetReady = useCallback(async () => {
    try {
      const constraints: MediaStreamConstraints = { 
        audio: selectedInputDeviceId ? { deviceId: { exact: selectedInputDeviceId } } : true 
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach(track => track.stop()); 
      setPracticeVerseStatus(PracticeModeStatus.READY_TO_RECORD);
      setPracticeError(null);
    } catch (err: any) {
      let message = "Failed to access microphone. Please ensure access is allowed and the correct microphone is selected.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        message = "Microphone access denied. Please allow microphone access in your browser settings.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        message = "Selected microphone not found. Please check your selection or connect a microphone.";
      } else if (err.name === "OverconstrainedError" && selectedInputDeviceId) {
        message = `Selected microphone (ID: ${selectedInputDeviceId}) could not be used. It might be unavailable or settings are too restrictive. Try another microphone.`;
      }
      setPracticeError(message);
      setPracticeVerseStatus(PracticeModeStatus.ERROR);
    }
  }, [selectedInputDeviceId, setPracticeError, setPracticeVerseStatus]);

  const initiatePracticeForVerse = useCallback(async (verseToStartWith: Verse) => {
    setPracticeScore(null);
    setPracticeError(null);
    if (userPracticeAudioUrl) URL.revokeObjectURL(userPracticeAudioUrl);
    setUserPracticeAudioUrl(null);
    setUserPracticeAudioBlob(null);

    const initialPracticeIndex = songData?.verses.findIndex(v => v.verseNumber === verseToStartWith.verseNumber) ?? 0;
    practiceInitiationVerseIndexRef.current = initialPracticeIndex;
    
    if (songData && songData.verses) {
      const versesForDisplayDuringRecording = songData.verses.slice(initialPracticeIndex);
      setActivePracticeVerses(versesForDisplayDuringRecording);
    } else {
       setActivePracticeVerses([verseToStartWith]); 
    }

    if (!hasEarphoneConsent) {
      setShowEarphoneModal(true);
      setPracticeVerseStatus(PracticeModeStatus.REQUESTING_CONSENT);
    } else {
      await requestMicrophonePermissionAndSetReady();
    }
  }, [userPracticeAudioUrl, songData, hasEarphoneConsent, requestMicrophonePermissionAndSetReady, setActivePracticeVerses, setPracticeScore, setPracticeError, setUserPracticeAudioUrl, setUserPracticeAudioBlob, practiceInitiationVerseIndexRef]);

  const confirmEarphoneConsent = useCallback(async () => {
    setHasEarphoneConsent(true);
    onEarphoneConsentGlobalUpdate(true);
    setShowEarphoneModal(false);
    if (activePracticeVerses.length > 0) {
      await requestMicrophonePermissionAndSetReady();
    } else {
      setPracticeVerseStatus(PracticeModeStatus.CONSENT_GIVEN);
    }
  }, [activePracticeVerses, requestMicrophonePermissionAndSetReady, onEarphoneConsentGlobalUpdate, setHasEarphoneConsent, setShowEarphoneModal, setPracticeVerseStatus]);

  const cancelEarphoneConsent = useCallback(() => {
    setShowEarphoneModal(false);
    setActivePracticeVerses([]);
    setPracticeVerseStatus(PracticeModeStatus.IDLE);
  }, [setShowEarphoneModal, setActivePracticeVerses, setPracticeVerseStatus]);

  const processPracticeAudio = useCallback(async (audioBlobToProcess: Blob, versesToScore: Verse[]) => {
    if (versesToScore.length === 0 || !targetLanguage) {
      const errorMsg = "Missing active verses or target language for scoring.";
      setPracticeError(errorMsg);
      setPracticeVerseStatus(PracticeModeStatus.ERROR);
      return;
    }
    setPracticeVerseStatus(PracticeModeStatus.SCORING);
    try {
      const score = await fetchSingingFeedback(audioBlobToProcess, versesToScore, targetLanguage);
      setPracticeScore(score);
      setPracticeVerseStatus(PracticeModeStatus.SHOWING_SCORE);
    } catch (e: any) {
      setPracticeError(e.message || "Failed to get feedback from AI.");
      setPracticeVerseStatus(PracticeModeStatus.ERROR);
    }
  }, [targetLanguage, setPracticeError, setPracticeVerseStatus, setPracticeScore]);


  const startRecording = useCallback(async () => {
    if (!audioPlayerRef.current) {
      setPracticeError("Cannot start practice: main audio player is not available.");
      setPracticeVerseStatus(PracticeModeStatus.ERROR);
      return;
    }
    
    if (!songData || !songData.verses || practiceInitiationVerseIndexRef.current >= songData.verses.length) {
      const errorMsg = "Could not prepare verses for recording. Song data missing or invalid start index.";
      setPracticeError(errorMsg);
      setPracticeVerseStatus(PracticeModeStatus.ERROR);
      return;
    }
        
    const versesForDisplayDuringRecording = songData.verses.slice(practiceInitiationVerseIndexRef.current);
    setActivePracticeVerses(versesForDisplayDuringRecording);
    
    const actualStartVerseTime = songData.verses[practiceInitiationVerseIndexRef.current].startTime;
    audioPlayerRef.current.currentTime = actualStartVerseTime;

    try {
      const constraints: MediaStreamConstraints = { 
        audio: selectedInputDeviceId ? { deviceId: { exact: selectedInputDeviceId } } : true 
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        audioPlayerRef.current?.pause(); 

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
        setUserPracticeAudioBlob(audioBlob); 
        if (userPracticeAudioUrl) URL.revokeObjectURL(userPracticeAudioUrl); 
        const newAudioUrl = URL.createObjectURL(audioBlob);
        setUserPracticeAudioUrl(newAudioUrl);
        
        if (songData && songData.verses && audioPlayerRef.current) { 
            const stopTime = audioPlayerRef.current.currentTime; 
            const startIdx = practiceInitiationVerseIndexRef.current;
            let endIdx = startIdx;
            
            const verseAtStopTime = songData.verses.findIndex(v => stopTime >= v.startTime && stopTime < v.endTime);

            if (verseAtStopTime !== -1) {
                endIdx = verseAtStopTime;
            } else {
                let lastPotentialVerseIndex = -1;
                for (let i = songData.verses.length - 1; i >= startIdx; i--) {
                    if (songData.verses[i].startTime <= stopTime) {
                        lastPotentialVerseIndex = i;
                        break;
                    }
                }
                 if (lastPotentialVerseIndex !== -1) endIdx = lastPotentialVerseIndex;
                 else if (stopTime < songData.verses[startIdx].startTime) endIdx = startIdx; 
            }
            endIdx = Math.max(startIdx, endIdx); 
            
            const versesActuallyRecorded = songData.verses.slice(startIdx, endIdx + 1);
            setActivePracticeVerses(versesActuallyRecorded);
            
            if (audioBlob.size > 0 && versesActuallyRecorded.length > 0) {
                setPracticeVerseStatus(PracticeModeStatus.AWAITING_REVIEW);
            } else if (audioBlob.size === 0) {
                setPracticeError("Recording failed: No audio data captured. Please try again.");
                setPracticeVerseStatus(PracticeModeStatus.ERROR);
            } else { 
                 setPracticeError("Could not determine verses for review (no verses matched recorded segment). Please try again.");
                 setPracticeVerseStatus(PracticeModeStatus.ERROR);
            }
        }
        stream.getTracks().forEach(track => track.stop()); 
      };

      mediaRecorderRef.current.start();
      setPracticeVerseStatus(PracticeModeStatus.RECORDING);

      if (audioPlayerRef.current) {
        audioPlayerRef.current.play()
          .then(() => {
            if (audioPlayerRef.current) {
              audioPlayerRef.current.muted = false;
              audioPlayerRef.current.volume = 0.7; 
            }
          })
          .catch(e => {
            console.error("[useSingingPractice startRecording] Main player play() failed:", e);
            setPracticeError(`Audio playback failed (${e.name}). Recording acapella. Check volume/mute settings.`);
             if (audioPlayerRef.current) {
              audioPlayerRef.current.muted = false;
              audioPlayerRef.current.volume = 0.7;
            }
          });
      }

    } catch (err: any) {
      console.error("[useSingingPractice startRecording] Error during recording setup:", err);
      let message = "Failed to start recording. Ensure microphone access and audio playback are allowed.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        message = "Microphone access denied. Allow in browser settings.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        message = "No microphone found or selected microphone is invalid. Connect a microphone or check selection.";
      } else if (err.name === "AbortError" || err.name === "NotSupportedError") {
        message = `Main audio player error: ${err.message}. Cannot play accompaniment.`;
      } else if (err.name === "OverconstrainedError" && selectedInputDeviceId) {
        message = `Selected microphone (ID: ${selectedInputDeviceId}) could not be used. It might be unavailable or settings are too restrictive. Try another microphone.`;
      }
      setPracticeError(message);
      setPracticeVerseStatus(PracticeModeStatus.ERROR);
    }
  }, [songData, audioPlayerRef, userPracticeAudioUrl, selectedInputDeviceId, practiceInitiationVerseIndexRef, setActivePracticeVerses, setPracticeError, setPracticeVerseStatus, setUserPracticeAudioBlob, setUserPracticeAudioUrl, mediaRecorderRef, audioChunksRef]);


  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop(); 
    } else {
      audioPlayerRef.current?.pause();
      if (practiceVerseStatus === PracticeModeStatus.RECORDING) { 
        setPracticeError("Recording stop requested, but was not in a valid recording state or already stopped.");
        setPracticeVerseStatus(PracticeModeStatus.ERROR); 
      }
    }
  }, [audioPlayerRef, practiceVerseStatus, mediaRecorderRef, setPracticeError, setPracticeVerseStatus]);

  const submitForScoring = useCallback(() => {
    if (userPracticeAudioBlob && activePracticeVerses.length > 0) {
      processPracticeAudio(userPracticeAudioBlob, activePracticeVerses);
    } else {
      setPracticeError("No recorded audio or verses available to score. Please record first.");
      setPracticeVerseStatus(PracticeModeStatus.ERROR);
    }
  }, [userPracticeAudioBlob, activePracticeVerses, processPracticeAudio, setPracticeError, setPracticeVerseStatus]);

  const tryAgainPractice = useCallback(() => {
    setPracticeScore(null);
    setPracticeError(null);
    if (userPracticeAudioUrl) {
      URL.revokeObjectURL(userPracticeAudioUrl);
      setUserPracticeAudioUrl(null);
    }
    setUserPracticeAudioBlob(null);

    if (songData && songData.verses[practiceInitiationVerseIndexRef.current]) {
      const versesForDisplayDuringRecording = songData.verses.slice(practiceInitiationVerseIndexRef.current);
      setActivePracticeVerses(versesForDisplayDuringRecording);
      setPracticeVerseStatus(PracticeModeStatus.READY_TO_RECORD);
    } else {
      setActivePracticeVerses([]);
      setPracticeVerseStatus(hasEarphoneConsent ? PracticeModeStatus.CONSENT_GIVEN : PracticeModeStatus.IDLE);
    }
  }, [userPracticeAudioUrl, songData, hasEarphoneConsent, practiceInitiationVerseIndexRef, setPracticeScore, setPracticeError, setUserPracticeAudioUrl, setUserPracticeAudioBlob, setActivePracticeVerses, setPracticeVerseStatus]);

  const exitPractice = useCallback((resetGlobalConsent: boolean = false) => {
    setActivePracticeVerses([]);
    setPracticeScore(null);
    setPracticeError(null);
    if (userPracticeAudioUrl) {
      URL.revokeObjectURL(userPracticeAudioUrl);
      setUserPracticeAudioUrl(null);
    }
    setUserPracticeAudioBlob(null);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current?.stream?.getTracks().forEach(track => track.stop());
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    
    audioPlayerRef.current?.pause(); 

    if (resetGlobalConsent) {
      setHasEarphoneConsent(false);
      onEarphoneConsentGlobalUpdate(false); 
      setPracticeVerseStatus(PracticeModeStatus.IDLE);
    } else {
      setPracticeVerseStatus(hasEarphoneConsent ? PracticeModeStatus.CONSENT_GIVEN : PracticeModeStatus.IDLE);
    }
  }, [userPracticeAudioUrl, onEarphoneConsentGlobalUpdate, hasEarphoneConsent, audioPlayerRef, mediaRecorderRef, audioChunksRef, setActivePracticeVerses, setPracticeScore, setPracticeError, setUserPracticeAudioUrl, setUserPracticeAudioBlob, setHasEarphoneConsent, setPracticeVerseStatus]);
  
  useEffect(() => {
    const currentUrl = userPracticeAudioUrl;
    return () => {
      if (currentUrl && currentUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [userPracticeAudioUrl]);


  return {
    practiceVerseStatus,
    activePracticeVerses,
    showEarphoneModal,
    practiceScore,
    practiceError,
    userPracticeAudioUrl,
    recordingFormattedTime,
    initiatePracticeForVerse,
    confirmEarphoneConsent,
    cancelEarphoneConsent,
    exitPractice,
    startRecording,
    stopRecording,
    tryAgainPractice,
    submitForScoring,
  };
};

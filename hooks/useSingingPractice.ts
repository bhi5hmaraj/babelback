
/** Coordinates recording flow and Gemini scoring for practice mode. */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { trackEvent } from '../services/analytics';
import { Verse, PracticeModeStatus, SingingScore, Language, SongData, PracticeAttempt } from '../types';
import { fetchSingingFeedback } from '../services/geminiService';
import { addPracticeAttemptToDB } from '../db'; // Import DB function

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
  currentLibrarySongId: number | null; 
  selectedModelId: string; // Added to pass to fetchSingingFeedback
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
  initialHasEarphoneConsent,
  onEarphoneConsentGlobalUpdate,
  selectedInputDeviceId,
  currentLibrarySongId, 
  selectedModelId, // Destructure
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
  const [actualRecordingDuration, setActualRecordingDuration] = useState<number>(0);


  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const practiceInitiationVerseIndexRef = useRef<number>(0);
  const timerIntervalRef = useRef<number | null>(null);
  const recordingStartTimeRef = useRef<number | null>(null);


  useEffect(() => {
    setHasEarphoneConsent(initialHasEarphoneConsent);
  }, [initialHasEarphoneConsent]);

  useEffect(() => {
    if (practiceVerseStatus === PracticeModeStatus.RECORDING) {
      setRecordingTimer(0);
      recordingStartTimeRef.current = Date.now();
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingTimer(prev => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      if (practiceVerseStatus !== PracticeModeStatus.AWAITING_REVIEW && practiceVerseStatus !== PracticeModeStatus.SHOWING_SCORE) {
        recordingStartTimeRef.current = null;
        setActualRecordingDuration(0);
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
    const recorder = mediaRecorderRef.current;
    const intervalId = timerIntervalRef.current;
    return () => {
      if (recorder && recorder.state === "recording") {
        recorder.stop();
      }
      recorder?.stream?.getTracks().forEach(track => track.stop());
      if (intervalId) {
        clearInterval(intervalId);
      }
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
        message = `Selected microphone (ID: ${selectedInputDeviceId}) could not be used. It might be unavailable or settings are too restrictive. Try another microphone. Error: ${err.message}`;
      } else {
        message = `Failed to access microphone: ${err.name} - ${err.message}`;
      }
      setPracticeError(message);
      setPracticeVerseStatus(PracticeModeStatus.ERROR);
    }
  }, [selectedInputDeviceId]);

  const initiatePracticeForVerse = useCallback(async (verseToStartWith: Verse) => {
    setPracticeScore(null);
    setPracticeError(null);
    if (userPracticeAudioUrl) URL.revokeObjectURL(userPracticeAudioUrl);
    setUserPracticeAudioUrl(null);
    setUserPracticeAudioBlob(null);
    setActualRecordingDuration(0);

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
  }, [userPracticeAudioUrl, songData, hasEarphoneConsent, requestMicrophonePermissionAndSetReady]);

  const confirmEarphoneConsent = useCallback(async () => {
    setHasEarphoneConsent(true);
    onEarphoneConsentGlobalUpdate(true);
    setShowEarphoneModal(false);
    trackEvent('earphone_consent', { value: 1 })
    if (activePracticeVerses.length > 0) {
      await requestMicrophonePermissionAndSetReady();
    } else {
      setPracticeVerseStatus(PracticeModeStatus.CONSENT_GIVEN);
    }
  }, [activePracticeVerses, requestMicrophonePermissionAndSetReady, onEarphoneConsentGlobalUpdate]);

  const cancelEarphoneConsent = useCallback(() => {
    setShowEarphoneModal(false);
    setActivePracticeVerses([]);
    setPracticeVerseStatus(PracticeModeStatus.IDLE);
  }, []);

  const processPracticeAudio = useCallback(async (audioBlobToProcess: Blob, versesToScore: Verse[]) => {
    if (versesToScore.length === 0 || !targetLanguage) {
      const errorMsg = "Missing active verses or target language for scoring.";
      setPracticeError(errorMsg);
      setPracticeVerseStatus(PracticeModeStatus.ERROR);
      return;
    }
    if (!selectedModelId) {
      setPracticeError("AI Model not selected for scoring. Please ensure a model is chosen in settings.");
      setPracticeVerseStatus(PracticeModeStatus.ERROR);
      return;
    }

    setPracticeVerseStatus(PracticeModeStatus.SCORING);
    trackEvent('practice_scoring_start', { verses: versesToScore.length })
    try {
      const score = await fetchSingingFeedback(audioBlobToProcess, versesToScore, targetLanguage, selectedModelId);
      setPracticeScore(score);
      setPracticeVerseStatus(PracticeModeStatus.SHOWING_SCORE);
      trackEvent('practice_scored', { overall: score.overallScore, verses: versesToScore.length })

      if (currentLibrarySongId && songData) {
        const newPracticeAttempt: Omit<PracticeAttempt, 'id'> = {
          librarySongId: currentLibrarySongId,
          songTitleForReference: songData.title,
          timestamp: Date.now(),
          targetLanguage: targetLanguage,
          practicedVerseNumbers: versesToScore.map(v => v.verseNumber),
          userAudioBlob: audioBlobToProcess,
          userAudioFileName: `Practice - ${songData.title.substring(0,20)} - V${versesToScore.map(v=>v.verseNumber).join(',')} - ${Date.now()}.webm`,
          userAudioFileType: audioBlobToProcess.type || 'audio/webm',
          singingScore: score,
          recordingDurationSeconds: actualRecordingDuration,
        };
        try {
          await addPracticeAttemptToDB(newPracticeAttempt);
          console.log("[useSingingPractice] Practice attempt saved to DB.");
        } catch (dbError: any) {
          console.error("[useSingingPractice] Failed to save practice attempt:", dbError);
          setPracticeError(prev => prev ? `${prev} (Note: Failed to save this practice to history.)` : "Failed to save this practice to history.");
        }
      }

    } catch (e: any) {
      trackEvent('practice_scoring_error', { reason: (e?.message || 'unknown').slice(0, 120) })
      setPracticeError(e.message || "Failed to get feedback from AI.");
      setPracticeVerseStatus(PracticeModeStatus.ERROR);
    }
  }, [targetLanguage, currentLibrarySongId, songData, actualRecordingDuration, selectedModelId]);


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
    trackEvent('practice_recording_start', { startVerse: songData.verses[practiceInitiationVerseIndexRef.current].verseNumber })
    audioPlayerRef.current.currentTime = actualStartVerseTime;

    let streamForThisAttempt: MediaStream | null = null;

    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedInputDeviceId ? { deviceId: { exact: selectedInputDeviceId } } : true
      };
      streamForThisAttempt = await navigator.mediaDevices.getUserMedia(constraints);

      if (!streamForThisAttempt.active || streamForThisAttempt.getAudioTracks().length === 0 || streamForThisAttempt.getAudioTracks()[0].readyState !== 'live') {
        streamForThisAttempt.getTracks().forEach(track => track.stop());
        setPracticeError("Microphone stream is not active. Please check microphone connection and permissions.");
        setPracticeVerseStatus(PracticeModeStatus.ERROR);
        return;
      }

      const mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mediaRecorderRef.current = new MediaRecorder(streamForThisAttempt);
      } else {
        mediaRecorderRef.current = new MediaRecorder(streamForThisAttempt, { mimeType });
      }

      audioChunksRef.current = [];

      mediaRecorderRef.current.onerror = (event: Event) => {
        const mediaRecorderError = event as Event & { error: DOMException };
        console.error('[useSingingPractice startRecording] MediaRecorder error:', mediaRecorderError.error);
        let errorMsg = `Recording failed: ${mediaRecorderError.error?.name || 'Unknown MediaRecorder Error'}.`;
        if (mediaRecorderError.error?.message) {
            errorMsg += ` Message: ${mediaRecorderError.error.message}`;
        }
        setPracticeError(errorMsg);
        setPracticeVerseStatus(PracticeModeStatus.ERROR);
        streamForThisAttempt?.getTracks().forEach(track => track.stop());
        if (audioPlayerRef.current) audioPlayerRef.current.pause();
      };

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        audioPlayerRef.current?.pause();
        
        if (recordingStartTimeRef.current) {
            const endTime = Date.now();
            setActualRecordingDuration(Math.max(0, (endTime - recordingStartTimeRef.current) / 1000));
            recordingStartTimeRef.current = null; 
        }


        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' });
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
                const recordingDurationCheck = recordingTimer; 
                let errorMsg = "Recording failed: No audio data captured. Please try again.";
                if (recordingDurationCheck < 1 && audioChunksRef.current.length === 0) {
                     errorMsg = "Recording was very short and no audio was captured. Try recording for a bit longer or check your microphone."
                } else {
                    errorMsg = "Recording failed: No audio data captured despite recording. Please check your microphone connection and permissions.";
                }
                setPracticeError(errorMsg);
                setPracticeVerseStatus(PracticeModeStatus.ERROR);
            } else {
                 setPracticeError("Could not determine verses for review (no verses matched recorded segment). Please try again.");
                 setPracticeVerseStatus(PracticeModeStatus.ERROR);
            }
        }
        streamForThisAttempt?.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start(250);
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
      console.error("[useSingingPractice startRecording] Error during recording setup (outer try-catch):", err);
      if (streamForThisAttempt) {
        streamForThisAttempt.getTracks().forEach(track => track.stop());
      }
      let message = "Failed to start recording. Ensure microphone access and audio playback are allowed.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        message = "Microphone access denied. Allow in browser settings.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        message = "No microphone found or selected microphone is invalid. Connect a microphone or check selection.";
      } else if (err.name === "AbortError" || err.name === "NotSupportedError") {
        message = `Main audio player error: ${err.message}. Cannot play accompaniment.`;
      } else if (err.name === "OverconstrainedError" && selectedInputDeviceId) {
        message = `Selected microphone (ID: ${selectedInputDeviceId}) could not be used. Error: ${err.message}`;
      } else {
        message = `Failed to start recording: ${err.name} - ${err.message}`;
      }
      setPracticeError(message);
      setPracticeVerseStatus(PracticeModeStatus.ERROR);
    }
  }, [songData, audioPlayerRef, userPracticeAudioUrl, selectedInputDeviceId, recordingTimer]);


  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      trackEvent('practice_recording_stop')
    } else {
      audioPlayerRef.current?.pause();
      if (practiceVerseStatus === PracticeModeStatus.RECORDING) {
        setPracticeError("Recording stop requested, but was not in a valid recording state or already stopped.");
        setPracticeVerseStatus(PracticeModeStatus.ERROR);
      }
    }
  }, [audioPlayerRef, practiceVerseStatus]);

  const submitForScoring = useCallback(() => {
    if (userPracticeAudioBlob && activePracticeVerses.length > 0) {
      processPracticeAudio(userPracticeAudioBlob, activePracticeVerses);
    } else {
      setPracticeError("No recorded audio or verses available to score. Please record first.");
      setPracticeVerseStatus(PracticeModeStatus.ERROR);
    }
  }, [userPracticeAudioBlob, activePracticeVerses, processPracticeAudio]);

  const tryAgainPractice = useCallback(() => {
    setPracticeScore(null);
    setPracticeError(null);
    if (userPracticeAudioUrl) {
      URL.revokeObjectURL(userPracticeAudioUrl);
      setUserPracticeAudioUrl(null);
    }
    setUserPracticeAudioBlob(null);
    setActualRecordingDuration(0);


    if (songData && songData.verses[practiceInitiationVerseIndexRef.current]) {
      const versesForDisplayDuringRecording = songData.verses.slice(practiceInitiationVerseIndexRef.current);
      setActivePracticeVerses(versesForDisplayDuringRecording);
      setPracticeVerseStatus(PracticeModeStatus.READY_TO_RECORD);
    } else {
      setActivePracticeVerses([]);
      setPracticeVerseStatus(hasEarphoneConsent ? PracticeModeStatus.CONSENT_GIVEN : PracticeModeStatus.IDLE);
    }
  }, [userPracticeAudioUrl, songData, hasEarphoneConsent]);

  const exitPractice = useCallback((resetGlobalConsent: boolean = false) => {
    setActivePracticeVerses([]);
    setPracticeScore(null);
    setPracticeError(null);
    if (userPracticeAudioUrl) {
      URL.revokeObjectURL(userPracticeAudioUrl);
      setUserPracticeAudioUrl(null);
    }
    setUserPracticeAudioBlob(null);
    setActualRecordingDuration(0);


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
  }, [userPracticeAudioUrl, onEarphoneConsentGlobalUpdate, hasEarphoneConsent, audioPlayerRef]);

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

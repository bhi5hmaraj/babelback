
import React, { useEffect, useRef } from 'react';
import Icon from './Icon';

interface AudioPlayerProps {
  src: string | null;
  onTimeUpdate: (currentTime: number) => void;
  onLoadedData?: () => void;
  onEnded?: () => void;
  setAudioElement?: (element: HTMLAudioElement | null) => void; // To pass ref to parent
  onDurationAvailable?: (duration: number) => void; 
  outputDeviceId?: string | null; // New prop for selected output device
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ 
    src, 
    onTimeUpdate, 
    onLoadedData, 
    onEnded, 
    setAudioElement, 
    onDurationAvailable,
    outputDeviceId 
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (setAudioElement && audioRef.current) {
      setAudioElement(audioRef.current);
    }
    return () => {
      if (setAudioElement) {
        setAudioElement(null);
      }
    };
  }, [setAudioElement]);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    const handleTimeUpdateEvent = () => {
      onTimeUpdate(audioElement.currentTime);
    };

    const handleLoadedDataEvent = () => {
      if (onLoadedData) onLoadedData();
      if (onDurationAvailable && audioElement.duration && isFinite(audioElement.duration)) {
        onDurationAvailable(audioElement.duration);
      }
    };
    
    const handleEndedEvent = () => {
        if (onEnded) onEnded();
    }

    audioElement.addEventListener('timeupdate', handleTimeUpdateEvent);
    audioElement.addEventListener('loadeddata', handleLoadedDataEvent);
    audioElement.addEventListener('ended', handleEndedEvent);

    return () => {
      audioElement.removeEventListener('timeupdate', handleTimeUpdateEvent);
      audioElement.removeEventListener('loadeddata', handleLoadedDataEvent);
      audioElement.removeEventListener('ended', handleEndedEvent);
    };
  }, [onTimeUpdate, onLoadedData, onEnded, onDurationAvailable]);

  useEffect(() => {
    if (audioRef.current && src) {
      audioRef.current.load(); 
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn("Audio auto-play after src change was prevented:", error);
        });
      }
    } else if (audioRef.current && !src) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [src]); 

  useEffect(() => {
    const audioEl = audioRef.current as any; // Use 'any' for setSinkId if not in HTMLAudioElement type
    if (audioEl && outputDeviceId) {
      if (typeof audioEl.setSinkId === 'function') {
        audioEl.setSinkId(outputDeviceId)
          .then(() => {
            // console.log(`[AudioPlayer] Output device set to: ${outputDeviceId}`);
          })
          .catch((err: any) => {
            console.error(`[AudioPlayer] Error setting output device: ${outputDeviceId}`, err);
            // Optionally, inform the user via an error state/toast
          });
      } else {
        console.warn('[AudioPlayer] setSinkId is not supported on this browser for the main player.');
      }
    }
  }, [outputDeviceId, audioRef]); // Re-run if outputDeviceId or audioRef itself changes


  if (!src) {
    return (
        <div className="my-4 p-4 bg-slate-700/50 rounded-lg text-center text-slate-400">
            <Icon name="speaker-none" size="lg" className="mb-2"/>
            <p>Audio will appear here once processed.</p>
        </div>
    );
  }

  return (
    <div className="my-6 audio-player-container">
      <audio
        ref={audioRef}
        controls
        src={src} 
        className="w-full rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-75"
        style={{backgroundColor: '#334155', filter: 'invert(90%) sepia(20%) saturate(500%) hue-rotate(180deg) brightness(100%) contrast(90%)' }}
        preload="auto"
      >
        Your browser does not support the audio element.
      </audio>
    </div>
  );
};

export default AudioPlayer;

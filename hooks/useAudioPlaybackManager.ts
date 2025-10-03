
/** Synchronizes audio time with active verse; provides seek/prev/next helpers. */
import { useState, useCallback } from 'react';
import { SongData } from '../types';

export interface UseAudioPlaybackManagerProps {
  songData: SongData | null;
  audioPlayerRef: React.RefObject<HTMLAudioElement | null>;
}

export interface UseAudioPlaybackManagerReturn {
  currentVerseIndex: number;
  playbackTime: number;
  setCurrentVerseIndex: React.Dispatch<React.SetStateAction<number>>;
  setPlaybackTime: React.Dispatch<React.SetStateAction<number>>;
  handleTimeUpdate: (currentTime: number) => void;
  seekToVerse: (verseIndex: number) => void;
  handleNextVerse: () => void;
  handlePrevVerse: () => void;
}

export const useAudioPlaybackManager = ({
  songData,
  audioPlayerRef,
}: UseAudioPlaybackManagerProps): UseAudioPlaybackManagerReturn => {
  const [currentVerseIndex, setCurrentVerseIndex] = useState<number>(0);
  const [playbackTime, setPlaybackTime] = useState<number>(0);

  const handleTimeUpdate = useCallback((currentTime: number) => {
    setPlaybackTime(currentTime);
    if (!songData || !songData.verses || songData.verses.length === 0) return;

    const currentActiveVerse = songData.verses.find(
      (verse) => currentTime >= verse.startTime && currentTime < verse.endTime
    );
    if (currentActiveVerse) {
      const newIndex = songData.verses.indexOf(currentActiveVerse);
      if (newIndex !== currentVerseIndex) {
        setCurrentVerseIndex(newIndex);
      }
    }
  }, [songData, currentVerseIndex]);

  const seekToVerse = useCallback((verseIndex: number) => {
    if (songData && songData.verses[verseIndex] && audioPlayerRef.current) {
      audioPlayerRef.current.currentTime = songData.verses[verseIndex].startTime;
      // setCurrentVerseIndex(verseIndex); // Time update will handle this
    }
  }, [songData, audioPlayerRef]);

  const handleNextVerse = useCallback(() => {
    if (songData && currentVerseIndex < songData.verses.length - 1) {
      seekToVerse(currentVerseIndex + 1);
    }
  }, [songData, currentVerseIndex, seekToVerse]);

  const handlePrevVerse = useCallback(() => {
    if (currentVerseIndex > 0) {
      seekToVerse(currentVerseIndex - 1);
    }
  }, [currentVerseIndex, seekToVerse]);

  return {
    currentVerseIndex,
    playbackTime,
    setCurrentVerseIndex,
    setPlaybackTime,
    handleTimeUpdate,
    seekToVerse,
    handleNextVerse,
    handlePrevVerse,
  };
};

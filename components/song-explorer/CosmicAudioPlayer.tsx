"use client"

import React, { useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface CosmicAudioPlayerProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSkipPrevious?: () => void;
  onSkipNext?: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  volume: number;
  disabled?: boolean;
}

const CosmicAudioPlayer: React.FC<CosmicAudioPlayerProps> = ({
  currentTime,
  duration,
  isPlaying,
  onPlayPause,
  onSkipPrevious,
  onSkipNext,
  onSeek,
  onVolumeChange,
  volume,
  disabled,
}) => {
  const [showVolume, setShowVolume] = useState(false);

  const formatTime = (time: number) => {
    if (!Number.isFinite(time) || time < 0) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="audio-controls">
      {/* Progress Bar */}
      <div className="mb-4">
        <Slider
          value={[Number.isFinite(currentTime) ? currentTime : 0]}
          max={Number.isFinite(duration) && duration > 0 ? duration : 1}
          step={0.1}
          onValueChange={(value) => onSeek(value[0])}
          className="w-full cursor-pointer"
          disabled={disabled || !Number.isFinite(duration) || duration <= 0}
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="touch-button w-12 h-12 rounded-full"
            onClick={onSkipPrevious}
            disabled={disabled || !onSkipPrevious}
          >
            <SkipBack className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onPlayPause}
            className="touch-button w-16 h-16 rounded-full bg-primary-gradient hover:shadow-glow"
            disabled={disabled}
          >
            {isPlaying ? (
              <Pause className="h-6 w-6 text-primary-foreground" />
            ) : (
              <Play className="h-6 w-6 text-primary-foreground ml-1" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="touch-button w-12 h-12 rounded-full"
            onClick={onSkipNext}
            disabled={disabled || !onSkipNext}
          >
            <SkipForward className="h-5 w-5" />
          </Button>
        </div>

        {/* Volume Control */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowVolume(!showVolume)}
            className="touch-button w-10 h-10 rounded-lg"
            disabled={disabled}
          >
            <Volume2 className="h-4 w-4" />
          </Button>
          
          {showVolume && (
            <div className="w-20">
              <Slider
                value={[Math.max(0, Math.min(100, volume * 100))]}
                max={100}
                step={1}
                onValueChange={(value) => onVolumeChange(value[0] / 100)}
                className="cursor-pointer"
                disabled={disabled}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CosmicAudioPlayer;

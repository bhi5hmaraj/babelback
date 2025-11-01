import React, { useState, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface AudioPlayerProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  volume: number;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({
  currentTime,
  duration,
  isPlaying,
  onPlayPause,
  onSeek,
  onVolumeChange,
  volume
}) => {
  const [showVolume, setShowVolume] = useState(false);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="audio-controls">
      {/* Progress Bar */}
      <div className="mb-4">
        <Slider
          value={[currentTime]}
          max={duration}
          step={0.1}
          onValueChange={(value) => onSeek(value[0])}
          className="w-full cursor-pointer"
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
          >
            <SkipBack className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onPlayPause}
            className="touch-button w-16 h-16 rounded-full bg-primary-gradient hover:shadow-glow"
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
          >
            <Volume2 className="h-4 w-4" />
          </Button>
          
          {showVolume && (
            <div className="w-20">
              <Slider
                value={[volume * 100]}
                max={100}
                step={1}
                onValueChange={(value) => onVolumeChange(value[0] / 100)}
                className="cursor-pointer"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;
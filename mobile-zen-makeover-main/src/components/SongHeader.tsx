import React from 'react';
import { Music, Heart, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SongHeaderProps {
  title: string;
  artist: string;
  description: string;
  language: string;
}

const SongHeader: React.FC<SongHeaderProps> = ({
  title,
  artist,
  description,
  language
}) => {
  return (
    <div className="text-center mb-8 animate-fade-in">
      {/* Song Title */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <Music className="h-8 w-8 text-primary animate-pulse" />
        <h1 className="mobile-title bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          {title}
        </h1>
      </div>

      {/* Artist & Language */}
      <div className="flex items-center justify-center gap-4 mb-4 text-muted-foreground">
        <span className="mobile-text font-medium">{artist}</span>
        <span className="w-1 h-1 bg-muted-foreground rounded-full"></span>
        <span className="mobile-text">{language}</span>
      </div>

      {/* Description */}
      <p className="mobile-text text-foreground/80 max-w-4xl mx-auto leading-relaxed mb-6 px-4">
        {description}
      </p>

      {/* Action Buttons */}
      <div className="flex items-center justify-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="touch-button gap-2 rounded-full"
        >
          <Heart className="h-4 w-4" />
          <span className="hidden sm:inline">Like</span>
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          className="touch-button gap-2 rounded-full"
        >
          <Share2 className="h-4 w-4" />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </div>
    </div>
  );
};

export default SongHeader;
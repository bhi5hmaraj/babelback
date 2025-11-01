import React from 'react';
import { Badge } from '@/components/ui/badge';

interface LyricLine {
  original: string;
  transliteration?: string;
  translation: string;
  timestamp?: number;
}

interface LyricDisplayProps {
  title: string;
  subtitle: string;
  lyrics: LyricLine[];
  meaning?: string;
  currentTime: number;
  displayMode: 'synced' | 'meaning';
}

const LyricDisplay: React.FC<LyricDisplayProps> = ({
  title,
  subtitle,
  lyrics,
  meaning,
  currentTime,
  displayMode
}) => {
  const isActiveLine = (timestamp?: number) => {
    if (!timestamp) return false;
    return Math.abs(currentTime - timestamp) < 2;
  };

  return (
    <div className="glass-card p-6 rounded-2xl animate-fade-in">
      {/* Section Header */}
      <div className="mb-6">
        <Badge variant="secondary" className="mb-3 bg-accent-gradient text-accent-foreground">
          {title}
        </Badge>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {displayMode === 'synced' && (
        <div className="space-y-4">
          <h3 className="section-header">
            Synced Lyrics (Transliteration & Translation to English)
          </h3>
          
          <div className="space-y-3">
            {lyrics.map((line, index) => (
              <div
                key={index}
                className={`lyric-box ${
                  isActiveLine(line.timestamp) ? 'ring-2 ring-accent shadow-glow' : ''
                }`}
              >
                <div className="space-y-2">
                  {/* Original Text */}
                  <div className="text-lg font-semibold">
                    {line.original}
                  </div>
                  
                  {/* Transliteration */}
                  {line.transliteration && (
                    <div className="text-sm opacity-90 italic">
                      {line.transliteration}
                    </div>
                  )}
                  
                  {/* Translation */}
                  <div className="text-sm font-medium">
                    {line.translation}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {displayMode === 'meaning' && meaning && (
        <div className="space-y-4">
          <h3 className="section-header">
            Meaning & Context <span className="text-xs">(English)</span>
          </h3>
          
          <div className="glass-card p-5 rounded-lg bg-card/50">
            <p className="mobile-text leading-relaxed text-foreground/90">
              {meaning}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default LyricDisplay;
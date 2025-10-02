import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import AudioPlayer from '@/components/AudioPlayer';
import LyricDisplay from '@/components/LyricDisplay';
import SongHeader from '@/components/SongHeader';
import DisplayModeToggle from '@/components/DisplayModeToggle';
import VerseNavigation from '@/components/VerseNavigation';

// Sample data based on the Heer Ranjha song
const songData = {
  title: "Heer Ranjha",
  artist: "Traditional Punjabi Folk",
  language: "Punjabi",
  description: "A reference to Heer, the heroine of the famous tragic romance 'Heer Ranjha', kind of like a South Asian 'Romeo and Juliet'. By calling his love 'Heeriye', the singer is placing her on a pedestal, comparing her to this legendary figure of beauty and love. The lyrics are simple but powerful, repeating a heartfelt plea ('aaj', meaning 'come') and a profound declaration of devotion ('Teri ho ke mara, jind jaan kara', which means 'I'll die as yours, I'll offer my life and soul'). This isn't literal, of course; it's a poetic way to express absolute commitment. The repetition makes it feel like a constant, unwavering thought, creating a mood that's both passionate and deeply longing.",
  verses: [
    {
      title: "Verse 6",
      subtitle: "Original Lyrics Language: Punjabi | Timings: 00:42 - 00:45",
      lyrics: [
        {
          original: "ਹੀਰ-ਰੀ-ਯੇਹ",
          transliteration: "Hee-ree-yeh",
          translation: "Oh my beloved",
          timestamp: 42.5
        },
        {
          original: "ਹੀਰ-ਰੀ-ਯੇਹ",
          transliteration: "Hee-ree-yeh", 
          translation: "Oh my beloved",
          timestamp: 43.0
        },
        {
          original: "ਆਹ",
          transliteration: "ah",
          translation: "come",
          timestamp: 43.5
        }
      ],
      meaning: "The final lines of this section are another repetition of his call, fading out with the musical swell. It leaves the listener with a feeling of unresolved longing, as if he'll just keep calling her name forever."
    },
    {
      title: "Verse 1", 
      subtitle: "Original Lyrics Language: Punjabi | Timings: 00:10 - 00:20",
      lyrics: [
        {
          original: "ਓਹ ਮੇਰੇ ਬੇਲਵਡ",
          transliteration: "Oh mere beloved",
          translation: "Oh my beloved",
          timestamp: 10.0
        },
        {
          original: "ਮੇਰੇ ਬੇਲਵਡ",
          transliteration: "mere beloved",
          translation: "my beloved", 
          timestamp: 12.0
        },
        {
          original: "ਕਮ...",
          transliteration: "come...",
          translation: "come...",
          timestamp: 15.0
        }
      ],
      meaning: "This opening verse establishes the tone of yearning and sets up the repeated plea that runs throughout the song."
    }
  ]
};

const Index = () => {
  const navigate = useNavigate();
  const [currentVerse, setCurrentVerse] = useState(0);
  const [displayMode, setDisplayMode] = useState<'synced' | 'meaning'>('synced');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(44.0); // Start at verse 6 timing
  const [volume, setVolume] = useState(0.8);

  const duration = 120; // 2 minutes sample duration
  const currentVerseData = songData.verses[currentVerse];

  // Simulate audio playback
  useEffect(() => {
    if (!isPlaying) return;
    
    const interval = setInterval(() => {
      setCurrentTime(prev => {
        if (prev >= duration) {
          setIsPlaying(false);
          return duration;
        }
        return prev + 0.1;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, duration]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
  };

  const handleGoBack = () => {
    navigate('/');
  };

  const handleVerseChange = (verse: number) => {
    if (verse >= 0 && verse < songData.verses.length) {
      setCurrentVerse(verse);
      // Jump to the verse timing
      const verseData = songData.verses[verse];
      if (verseData.lyrics.length > 0 && verseData.lyrics[0].timestamp) {
        setCurrentTime(verseData.lyrics[0].timestamp);
      }
    }
  };

  return (
    <div className="cosmic-bg min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Back Button */}
        <div className="mb-6 animate-fade-in">
          <Button
            variant="ghost"
            onClick={handleGoBack}
            className="touch-button gap-2 rounded-xl mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Config
          </Button>
        </div>

        {/* Song Header */}
        <SongHeader
          title={songData.title}
          artist={songData.artist}
          description={songData.description}
          language={songData.language}
        />

        {/* Display Mode Toggle */}
        <DisplayModeToggle
          activeMode={displayMode}
          onModeChange={setDisplayMode}
        />

        {/* Main Lyric Display */}
        <div className="mb-8">
          <LyricDisplay
            title={currentVerseData.title}
            subtitle={currentVerseData.subtitle}
            lyrics={currentVerseData.lyrics}
            meaning={currentVerseData.meaning}
            currentTime={currentTime}
            displayMode={displayMode}
          />
        </div>

        {/* Verse Navigation */}
        <VerseNavigation
          currentVerse={currentVerse + 1}
          totalVerses={songData.verses.length}
          onVerseChange={(verse) => handleVerseChange(verse - 1)}
        />

        {/* Audio Player */}
        <div className="sticky bottom-4 mt-8">
          <AudioPlayer
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            onSeek={handleSeek}
            onVolumeChange={handleVolumeChange}
            volume={volume}
          />
        </div>

        {/* Mobile-optimized footer */}
        <footer className="text-center mt-12 mb-8">
          <p className="text-xs text-muted-foreground">
            AI processing may not be perfectly accurate. For conceptual and entertainment purposes.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Baadshao: AI-Powered Lyric Explorer. Powered by Gemini
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
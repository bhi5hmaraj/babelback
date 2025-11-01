import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface VerseNavigationProps {
  currentVerse: number;
  totalVerses: number;
  onVerseChange: (verse: number) => void;
}

const VerseNavigation: React.FC<VerseNavigationProps> = ({
  currentVerse,
  totalVerses,
  onVerseChange
}) => {
  const canGoPrevious = currentVerse > 1;
  const canGoNext = currentVerse < totalVerses;

  return (
    <div className="flex items-center justify-between mt-8 mb-6">
      <Button
        variant="ghost"
        onClick={() => onVerseChange(currentVerse - 1)}
        disabled={!canGoPrevious}
        className="touch-button gap-2 rounded-xl"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="hidden sm:inline">Previous</span>
      </Button>

      <Badge 
        variant="secondary" 
        className="bg-glass-gradient border border-border/30 px-4 py-2 text-sm font-medium"
      >
        Verse {currentVerse} of {totalVerses}
      </Badge>

      <Button
        variant="ghost"
        onClick={() => onVerseChange(currentVerse + 1)}
        disabled={!canGoNext}
        className="touch-button gap-2 rounded-xl"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default VerseNavigation;
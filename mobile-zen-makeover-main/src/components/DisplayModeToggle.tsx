import React from 'react';
import { Button } from '@/components/ui/button';
import { FileText, MessageSquare } from 'lucide-react';

interface DisplayModeToggleProps {
  activeMode: 'synced' | 'meaning';
  onModeChange: (mode: 'synced' | 'meaning') => void;
}

const DisplayModeToggle: React.FC<DisplayModeToggleProps> = ({
  activeMode,
  onModeChange
}) => {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mb-8">
      <span className="text-sm text-muted-foreground font-medium text-center sm:text-left mb-2 sm:mb-0">
        Display Sections:
      </span>
      
      <div className="flex gap-2 justify-center">
        <Button
          variant={activeMode === 'synced' ? "default" : "ghost"}
          onClick={() => onModeChange('synced')}
          className={`
            touch-button gap-2 rounded-xl flex-1 sm:flex-none
            ${activeMode === 'synced' 
              ? 'bg-primary-gradient text-primary-foreground shadow-glow' 
              : 'hover:bg-muted/50'
            }
          `}
        >
          <FileText className="h-4 w-4" />
          <span>Synced Lyrics</span>
        </Button>
        
        <Button
          variant={activeMode === 'meaning' ? "default" : "ghost"}
          onClick={() => onModeChange('meaning')}
          className={`
            touch-button gap-2 rounded-xl flex-1 sm:flex-none
            ${activeMode === 'meaning' 
              ? 'bg-accent-gradient text-accent-foreground shadow-glow' 
              : 'hover:bg-muted/50'
            }
          `}
        >
          <MessageSquare className="h-4 w-4" />
          <span>Meaning</span>
        </Button>
      </div>
    </div>
  );
};

export default DisplayModeToggle;
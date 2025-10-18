"use client"

import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
  funMessage?: string; // New prop for fun/banter messages
  elapsedTime?: number; // New prop for elapsed time
  progressPercent?: number | null; // Optional: when provided, show progress bar instead of spinner
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message, funMessage, elapsedTime, progressPercent }) => {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      {typeof progressPercent === 'number' ? (
        <div className="w-full max-w-md">
          <div className="h-2.5 w-full rounded-full overflow-hidden shadow-inner" style={{ background: '#d4c8aa' }}>
            <div
              className="h-full transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%`, background: '#a67c52' }}
            />
          </div>
          <div className="mt-2 text-[12px] mobile-mono" style={{ color: '#4a3f35' }}>
            {Math.max(0, Math.min(100, Math.floor(progressPercent)))}%
          </div>
        </div>
      ) : (
        <div className="h-10 w-10 rounded-full animate-spin" style={{ borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#a67c52', borderRightColor: '#a67c52', borderWidth: '4px' }} />
      )}

      <p className="mt-3 text-sm mobile-serif" style={{ color: '#4a3f35' }}>
        {message || 'Processing your request...'}
      </p>
      {!message && !funMessage && typeof elapsedTime !== 'number' && (
        <p className="mt-1 text-[11px]" style={{ color: '#7d6b56' }}>
          This may take a moment.
        </p>
      )}
      {funMessage && (
        <p className="mt-2 text-[11px] italic animate-pulse" style={{ color: '#a67c52' }}>
          {funMessage}
        </p>
      )}
    </div>
  );
};

export default LoadingSpinner;

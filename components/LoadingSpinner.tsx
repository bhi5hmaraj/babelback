import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
  funMessage?: string; // New prop for fun/banter messages
  elapsedTime?: number; // New prop for elapsed time
  progressPercent?: number | null; // Optional: when provided, show progress bar instead of spinner
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message, funMessage, elapsedTime, progressPercent }) => {
  return (
    <div className="flex flex-col justify-center items-center py-10 text-center">
      {typeof progressPercent === 'number' ? (
        <div className="w-full max-w-md">
          <div className="h-3 w-full bg-slate-700/60 rounded-full overflow-hidden shadow-inner">
            <div
              className="h-full bg-sky-500 transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
            />
          </div>
          <div className="mt-2 text-slate-300 text-sm font-mono">{Math.max(0, Math.min(100, Math.floor(progressPercent)))}%</div>
        </div>
      ) : (
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-sky-500"></div>
      )}
      <p className="mt-4 text-slate-300 text-lg">{message || "Processing your request..."}</p>
      {typeof elapsedTime === 'number' && (
        <p className="mt-1 text-sm text-sky-400 font-mono">
          Time: {elapsedTime}s
        </p>
      )}
      {!message && !funMessage && typeof elapsedTime !== 'number' && <p className="text-sm text-slate-400 mt-1">This may take a moment.</p>}
      {funMessage && (
        <p className="mt-2 text-xs text-purple-300 italic animate-pulse">
          {funMessage}
        </p>
      )}
    </div>
  );
};

export default LoadingSpinner;

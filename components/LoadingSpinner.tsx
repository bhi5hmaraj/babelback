import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
  funMessage?: string; // New prop for fun/banter messages
  elapsedTime?: number; // New prop for elapsed time
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message, funMessage, elapsedTime }) => {
  return (
    <div className="flex flex-col justify-center items-center py-10 text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-sky-500"></div>
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
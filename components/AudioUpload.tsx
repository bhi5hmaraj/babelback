
import React, { useState, useRef } from 'react';
import Icon from './Icon';

interface AudioUploadProps {
  onAudioSubmit?: (file: File) => void;
  isLoading: boolean;
  disabled: boolean;
  pickerOnly?: boolean;
  onFileSelected?: (file: File) => void;
}

const AudioUpload: React.FC<AudioUploadProps> = ({ onAudioSubmit, isLoading, disabled, pickerOnly, onFileSelected }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.startsWith('audio/')) {
        setSelectedFile(file);
        if (onFileSelected) onFileSelected(file);
      } else {
        setSelectedFile(null);
        setError('Invalid file type. Please select an audio file (e.g., MP3, WAV, OGG).');
        if(fileInputRef.current) fileInputRef.current.value = ""; // Clear the input
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFile) {
      onAudioSubmit(selectedFile);
    } else {
      setError('Please select an audio file first.');
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <form onSubmit={handleSubmit} className="mb-3">
      <label htmlFor="audio-upload-input" className="block text-sm font-medium text-slate-300 mb-2">
        Upload Audio File
      </label>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
        <input
          type="file"
          id="audio-upload-input"
          ref={fileInputRef}
          accept="audio/*"
          onChange={handleFileChange}
          className="hidden" // Hidden, triggered by custom button
          disabled={isLoading || disabled}
        />
        <button
          type="button"
          onClick={triggerFileInput}
          className="flex-grow w-full sm:w-auto px-4 py-3 border border-slate-600 rounded-lg shadow-sm focus:ring-sky-500 focus:border-sky-500 bg-slate-700 text-slate-100 placeholder-slate-400 hover:bg-slate-600 transition-colors flex items-center justify-center disabled:opacity-50"
          disabled={isLoading || disabled}
        >
          <Icon name={selectedFile ? "check-circle" : "file-audio"} className={`mr-2 ${selectedFile ? 'text-green-400' : ''}`} />
          {selectedFile ? selectedFile.name : 'Choose Audio File...'}
        </button>
        {!pickerOnly && (
          <button
            type="submit"
            disabled={isLoading || disabled || !selectedFile}
            className="px-6 py-3 bg-sky-600 text-white rounded-lg shadow-md hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-50 disabled:bg-slate-500 disabled:cursor-not-allowed transition-colors duration-150 flex items-center justify-center"
          >
            {isLoading ? (
              <Icon name="spinner-gap" className="animate-spin mr-2" />
            ) : (
              <Icon name="sparkle" className="mr-2" />
            )}
            Process Audio
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
       <p className="mt-2 text-xs text-slate-400">
        Babelback will attempt to transcribe lyrics and timings from your audio. Results may vary based on audio quality and lyrical clarity.
      </p>
    </form>
  );
};

export default AudioUpload;

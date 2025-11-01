
import React from 'react';
import Icon from './Icon';

interface RecordingInfoBannerProps {
  isVisible: boolean;
}

const RecordingInfoBanner: React.FC<RecordingInfoBannerProps> = ({ isVisible }) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div 
      className="my-4 p-3 bg-sky-700/80 border border-sky-600 text-sky-100 rounded-lg shadow text-xs transition-opacity duration-300 ease-in-out"
      role="alert"
    >
      <div className="flex items-center">
        <Icon name="info" weight="bold" className="mr-2 text-sky-300 text-base flex-shrink-0" />
        <div>
          <p className="font-semibold">Recording in Progress</p>
          <p className="mt-0.5">
            If you can't hear the song, please:
          </p>
          <ul className="list-disc list-inside ml-1 mt-0.5 space-y-px">
            <li>Check your system volume and ensure this browser tab is not muted.</li>
            <li>Verify the correct speaker/headphone is selected in "Audio Device Configuration" above.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default RecordingInfoBanner;


import React, { useState } from 'react';
import Icon from './Icon';

interface EarphoneConsentModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const EarphoneConsentModal: React.FC<EarphoneConsentModalProps> = ({ isOpen, onConfirm, onCancel }) => {
  const [isChecked, setIsChecked] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (isChecked) {
      onConfirm();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity duration-300 ease-in-out" style={{ opacity: isOpen ? 1 : 0 }}>
      <div className="bg-slate-800 p-6 md:p-8 rounded-xl shadow-2xl w-full max-w-md transform transition-all duration-300 ease-in-out scale-100">
        <div className="flex items-center mb-4">
          <Icon name="headphones" weight="fill" className="text-sky-400 text-3xl mr-3" />
          <h2 className="text-xl font-bold text-slate-100">Use Earphones for Practice</h2>
        </div>
        <p className="text-slate-300 text-sm mb-4">
          For the best results and accurate feedback in Singing Practice Mode, please connect and use earphones.
          This prevents the song's audio from interfering with your microphone.
        </p>
        <div className="mb-6">
          <label htmlFor="earphone-consent-checkbox" className="flex items-center text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              id="earphone-consent-checkbox"
              checked={isChecked}
              onChange={(e) => setIsChecked(e.target.checked)}
              className="h-5 w-5 rounded border-slate-500 text-sky-500 focus:ring-sky-500 bg-slate-700 mr-3"
            />
            I am using earphones.
          </label>
        </div>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-slate-600 text-slate-300 rounded-md hover:bg-slate-700 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isChecked}
            className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 disabled:bg-slate-500 disabled:opacity-70 disabled:cursor-not-allowed transition-colors text-sm"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default EarphoneConsentModal;
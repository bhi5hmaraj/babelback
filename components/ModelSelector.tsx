import React from 'react';
import Icon from './Icon';
import { AVAILABLE_MODELS } from '../constants'; // Assuming AVAILABLE_MODELS is an array of {id: string, name: string, description: string}

interface ModelSelectorProps {
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  disabled: boolean;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModelId, onModelChange, disabled }) => {
  return (
    <div className="my-6 p-4 bg-slate-800/70 rounded-lg shadow-md backdrop-blur-sm">
      <label htmlFor="model-select" className="block text-sm font-medium text-slate-300 mb-1">
        AI Model for Processing
      </label>
      <div className="relative">
        <select
          id="model-select"
          value={selectedModelId}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={disabled}
          className="w-full p-3 border border-slate-600 rounded-lg shadow-sm focus:ring-sky-500 focus:border-sky-500 bg-slate-700 text-slate-100 appearance-none pr-10 transition-colors"
          aria-describedby="model-description"
        >
          {AVAILABLE_MODELS.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
          <Icon name="caret-down" size="sm" />
        </div>
      </div>
      {AVAILABLE_MODELS.find(m => m.id === selectedModelId) && (
         <p id="model-description" className="mt-2 text-xs text-slate-400">
            {AVAILABLE_MODELS.find(m => m.id === selectedModelId)?.description}
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">
        Changing the model will re-process the current song if one is loaded (e.g. when you next change language or re-upload).
      </p>
    </div>
  );
};

export default ModelSelector;
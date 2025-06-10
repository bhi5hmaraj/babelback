
import React from 'react';
import { AudioDevice } from '../types';
import Icon from './Icon';

interface DeviceSelectorProps {
  inputDevices: AudioDevice[];
  outputDevices: AudioDevice[];
  selectedInputDeviceId: string | null;
  selectedOutputDeviceId: string | null;
  onSelectInputDevice: (deviceId: string) => void;
  onSelectOutputDevice: (deviceId: string) => void;
  onRequestPermissions?: () => void; // Optional: callback to trigger permission prompt
  permissionGranted?: boolean; // Optional: status of microphone permission
  isLoading: boolean;
  disabled: boolean; // General disable for the component
  error?: string | null;
}

const DeviceSelector: React.FC<DeviceSelectorProps> = ({
  inputDevices,
  outputDevices,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  onSelectInputDevice,
  onSelectOutputDevice,
  onRequestPermissions,
  permissionGranted,
  isLoading,
  disabled,
  error
}) => {
  const renderDeviceOptions = (devices: AudioDevice[]) => {
    if (!devices || devices.length === 0) {
      return <option value="">No devices found</option>;
    }
    return devices.map(device => (
      <option key={device.deviceId} value={device.deviceId}>
        {device.label || (device.kind === 'audioinput' ? 'Default Microphone' : 'Default Speaker')}
      </option>
    ));
  };

  return (
    <div className="my-6 p-4 bg-slate-800/80 rounded-lg shadow-md backdrop-blur-sm">
      <h3 className="text-md font-semibold text-slate-300 mb-3">Audio Device Configuration</h3>
      {isLoading && (
        <div className="flex items-center text-slate-400">
          <Icon name="spinner-gap" className="animate-spin mr-2" />
          Loading audio devices...
        </div>
      )}
      {error && !isLoading && <p className="text-xs text-red-400 mb-2">{error}</p>}
      
      {!isLoading && !permissionGranted && onRequestPermissions && (
         <button
          onClick={onRequestPermissions}
          className="mb-3 px-3 py-1.5 text-xs bg-sky-600 text-white rounded hover:bg-sky-700 transition-colors flex items-center"
          disabled={disabled}
        >
          <Icon name="lock-key-open" className="mr-2" /> Grant Mic Permission for Device Names
        </button>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="input-device-select" className="block text-sm font-medium text-slate-300 mb-1">
            Microphone (Input)
          </label>
          <div className="relative">
            <select
              id="input-device-select"
              value={selectedInputDeviceId || ''}
              onChange={(e) => onSelectInputDevice(e.target.value)}
              disabled={disabled || isLoading || inputDevices.length === 0}
              className="w-full p-2.5 border border-slate-600 rounded-lg shadow-sm focus:ring-sky-500 focus:border-sky-500 bg-slate-700 text-slate-100 appearance-none pr-10 transition-colors"
            >
              {renderDeviceOptions(inputDevices)}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
              <Icon name="caret-down" size="sm" />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="output-device-select" className="block text-sm font-medium text-slate-300 mb-1">
            Speaker/Headphones (Output)
          </label>
          <div className="relative">
            <select
              id="output-device-select"
              value={selectedOutputDeviceId || ''}
              onChange={(e) => onSelectOutputDevice(e.target.value)}
              disabled={disabled || isLoading || outputDevices.length === 0}
              className="w-full p-2.5 border border-slate-600 rounded-lg shadow-sm focus:ring-sky-500 focus:border-sky-500 bg-slate-700 text-slate-100 appearance-none pr-10 transition-colors"
            >
              {renderDeviceOptions(outputDevices)}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
              <Icon name="caret-down" size="sm" />
            </div>
          </div>
        </div>
      </div>
       <p className="mt-3 text-xs text-slate-400">
        Ensure you've granted microphone permissions in your browser for full functionality. Output selection might require specific browser support (e.g., Chrome, Edge).
      </p>
    </div>
  );
};

export default DeviceSelector;

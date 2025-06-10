
import { useState, useEffect, useCallback } from 'react';
import { AudioDevice } from '../types';

export interface UseDeviceManagerReturn {
  inputDevices: AudioDevice[];
  outputDevices: AudioDevice[];
  selectedInputDeviceId: string | null;
  selectedOutputDeviceId: string | null;
  deviceError: string | null;
  isLoadingDevices: boolean;
  permissionGranted: boolean;
  setSelectedInputDeviceId: (deviceId: string) => void;
  setSelectedOutputDeviceId: (deviceId: string) => void;
  requestDevicePermissions: () => Promise<void>;
}

export const useDeviceManager = (): UseDeviceManagerReturn => {
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState<string | null>(null);
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [isLoadingDevices, setIsLoadingDevices] = useState<boolean>(true);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);

  const fetchDevices = useCallback(async (promptForPermissionIfNeeded: boolean = false) => {
    setIsLoadingDevices(true);
    setDeviceError(null);
    try {
      if (promptForPermissionIfNeeded && !permissionGranted) {
        // Request microphone permission to get meaningful labels
        // This stream is only for permission, it's stopped immediately.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream.getTracks().forEach(track => track.stop());
        setPermissionGranted(true); // Permission was granted or already existed
      }

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices.filter(device => device.kind === 'audioinput');
      const audioOutputs = allDevices.filter(device => device.kind === 'audiooutput');

      setInputDevices(audioInputs.map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone ${inputDevices.length + 1}`, kind: 'audioinput' })));
      setOutputDevices(audioOutputs.map(d => ({ deviceId: d.deviceId, label: d.label || `Speaker ${outputDevices.length + 1}`, kind: 'audiooutput' })));
      
      // Check if any device has a non-empty label, indicating permission likely exists
      if (!permissionGranted && (audioInputs.some(d => d.label !== '') || audioOutputs.some(d => d.label !== ''))) {
        setPermissionGranted(true);
      }

      if (audioInputs.length > 0 && !selectedInputDeviceId) {
        setSelectedInputDeviceId(audioInputs[0].deviceId);
      }
      if (audioOutputs.length > 0 && !selectedOutputDeviceId) {
         // Prefer 'default' speaker if available, otherwise first one
        const defaultOutput = audioOutputs.find(d => d.deviceId === 'default');
        setSelectedOutputDeviceId(defaultOutput ? defaultOutput.deviceId : audioOutputs[0].deviceId);
      }
      
    } catch (err: any) {
      console.error("Error enumerating devices:", err);
      let message = "Could not list audio devices.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        message = "Microphone access denied. Device labels might be hidden. Grant permission to see device names and use recording features.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        message = "No audio devices found.";
      }
      setDeviceError(message);
      setPermissionGranted(false); // Explicitly false if error during/after permission request
    } finally {
      setIsLoadingDevices(false);
    }
  }, [permissionGranted, selectedInputDeviceId, selectedOutputDeviceId]); // Added missing dependencies

  useEffect(() => {
    fetchDevices(false); // Initial fetch without prompting for permission
    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', () => fetchDevices(false));
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', () => fetchDevices(false));
    };
  }, [fetchDevices]);

  const requestDevicePermissions = useCallback(async () => {
    if (!permissionGranted) {
      await fetchDevices(true); // This will prompt for permission
    }
  }, [fetchDevices, permissionGranted]);

  return {
    inputDevices,
    outputDevices,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    deviceError,
    isLoadingDevices,
    permissionGranted,
    setSelectedInputDeviceId,
    setSelectedOutputDeviceId,
    requestDevicePermissions,
  };
};

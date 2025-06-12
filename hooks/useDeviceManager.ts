
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
  requestDevicePermissions: () => Promise<boolean>; // Returns true if permission granted
}

export const useDeviceManager = (): UseDeviceManagerReturn => {
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [selectedInputDeviceId, setSelectedInputDeviceIdInternal] = useState<string | null>(localStorage.getItem('babelback_selectedInputDeviceId') || null);
  const [selectedOutputDeviceId, setSelectedOutputDeviceIdInternal] = useState<string | null>(localStorage.getItem('babelback_selectedOutputDeviceId') || null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [isLoadingDevices, setIsLoadingDevices] = useState<boolean>(true);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false); // Initially false

  const setSelectedInputDeviceId = (deviceId: string) => {
    setSelectedInputDeviceIdInternal(deviceId);
    localStorage.setItem('babelback_selectedInputDeviceId', deviceId);
  };

  const setSelectedOutputDeviceId = (deviceId: string) => {
    setSelectedOutputDeviceIdInternal(deviceId);
    localStorage.setItem('babelback_selectedOutputDeviceId', deviceId);
  };


  const fetchDevices = useCallback(async (hasJustGrantedPermission: boolean = false) => {
    setIsLoadingDevices(true);
    setDeviceError(null);
    let currentPermissionGranted = permissionGranted;

    try {
      // Check current permission status without prompting, unless explicitly told permission was just granted
      if (hasJustGrantedPermission) {
        currentPermissionGranted = true;
      } else {
         // Check based on query rather than immediate prompt, if supported
        if (navigator.permissions && typeof navigator.permissions.query === 'function') {
            const micPermissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            currentPermissionGranted = micPermissionStatus.state === 'granted';
            micPermissionStatus.onchange = () => { // Listen for future changes
                setPermissionGranted(micPermissionStatus.state === 'granted');
                fetchDevices(); // Re-fetch if permission changes
            };
        } else {
            // Fallback: If query API not available, assume not granted until explicit request
            // This path means we won't get labels until an explicit request.
        }
      }
      setPermissionGranted(currentPermissionGranted);


      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices.filter(device => device.kind === 'audioinput');
      const audioOutputs = allDevices.filter(device => device.kind === 'audiooutput');

      const mappedInputs = audioInputs.map((d,i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}`, kind: 'audioinput' as 'audioinput' }));
      const mappedOutputs = audioOutputs.map((d,i) => ({ deviceId: d.deviceId, label: d.label || `Speaker ${i + 1}`, kind: 'audiooutput' as 'audiooutput'}));
      
      setInputDevices(mappedInputs);
      setOutputDevices(mappedOutputs);
      
      if (mappedInputs.length > 0) {
        if (!selectedInputDeviceId || !mappedInputs.find(d => d.deviceId === selectedInputDeviceId)) {
          setSelectedInputDeviceId(mappedInputs[0].deviceId);
        }
      } else {
        setSelectedInputDeviceIdInternal(null); // No devices, clear selection
      }

      if (mappedOutputs.length > 0) {
        if (!selectedOutputDeviceId || !mappedOutputs.find(d => d.deviceId === selectedOutputDeviceId)) {
          const defaultOutput = mappedOutputs.find(d => d.deviceId === 'default');
          setSelectedOutputDeviceId(defaultOutput ? defaultOutput.deviceId : mappedOutputs[0].deviceId);
        }
      } else {
        setSelectedOutputDeviceIdInternal(null); // No devices, clear selection
      }
      
      if (currentPermissionGranted && audioInputs.length === 0) {
        setDeviceError("Microphone permission granted, but no input devices found. Please connect a microphone.");
      } else if (!currentPermissionGranted && audioInputs.some(d => d.label ==='')) {
         setDeviceError("Microphone permission not granted. Device names are hidden. Grant permission for full functionality.");
      }


    } catch (err: any) {
      console.error("Error enumerating devices:", err);
      let message = "Could not list audio devices.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        message = "Microphone access denied by user or policy. Device names may be hidden. Grant permission to see device names and use recording features.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        message = "No audio devices found on your system.";
      }
      setDeviceError(message);
      setPermissionGranted(false);
    } finally {
      setIsLoadingDevices(false);
    }
  }, [selectedInputDeviceId, selectedOutputDeviceId, permissionGranted]); // Added permissionGranted

  useEffect(() => {
    const handleDeviceChange = () => {
      fetchDevices(); // Call fetchDevices without arguments or with a default
    };

    fetchDevices(); 
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [fetchDevices]);

  const requestDevicePermissions = useCallback(async (): Promise<boolean> => {
    setIsLoadingDevices(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach(track => track.stop()); // Stop the stream immediately, only needed for permission
      await fetchDevices(true); // Pass true to indicate permission was (likely) just granted
      setPermissionGranted(true);
      setDeviceError(null); // Clear previous permission errors
      setIsLoadingDevices(false);
      return true;
    } catch (err: any) {
      console.error("Error requesting device permissions:", err);
      let message = "Failed to get microphone permission.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        message = "Microphone access denied. Please allow microphone access in your browser settings to use practice mode.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        message = "No microphone found. Please connect a microphone.";
      }
      setDeviceError(message);
      setPermissionGranted(false);
      setIsLoadingDevices(false);
      return false;
    }
  }, [fetchDevices]);

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

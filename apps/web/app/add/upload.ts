const audioTypes = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav',
  'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/flac'] as const;

export function audioContentType(value: string) {
  return audioTypes.find((type) => type === value);
}

export function uploadError(file: { size: number; type: string }, maxUploadMb: number) {
  if (!file.size) return 'Choose an audio file with some audio in it.';
  if (!audioContentType(file.type)) return 'Choose an MP3, M4A, AAC, WAV, WebM, Ogg or FLAC file.';
  if (file.size > maxUploadMb * 1024 * 1024) return `Choose a file up to ${maxUploadMb} MB.`;
  return null;
}

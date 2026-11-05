export function uploadError(file: { size: number; type: string }, maxUploadMb: number) {
  if (!file.size) return 'Choose an audio file with some audio in it.';
  if (!file.type.startsWith('audio/')) return 'Choose an audio file.';
  if (file.size > maxUploadMb * 1024 * 1024) return `Choose a file up to ${maxUploadMb} MB.`;
  return null;
}

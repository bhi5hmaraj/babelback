type TimedLine = { startTime: number; endTime: number };

export function currentLine(verses: TimedLine[], time: number) {
  const playing = verses.findIndex((verse) => verse.startTime <= time && time < verse.endTime);
  if (playing !== -1) return playing;
  return Math.max(0, verses.findLastIndex((verse) => verse.startTime <= time));
}

export function lineLoopStart(verse: TimedLine | undefined, time: number) {
  return verse && verse.endTime > verse.startTime && time >= verse.endTime ? verse.startTime : null;
}

export function clock(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

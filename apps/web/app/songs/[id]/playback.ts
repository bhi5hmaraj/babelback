export type TimedLine = { startTime: number; endTime: number };
type Lyric = TimedLine & { original: string; translation: string; transliteration: string };

// A verse analysed before line timing has no lines, so it plays as one long line.
export function singLines(verses: (Lyric & { lines?: Lyric[] })[]) {
  return verses.flatMap((verse, index) => {
    const lines = verse.lines?.length ? verse.lines : [verse];
    return lines.map(({ original, translation, transliteration, startTime, endTime }, n) => ({
      original, translation, transliteration, startTime, endTime, verse: index, n, count: lines.length,
    }));
  });
}

export function sungFraction(line: TimedLine, time: number) {
  if (line.endTime <= line.startTime) return time >= line.startTime ? 1 : 0;
  return Math.min(1, Math.max(0, (time - line.startTime) / (line.endTime - line.startTime)));
}

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

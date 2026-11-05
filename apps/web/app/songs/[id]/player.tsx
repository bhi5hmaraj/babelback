'use client';

import { useEffect, useRef, useState } from 'react';
import type { InferResponseType } from 'hono/client';
import type { api } from '../../../api.ts';

type Seed = InferResponseType<ReturnType<typeof api>['v1']['seeds'][':id']['$get'], 200>;

export function Player({ audioUrl, verses }: { audioUrl: string; verses: Seed['song']['verses'] }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [time, setTime] = useState(0);
  const active = verses.findIndex((verse) => verse.startTime <= time && time < verse.endTime);

  useEffect(() => {
    document.getElementById(`verse-${active}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active]);

  function seek(seconds: number) {
    if (!audio.current) return;
    audio.current.currentTime = seconds;
    void audio.current.play();
  }

  return (
    <>
      <audio ref={audio} controls src={audioUrl} onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} />
      <ol className="verses">
        {verses.map((verse, index) => (
          <li key={index} id={`verse-${index}`} className={index === active ? 'active' : undefined}>
            <button type="button" onClick={() => seek(verse.startTime)}>
              <span>{verse.original}</span>
              <span className="transliteration">{verse.transliteration}</span>
              <span className="translation">{verse.translation}</span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

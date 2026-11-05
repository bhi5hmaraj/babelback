'use client';

import { useState, type ComponentProps } from 'react';
import { UploadForm } from './form.tsx';
import { YoutubeForm } from './youtube.tsx';
import styles from '../workflows.module.css';

type Props = ComponentProps<typeof UploadForm> & { youtubePrice: number; youtubeImport: boolean };

export function AddSong({ youtubePrice, youtubeImport, ...upload }: Props) {
  const [source, setSource] = useState<'youtube' | 'upload'>(youtubeImport ? 'youtube' : 'upload');
  return <>
    {youtubeImport && <div role="group" aria-label="Where the song comes from" className={styles.choices}>
      {(['youtube', 'upload'] as const).map((item) => <button key={item} type="button" className={styles.chip}
        aria-pressed={source === item} onClick={() => setSource(item)}>{item === 'youtube' ? 'YouTube link' : 'Upload a file'}</button>)}
    </div>}
    {source === 'youtube'
      ? <YoutubeForm credits={upload.credits} price={youtubePrice} maxSongSeconds={upload.maxSongSeconds} />
      : <UploadForm {...upload} />}
  </>;
}

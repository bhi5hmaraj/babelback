import Link from 'next/link';
import { redirect } from 'next/navigation';
import { account } from '../../auth.ts';
import { api } from '../../api.ts';
import { UploadForm } from './form.tsx';
import styles from '../workflows.module.css';

export const metadata = { title: 'Add a song - Babelback' };

export default async function AddPage() {
  const user = await account();
  if (!user) redirect('/sign-in');
  const response = await api().v1.config.$get();
  if (!response.ok) throw new Error('Could not load upload prices. Please try again.');
  const settings = await response.json();
  return <main className={styles.backdrop}>
    <section aria-labelledby="add-heading" className={styles.sheet}>
      <div aria-hidden="true" className={styles.handle} />
      <div className={styles.row}>
        <h1 id="add-heading" className={styles.heading}>Add a song</h1>
        <Link href="/" aria-label="Close add song" className={styles.close}>X</Link>
      </div>
      <UploadForm credits={user.creditBalance} price={settings.analysisCredits} maxUploadMb={settings.maxUploadMb} maxSongSeconds={settings.maxSongSeconds} />
    </section>
  </main>;
}

import Link from 'next/link';
import { api } from '../api.ts';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const response = await api().v1.seeds.$get();
  const { seeds } = await response.json();
  return (
    <>
      <h1>Try a song</h1>
      <ul className="songs">
        {seeds.map((seed) => (
          <li key={seed.id}>
            <Link href={`/songs/${seed.id}`}>{seed.title}</Link>
            <small>
              {seed.originalLanguage} to {seed.language}
            </small>
          </li>
        ))}
      </ul>
    </>
  );
}

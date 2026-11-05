import Link from 'next/link';
import styles from './workflows.module.css';

export function Navigation({ active }: { active: 'home' | 'library' | 'practice' }) {
  return (
    <nav aria-label="Main" className={styles.nav}>
      <Link href="/" aria-current={active === 'home' ? 'page' : undefined}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />
        </svg>
        Home
      </Link>
      <Link href="/library" aria-current={active === 'library' ? 'page' : undefined}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M5 4v16M10 4v16M14.5 5l4.5 15" />
        </svg>
        Library
      </Link>
      <button type="button" disabled title="Practice scoring is coming next">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
        Practise
      </button>
    </nav>
  );
}

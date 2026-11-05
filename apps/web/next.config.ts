import { join } from 'node:path';
import type { NextConfig } from 'next';

// The workspace root is apps/, not the old app at the repo root.
const root = join(import.meta.dirname, '..');

export default { turbopack: { root }, outputFileTracingRoot: root } satisfies NextConfig;

import type { MetadataRoute } from 'next';

// Chrome offers to install a site over HTTPS whose manifest has these fields and 192 and 512 px icons.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Babelback',
    short_name: 'Babelback',
    description: 'Sing along to songs in any language, line by line.',
    start_url: '/',
    display: 'standalone',
    background_color: '#15171C',
    theme_color: '#15171C',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // The mark sits inside the centre 80%, so launchers can crop it to a circle.
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

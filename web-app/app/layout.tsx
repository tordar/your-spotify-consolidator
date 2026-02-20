import './globals.css';
import { JetBrains_Mono } from 'next/font/google';
import { SpotifyStatsProvider } from '../components/SpotifyStatsContext';
import { PlaybackProvider } from '../components/PlaybackContext';
import MiniPlayer from '../components/MiniPlayer';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/react';

const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' });

// Bump this when you change the favicon so iOS and other caches fetch the new icon
const ICON_VERSION = '3'

export const metadata = {
  title: 'Spotify Pulse',
  description: 'Your Spotify listening: historic, current, and daily insights',
  icons: {
    // PNG first so Chrome on mobile picks it (Chrome often ignores SVG favicons)
    icon: [
      { url: '/icon', type: 'image/png', sizes: '32x32' },
      { url: `/icon.svg?v=${ICON_VERSION}`, type: 'image/svg+xml', sizes: 'any' },
    ],
    // PNG required for "Add to Home Screen" – iOS/Android ignore SVG for this
    apple: [{ url: '/apple-icon', type: 'image/png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Spotify Pulse',
    statusBarStyle: 'default',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${jetbrainsMono.variable} min-h-screen bg-gradient-to-br from-dark-surface via-dark-surfaceHover to-surface-800`}>
        <SpotifyStatsProvider>
          <PlaybackProvider>
            {children}
            <MiniPlayer />
          </PlaybackProvider>
        </SpotifyStatsProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}

import './globals.css';
import { JetBrains_Mono } from 'next/font/google';
import { SpotifyStatsProvider } from '../components/SpotifyStatsContext';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/react';

const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${jetbrainsMono.variable} min-h-screen bg-gradient-to-br from-dark-surface via-dark-surfaceHover to-surface-800`}>
        <SpotifyStatsProvider>
          {children}
        </SpotifyStatsProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}

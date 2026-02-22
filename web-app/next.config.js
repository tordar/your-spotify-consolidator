/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.scdn.co',
        port: '',
        pathname: '/image/**',
      },
    ],
  },
  // Keep large packages out of serverless function bundles to stay under Vercel's 250 MB limit
  serverExternalPackages: [
    'highcharts',
    'highcharts-react-official',
    'cal-heatmap',
  ],
}

module.exports = nextConfig

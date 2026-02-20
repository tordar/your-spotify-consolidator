import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          background: '#1DB954',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="150"
          height="150"
          viewBox="0 0 100 100"
          fill="none"
        >
          <path
            d="M 16 28 L 26 28 L 32 16 L 38 28 L 50 28 L 58 16 L 64 28 L 84 28"
            stroke="black"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M 16 50 L 30 50 L 36 62 L 42 50 L 50 50 L 58 38 L 64 50 L 84 50"
            stroke="black"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M 16 72 L 26 72 L 32 84 L 38 72 L 50 72 L 58 60 L 64 72 L 84 72"
            stroke="black"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
    ),
    { ...size }
  )
}

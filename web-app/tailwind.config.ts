import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		colors: {
  			background: '#0a0a0a',
  			foreground: '#fafafa',
  			surface: {
  				'50': '#f8f9fa',
  				'100': '#f1f3f4',
  				'200': '#e8eaed',
  				'300': '#dadce0',
  				'400': '#bdc1c6',
  				'500': '#9aa0a6',
  				'600': '#80868b',
  				'700': '#5f6368',
  				'800': '#3c4043',
  				'900': '#202124',
  				'950': '#171717'
  			},
  			primary: {
  				'50': '#f0fdf4',
  				'100': '#dcfce7',
  				'200': '#bbf7d0',
  				'300': '#86efac',
  				'400': '#4ade80',
  				'500': '#22c55e',
  				'600': '#16a34a',
  				'700': '#15803d',
  				'800': '#166534',
  				'900': '#14532d',
  				'950': '#052e16',
  				DEFAULT: '#22c55e',
  				foreground: '#ffffff'
  			},
  			secondary: {
  				'50': '#f8fafc',
  				'100': '#f1f5f9',
  				'200': '#e2e8f0',
  				'300': '#cbd5e1',
  				'400': '#94a3b8',
  				'500': '#64748b',
  				'600': '#475569',
  				'700': '#334155',
  				'800': '#1e293b',
  				'900': '#0f172a',
  				'950': '#020617',
  				DEFAULT: '#334155',
  				foreground: '#f8fafc'
  			},
  			accent: {
  				'50': '#f5f3ff',
  				'100': '#ede9fe',
  				'200': '#ddd6fe',
  				'300': '#c4b5fd',
  				'400': '#a78bfa',
  				'500': '#8b5cf6',
  				'600': '#7c3aed',
  				'700': '#6d28d9',
  				'800': '#5b21b6',
  				'900': '#4c1d95',
  				'950': '#2e1065',
  				DEFAULT: '#8b5cf6',
  				foreground: '#ffffff'
  			},
  			success: {
  				DEFAULT: '#22c55e',
  				foreground: '#ffffff'
  			},
  			warning: {
  				DEFAULT: '#f59e0b',
  				foreground: '#ffffff'
  			},
  			error: {
  				DEFAULT: '#ef4444',
  				foreground: '#ffffff'
  			},
  			border: '#2a2a2a',
  			input: '#1a1a1a',
  			ring: '#22c55e',
  			muted: {
  				DEFAULT: '#1a1a1a',
  				foreground: '#a1a1aa'
  			},
  			popover: {
  				DEFAULT: '#1a1a1a',
  				foreground: '#fafafa'
  			},
  			card: {
  				DEFAULT: '#111111',
  				foreground: '#fafafa',
  				accent: '#1a1a1a',
  				border: '#3a3a3a'
  			},
  			dark: {
  				bg: '#0a0a0a',
  				surface: '#111111',
  				surfaceHover: '#1a1a1a',
  				border: '#2a2a2a',
  				text: {
  					primary: '#fafafa',
  					secondary: '#a1a1aa',
  					muted: '#71717a'
  				}
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'deep-space': '#0B0F1A',
        'cosmic-blue': '#1E3A8A',
        'neon-cyan': '#22D3EE',
        'neon-green': '#10B981',
        'solar-amber': '#F59E0B',
        'alert-red': '#EF4444',
        'space-dark': '#05070D',
        'glass': 'rgba(255, 255, 255, 0.05)',
        'glass-border': 'rgba(255, 255, 255, 0.1)',
      },
      fontFamily: {
        'orbitron': ['Orbitron', 'sans-serif'],
        'inter': ['Inter', 'sans-serif'],
      },
      backgroundImage: {
        'space-gradient': 'radial-gradient(circle at top, #0B0F1A, #05070D)',
        'neon-glow': 'linear-gradient(90deg, #22D3EE 0%, transparent 100%)',
      },
      boxShadow: {
        'neon': '0 0 20px rgba(34, 211, 238, 0.3)',
        'neon-lg': '0 0 40px rgba(34, 211, 238, 0.4)',
        'alert': '0 0 20px rgba(239, 68, 68, 0.4)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(34, 211, 238, 0.2)' },
          '100%': { boxShadow: '0 0 30px rgba(34, 211, 238, 0.5)' },
        }
      }
    },
  },
  plugins: [],
}

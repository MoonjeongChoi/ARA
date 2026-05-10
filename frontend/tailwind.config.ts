import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        pwc: {
          red:        '#E0301E',
          redHover:   '#B52316',
          redSoft:    '#FDECEA',
          dark:       '#252525',
          neutral100: '#F5F5F5',
          neutral200: '#F0F0F0',
          neutral400: '#9CA3AF',
          infoSoft:   '#E6F1FB',
          info:       '#2563EB',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'var(--font-noto)', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config

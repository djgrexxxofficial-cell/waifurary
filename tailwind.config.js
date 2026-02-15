/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#fcb8cc',
        secondary: '#fcb8cc',
        selected: '#4c6ef5',
        border: '#dee2e6',
        'text-primary': '#212529',
        'text-secondary': '#495057',
        'text-muted': '#868e96',
        'bg-hover': '#f1f3f5',
      },
      backgroundColor: {
        'primary': '#fcb8cc',
        'secondary': '#fcb8cc',
        'hover': '#f1f3f5',
        'selected': '#4c6ef5',
      },
      textColor: {
        'primary': '#212529',
        'secondary': '#495057',
        'muted': '#868e96',
      },
      borderColor: {
        'border': '#dee2e6',
      },
      borderRadius: {
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
      },
      boxShadow: {
        'sm': '0 1px 3px rgba(0, 0, 0, 0.12)',
        'md': '0 4px 6px rgba(0, 0, 0, 0.1)',
        'lg': '0 10px 25px rgba(0, 0, 0, 0.15)',
      },
      transitionTimingFunction: {
        'custom': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      animation: {
        'fadeIn': 'fadeIn 0.2s ease-out',
        'dropdownSlide': 'dropdownSlide 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          from: {
            opacity: '0',
            transform: 'scale(0.95)',
          },
          to: {
            opacity: '1',
            transform: 'scale(1)',
          },
        },
        dropdownSlide: {
          from: {
            opacity: '0',
            transform: 'translateY(-8px)',
          },
          to: {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
      },
    },
  },
  plugins: [],
  darkMode: 'media',
}
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        body:  ['var(--font-body)'],
        sans:  ['var(--font-body)'],
      },
      borderRadius: {
        lg:      'var(--radius-card)',
        md:      'calc(var(--radius-card) - 2px)',
        sm:      'calc(var(--radius-card) - 4px)',
        sidebar: 'var(--radius-sidebar)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        canvas:     '#e7e7e7',
        surface:    '#ececec',
        'surface-alt': '#f1f1f0',
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border:  'hsl(var(--border))',
        input:   'hsl(var(--input))',
        ring:    'hsl(var(--ring))',
        success: {
          DEFAULT:    'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT:    'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT:              'hsl(var(--sidebar-background))',
          foreground:           'hsl(var(--sidebar-foreground))',
          primary:              'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent:               'hsl(var(--sidebar-accent))',
          'accent-foreground':  'hsl(var(--sidebar-accent-foreground))',
          border:               'hsl(var(--sidebar-border))',
          ring:                 'hsl(var(--sidebar-ring))',
        },
        'status-success': '#2ECC8A',
        'status-warning': '#FF8077',
        'status-danger':  '#FF8077',
        'status-info':    '#C9B3F5',
        'status-purple':  '#C9B3F5',
        'status-neutral': '#2e2e2e',
        'status-muted':   '#737373',
        sage:        '#2ECC8A',
        terracotta:  '#FF8077',
        blush:       '#F9AEBE',
        dustyblue:   '#B8EFF5',
        yellow:      '#F5F01A',
        neon:        '#CAFF2D',
        purple:      '#C9B3F5',
        lavender:    '#C9B3F5',
        brown:       '#C4996A',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
      },
      boxShadow: {
        'neu-out':    '-8px -8px 16px rgba(255,250,244,0.78), 8px 8px 18px rgba(160,143,126,0.31)',
        'neu-out-sm': '-5px -5px 10px rgba(255,250,244,0.78), 5px 5px 12px rgba(160,143,126,0.27)',
        'neu-in':     'inset -4px -4px 8px rgba(255,250,244,0.68), inset 4px 4px 8px rgba(160,143,126,0.24)',
        'neu-in-sm':  'inset -3px -3px 6px rgba(255,250,244,0.68), inset 3px 3px 6px rgba(160,143,126,0.24)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

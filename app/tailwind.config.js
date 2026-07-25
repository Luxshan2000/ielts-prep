/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 19 core tokens (12-design-system.md §1) — hsl(var(--token)) so that
        // opacity modifiers such as bg-primary/25 keep working.
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        sidebar: "hsl(var(--sidebar))",
        "sidebar-foreground": "hsl(var(--sidebar-foreground))",
        destructive: "hsl(var(--destructive))",
        "destructive-foreground": "hsl(var(--destructive-foreground))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        // BandReady extension tokens (§1.1) — status colors, never chart series.
        "band-low": "hsl(var(--band-low))",
        "band-mid": "hsl(var(--band-mid))",
        "band-good": "hsl(var(--band-good))",
        "band-strong": "hsl(var(--band-strong))",
        recording: "hsl(var(--recording))",
      },
      // Tailwind's stock opacity scale jumps 5 → 10 → 20, so `bg-primary/8` and
      // `bg-primary/12` silently generated NO css and every tinted Badge/callout
      // rendered transparent. 12 §3's surface tints sit between 5 % and 15 %, so the
      // two missing steps are declared here rather than rewritten at 16 call sites.
      opacity: {
        8: "0.08",
        12: "0.12",
      },
      fontFamily: {
        sans: ["Inter Variable", "Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "timer-pulse": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.04)" },
        },
        "band-reveal": {
          from: { opacity: "0", transform: "scale(0.85)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "recording-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        shimmer: "shimmer 1.5s infinite",
        "timer-pulse": "timer-pulse 1s ease-in-out infinite",
        "band-reveal": "band-reveal 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        "recording-pulse": "recording-pulse 1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

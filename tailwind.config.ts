import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  // Only generate CSS for used classes
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
  ],

  theme: {
    extend: {
      // ─── Brand Colors ──────────────────────────────────────────────────
      colors: {
        // Primary green — strictly reserved for actions, highlights, active states
        primary: {
          DEFAULT: "#34C759",
          50:  "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#34C759", // Brand green
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
          950: "#052e16",
        },
        // UI Grays — 80% white, 15% light gray
        surface: {
          white: "#FFFFFF",
          "50": "#F9FAFB",
          "100": "#F3F4F6",
          "200": "#E5E7EB",
          "300": "#D1D5DB",
          "400": "#9CA3AF",
          "500": "#6B7280",
          "600": "#4B5563",
          "700": "#374151",
          "800": "#1F2937",
          "900": "#111827",
        },
        // Status colors
        success: "#34C759",
        warning: "#FF9F0A",
        danger:  "#FF3B30",
        info:    "#007AFF",
      },

      // ─── Typography ────────────────────────────────────────────────────
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "Monaco", "monospace"],
      },

      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },

      // ─── Spacing ───────────────────────────────────────────────────────
      spacing: {
        "18": "4.5rem",
        "22": "5.5rem",
        "88": "22rem",
        "112": "28rem",
        "128": "32rem",
      },

      // ─── Border Radius ─────────────────────────────────────────────────
      borderRadius: {
        "4xl": "2rem",
      },

      // ─── Box Shadows ───────────────────────────────────────────────────
      boxShadow: {
        "card":       "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
        "card-hover": "0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
        "elevated":   "0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.05)",
        "inner-sm":   "inset 0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },

      // ─── Animations ────────────────────────────────────────────────────
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to:   { opacity: "1", transform: "translateX(0)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-green": {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.6" },
        },
        "progress-bar": {
          from: { backgroundPosition: "0 0" },
          to:   { backgroundPosition: "40px 0" },
        },
      },
      animation: {
        "fade-in":        "fade-in 0.25s ease-out forwards",
        "slide-in-right": "slide-in-right 0.25s ease-out forwards",
        "slide-up":       "slide-up 0.3s ease-out forwards",
        "pulse-green":    "pulse-green 2s ease-in-out infinite",
        "progress-bar":   "progress-bar 1s linear infinite",
      },

      // ─── Transitions ───────────────────────────────────────────────────
      transitionTimingFunction: {
        "spring": "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
      },
    },
  },

  plugins: [
    typography,
  ],
};

export default config;

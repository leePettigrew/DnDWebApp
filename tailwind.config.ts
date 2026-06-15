import type { Config } from "tailwindcss";

/**
 * Candlelit Scriptorium — the single source of truth for the visual system.
 *
 * Palette intent:
 *   parchment  → aged-paper surfaces (page → raised card → edges)
 *   ink        → text, from primary to faint
 *   oxblood    → primary accent: danger, damage, "important"
 *   brass/gilt → secondary accent: active state, gilt highlights, focus
 *   forest     → success / healing
 *   arcane     → magic / spells (a cool counterpoint to all the warmth)
 *
 * Spacing uses Tailwind's default 4px scale, used consistently throughout.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        parchment: {
          50: "#FBF5E6",
          100: "#F5E9CF",
          200: "#ECDCB8",
          300: "#E0CBA0",
          400: "#CBB07F",
          500: "#B5996A",
        },
        ink: {
          DEFAULT: "#2B2117",
          soft: "#5C4A33",
          faint: "#897154",
        },
        oxblood: {
          DEFAULT: "#7A2E2E",
          dark: "#5E2020",
          light: "#9B4A43",
        },
        brass: {
          DEFAULT: "#B98A3C",
          dark: "#8A6526",
          light: "#D4A95A",
        },
        gilt: "#E6C772",
        forest: {
          DEFAULT: "#3E5641",
          light: "#5A7A5E",
        },
        arcane: {
          DEFAULT: "#4A3B6B",
          light: "#6E5A99",
        },
        leather: "#211A12",
      },
      fontFamily: {
        display: ["var(--font-display)", "Cinzel", "Georgia", "serif"],
        body: ["var(--font-body)", "EB Garamond", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(43,33,23,0.10), 0 8px 24px -12px rgba(43,33,23,0.35)",
        raised:
          "0 2px 4px rgba(43,33,23,0.12), 0 16px 40px -18px rgba(43,33,23,0.45)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 6px rgba(43,33,23,0.10)",
        gilt: "0 0 0 1px rgba(230,199,114,0.6), 0 0 18px -2px rgba(230,199,114,0.55)",
        oxblood: "0 0 0 1px rgba(122,46,46,0.55), 0 0 18px -4px rgba(122,46,46,0.5)",
      },
      borderRadius: {
        card: "0.6rem",
      },
      letterSpacing: {
        title: "0.06em",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "dice-tumble": {
          "0%": { transform: "rotate(0deg) scale(0.9)" },
          "25%": { transform: "rotate(220deg) scale(1.08)" },
          "50%": { transform: "rotate(440deg) scale(0.96)" },
          "75%": { transform: "rotate(680deg) scale(1.04)" },
          "100%": { transform: "rotate(900deg) scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 1px rgba(230,199,114,0.5), 0 0 12px -2px rgba(230,199,114,0.4)" },
          "50%": { boxShadow: "0 0 0 1px rgba(230,199,114,0.85), 0 0 22px 0 rgba(230,199,114,0.7)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.4s ease-out both",
        "fade-in": "fade-in 0.3s ease-out both",
        "dice-tumble": "dice-tumble 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "pulse-glow": "pulse-glow 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;

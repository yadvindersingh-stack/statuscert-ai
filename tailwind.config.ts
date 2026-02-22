import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0B1C2B",
        slate: "#5B6670",
        parchment: "#F7F4EE",
        gold: "#B08D57",
        warn: "#8B5E3C",
        good: "#2E6B4E"
      },
      fontFamily: {
        serif: ["Spectral", "ui-serif", "Georgia"],
        sans: ["Source Sans 3", "ui-sans-serif", "system-ui"]
      },
      boxShadow: {
        card: "0 12px 30px rgba(11, 28, 43, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;

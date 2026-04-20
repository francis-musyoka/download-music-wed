import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-2": "var(--bg-2)",
        fg: "var(--fg)",
        "fg-dim": "var(--fg-dim)",
        "fg-muted": "var(--fg-muted)",
        accent: "var(--accent)",
        "accent-2": "var(--accent-2)",
        line: "var(--line)",
        "line-bright": "var(--line-bright)",
      },
      fontFamily: {
        display: "var(--ff-display)",
        body: "var(--ff-body)",
        mono: "var(--ff-mono)",
      },
    },
  },
  plugins: [],
};

export default config;

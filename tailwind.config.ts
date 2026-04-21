import type { Config } from "tailwindcss";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const animate = require("tailwindcss-animate");

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
        // Shadcn aliases mapped to brutalist design tokens so the Toast
        // (and any future shadcn component) picks up the app's palette.
        background: "var(--bg-2)",
        foreground: "var(--fg)",
        destructive: "#c01818",
        "destructive-foreground": "#ffffff",
        secondary: "var(--bg-2)",
        "secondary-foreground": "var(--fg)",
        muted: "var(--bg-2)",
        "muted-foreground": "var(--fg-dim)",
        border: "var(--line-bright)",
        input: "var(--line-bright)",
        ring: "var(--accent)",
      },
      fontFamily: {
        display: "var(--ff-display)",
        body: "var(--ff-body)",
        mono: "var(--ff-mono)",
      },
    },
  },
  plugins: [animate],
};

export default config;

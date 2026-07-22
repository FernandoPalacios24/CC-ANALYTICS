import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: { colors: { ink: "#070709", panel: "#111116", neon: "#9d4edd" }, boxShadow: { glow: "0 0 34px rgba(157,78,221,.18)" } } },
  plugins: [],
} satisfies Config;

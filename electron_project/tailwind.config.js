/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./renderer.js", "./**/*.html", "./**/*.js"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#171A1C",
        surface: "#1E2225",
        surface2: "#262B2F",
        primary: "#E0B465",
        primaryHover: "#F0C57A",
        accent: "#6FB7FF",
        text: {
          DEFAULT: "#F3F5F7",
          muted: "#B5BBC4",
        },
        borderc: "#323940"
      },
      boxShadow: {
        soft: "0 2px 8px 0 rgb(0 0 0 / 0.3), 0 1px 3px -1px rgb(0 0 0 / 0.2)",
        lift: "0 10px 25px -5px rgb(0 0 0 / 0.4), 0 4px 10px -4px rgb(0 0 0 / 0.3)",
      },
      fontFamily: {
        sans: ['"SF Pro Text"', "-apple-system", "BlinkMacSystemFont", "system-ui", "Inter", "sans-serif"],
        display: ['"SF Pro Display"', "-apple-system", "BlinkMacSystemFont", "system-ui", "Inter", "sans-serif"],
        mono: ['"SF Mono"', "JetBrains Mono", "monospace"],
      },
      borderRadius: { xl2: "1.25rem" }
    }
  },
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/typography")],
};
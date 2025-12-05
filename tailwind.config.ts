import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // 은자모바탕 설정 제거됨 (기본 serif 폰트 사용)
        
        // 보고서용 등폭 폰트 (Courier New 등)는 유지
        mono: ["Courier New", "Courier", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out forwards",
        "loading-bar": "loading 2s infinite linear",
        stamp: "stamp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        loading: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        stamp: {
          "0%": { opacity: "0", transform: "scale(3) rotate(-12deg)" },
          "100%": { opacity: "0.9", transform: "scale(1) rotate(-12deg)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
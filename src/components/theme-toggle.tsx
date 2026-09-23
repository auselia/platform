"use client";

import { useEffect, useState } from "react";

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2.5M12 19v2.5M4.5 12H2M22 12h-2.5M5.6 5.6l1.8 1.8M18.4 5.6l-1.8 1.8M5.6 18.4l1.8-1.8M18.4 18.4l-1.8-1.8" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

const DARK_QUERY = "(prefers-color-scheme: dark)";
const KEY = "auselia-theme";

const systemTheme = (): "light" | "dark" => (window.matchMedia(DARK_QUERY).matches ? "dark" : "light");

// No stored choice means "follow the device" (the CSS does that on its own). A stored choice
// is only kept when it differs from the device, so picking the device's own theme goes back
// to following it, and a stale override can't pin the site to one theme forever.
export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const sync = () => {
      const attr = document.documentElement.getAttribute("data-theme");
      setTheme(attr === "dark" || attr === "light" ? attr : systemTheme());
    };
    sync();
    const mq = window.matchMedia(DARK_QUERY);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      if (next === systemTheme()) {
        document.documentElement.removeAttribute("data-theme");
        localStorage.removeItem(KEY);
      } else {
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem(KEY, next);
      }
    } catch {}
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle color theme"
      className="flex items-center justify-center rounded-full border border-border p-2 text-ink2"
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

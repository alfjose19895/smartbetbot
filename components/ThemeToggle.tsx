"use client";

import React, { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = (localStorage.getItem("smartbetbot_theme") || "dark") as "dark" | "light";
    setTheme(saved);
    applyTheme(saved);
  }, []);

  const applyTheme = (t: "dark" | "light") => {
    const root = document.documentElement;
    if (t === "dark") {
      root.classList.remove("light");
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
      root.style.colorScheme = "dark";
    } else {
      root.classList.remove("dark");
      root.classList.add("light");
      root.setAttribute("data-theme", "light");
      root.style.colorScheme = "light";
    }
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("smartbetbot_theme", next);
    applyTheme(next);
  };

  if (!mounted) {
    return (
      <button
        aria-label="Cambiar tema"
        className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
      >
        🌙
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      aria-label={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}
      title={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}
      className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-800 shadow-sm transition-all hover:border-emerald-500 hover:scale-105 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

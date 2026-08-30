"use client";

import React, { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem("theme") as "dark" | "light" | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle("light", savedTheme === "light");
      document.documentElement.classList.toggle("dark", savedTheme === "dark");
    } else {
      setTheme("dark");
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    document.documentElement.classList.toggle("light", nextTheme === "light");
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  };

  if (!mounted) {
    return (
      <button
        aria-label="Cambiar tema"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/80 text-slate-300 transition"
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
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-900/90 text-slate-200 shadow-sm transition hover:border-emerald-500 hover:bg-slate-800 hover:text-white dark:border-slate-800 dark:bg-slate-900"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

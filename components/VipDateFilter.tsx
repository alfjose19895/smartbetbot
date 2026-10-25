"use client";

import React from "react";

export interface VipDateFilterProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  loading?: boolean;
}

function getEcuadorDate(offsetDays: number = 0): string {
  try {
    const target = new Date();
    target.setDate(target.getDate() + offsetDays);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(target);
  } catch {
    const target = new Date();
    target.setDate(target.getDate() + offsetDays);
    return target.toISOString().split("T")[0];
  }
}

export function VipDateFilter({
  selectedDate,
  onDateChange,
  loading = false,
}: VipDateFilterProps) {
  const today = getEcuadorDate(0);
  const yesterday = getEcuadorDate(-1);
  const tomorrow = getEcuadorDate(1);

  const isToday = selectedDate === today;
  const isYesterday = selectedDate === yesterday;
  const isTomorrow = selectedDate === tomorrow;

  return (
    <div className="flex flex-wrap items-center gap-2 bg-slate-900/80 backdrop-blur-md p-1.5 rounded-2xl border border-slate-800 shadow-sm">
      <div className="flex items-center gap-1">
        <button
          type="button"
          /* non-blocking */
          onClick={() => onDateChange(yesterday)}
          className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 ${
            isYesterday
              ? "bg-slate-800 text-white border border-slate-700 shadow-sm"
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
          title="Ver cartelera de ayer"
        >
          📅 Ayer
        </button>

        <button
          type="button"
          /* non-blocking */
          onClick={() => onDateChange(today)}
          className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 ${
            isToday
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm font-black"
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
          title="Ver cartelera de hoy"
        >
          🟢 Hoy
        </button>

        <button
          type="button"
          /* non-blocking */
          onClick={() => onDateChange(tomorrow)}
          className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 ${
            isTomorrow
              ? "bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-sm font-black"
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
          title="Ver cartelera de mañana"
        >
          ⚡ Mañana
        </button>
      </div>

      <div className="h-4 w-px bg-slate-800 hidden sm:block" />

      <div className="flex items-center gap-1.5 px-1">
        <label htmlFor="vip-date-picker" className="text-[11px] font-bold text-slate-400">
          Fecha:
        </label>
        <input
          id="vip-date-picker"
          type="date"
          /* non-blocking */
          value={selectedDate}
          onChange={(e) => {
            if (e.target.value) {
              onDateChange(e.target.value);
            }
          }}
          className="rounded-xl border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white focus:border-emerald-500 focus:outline-hidden cursor-pointer disabled:opacity-50"
        />
      </div>

      {!isToday && (
        <button
          type="button"
          /* non-blocking */
          onClick={() => onDateChange(today)}
          className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 underline pl-1 cursor-pointer"
        >
          (Volver a Hoy)
        </button>
      )}
    </div>
  );
}

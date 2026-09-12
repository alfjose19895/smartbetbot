"use client";

import React, { useState, useEffect } from "react";

interface SalesCountdownProps {
  targetDate?: string;
  className?: string;
  showLabels?: boolean;
}

export function SalesCountdown({
  targetDate = "2026-10-31T23:59:59",
  className = "",
  showLabels = true,
}: SalesCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const calculateTime = () => {
      const difference = +new Date(targetDate) - +new Date();
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  const units = [
    { label: "Días", value: timeLeft.days },
    { label: "Horas", value: timeLeft.hours },
    { label: "Min", value: timeLeft.minutes },
    { label: "Seg", value: timeLeft.seconds },
  ];

  return (
    <div className={`flex items-center gap-2 sm:gap-3 ${className}`}>
      {units.map((unit, idx) => (
        <React.Fragment key={unit.label}>
          <div className="flex flex-col items-center">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-slate-900/90 border border-emerald-500/30 shadow-lg shadow-emerald-950/40 backdrop-blur-md">
              <span className="text-lg sm:text-xl font-black text-emerald-400 font-mono tracking-tight">
                {String(unit.value).padStart(2, "0")}
              </span>
            </div>
            {showLabels && (
              <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {unit.label}
              </span>
            )}
          </div>
          {idx < units.length - 1 && (
            <span className="text-emerald-500/60 font-black text-lg pb-4 select-none">:</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

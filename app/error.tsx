'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Application Error Caught]:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full rounded-3xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 text-center shadow-2xl space-y-5">
        <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-emerald-500/10 text-3xl border border-emerald-500/20">
          ⚡
        </div>
        <div>
          <h2 className="text-xl font-black text-white">SmartBetBot</h2>
          <p className="text-xs text-slate-400 mt-1">
            Hubo un retraso temporal al cargar los datos deportivos.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 pt-2">
          <button
            onClick={() => reset()}
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition cursor-pointer"
          >
            🔄 Reintentar Carga
          </button>
          <Link
            href="/dashboard"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs font-bold text-slate-300 hover:bg-slate-800 transition text-center"
          >
            Ir al Dashboard Principal
          </Link>
        </div>
      </div>
    </div>
  );
}

'use client';

import React from 'react';

export default function GlobalRootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full rounded-3xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 text-center shadow-2xl space-y-5">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-emerald-500/10 text-3xl border border-emerald-500/20">
            ⚡
          </div>
          <div>
            <h2 className="text-xl font-black text-white">SmartBetBot</h2>
            <p className="text-xs text-slate-400 mt-1">
              La aplicación se está reiniciando para actualizar los servicios.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.reload();
                } else {
                  reset();
                }
              }}
              className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition cursor-pointer"
            >
              🔄 Recargar Aplicación
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

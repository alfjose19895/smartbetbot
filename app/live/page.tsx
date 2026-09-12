"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LivePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400 text-xs">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
        <span>Redirigiendo al panel principal...</span>
      </div>
    </div>
  );
}

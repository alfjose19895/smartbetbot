"use client";

import React, { useState, useEffect } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushNotificationManager() {
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [testSending, setTestSending] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
      checkExistingSubscription();
    }
  }, []);

  const checkExistingSubscription = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        setIsSubscribed(Boolean(sub));
      }
    } catch (err) {
      console.warn("Could not check push subscription:", err);
    }
  };

  const subscribeToPush = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      // 1. Request Permission
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        setStatusMessage("Permiso de notificaciones denegado en el navegador.");
        setLoading(false);
        return;
      }

      // 2. Register Service Worker
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      // 3. Fetch VAPID Public Key
      const keyRes = await fetch("/api/push/subscribe");
      const keyData = await keyRes.json();
      if (!keyData.vapidPublicKey) {
        throw new Error("No se pudo obtener la clave VAPID pública");
      }

      const applicationServerKey = urlBase64ToUint8Array(keyData.vapidPublicKey);

      // 4. Subscribe with PushManager
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      // 5. Send subscription to server
      const subJSON = subscription.toJSON();
      const saveRes = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: subJSON.keys,
        }),
      });

      const saveResult = await saveRes.json();
      if (saveResult.success) {
        setIsSubscribed(true);
        setStatusMessage("✅ ¡Teléfono vinculado con éxito! Recibirás las alertas del día.");
      } else {
        throw new Error(saveResult.error || "Error al registrar en servidor");
      }
    } catch (err: any) {
      console.error("Subscription error:", err);
      setStatusMessage(`Error: ${err.message || "No se pudo activar las alertas"}`);
    } finally {
      setLoading(false);
    }
  };

  const unsubscribeFromPush = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
      }
      setIsSubscribed(false);
      setStatusMessage("Notificaciones desactivadas para este dispositivo.");
    } catch (err: any) {
      console.error("Unsubscribe error:", err);
      setStatusMessage("Error al desactivar notificaciones.");
    } finally {
      setLoading(false);
    }
  };

  const sendTestAlert = async () => {
    setTestSending(true);
    setStatusMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;

      const res = await fetch("/api/push/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub?.endpoint,
          title: "🔔 SmartBetBot: ¡Alerta Push Activa!",
          message: "⭐ Tu teléfono está listo. Recibirás las mejores alertas de Ganador Local, Over 2.5 y los 3 Parleys diarios.",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatusMessage("📲 ¡Notificación de prueba enviada! Revisa tu pantalla.");
      } else {
        setStatusMessage(`Error: ${data.error || "No se pudo enviar la prueba"}`);
      }
    } catch (err: any) {
      setStatusMessage("Error de conexión al enviar prueba.");
    } finally {
      setTestSending(false);
    }
  };

  if (!isSupported) {
    return null;
  }

  return (
    <>
      {/* Floating Push Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-full shadow-2xl border border-emerald-400/30 transition-all duration-300 transform hover:scale-105 active:scale-95"
        title="Alertas Push en tu Teléfono"
      >
        <span className="relative flex h-3 w-3">
          {isSubscribed ? (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400"></span>
            </>
          ) : (
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-400"></span>
          )}
        </span>
        <span className="text-sm font-bold tracking-wide">
          {isSubscribed ? "🔔 Alertas Móvil: ON" : "🔔 Activar Alertas Móvil"}
        </span>
      </button>

      {/* Settings Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl text-slate-100 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-xl">
                  📱
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white">Alertas Push al Teléfono</h3>
                  <p className="text-xs text-slate-400">Notificaciones automáticas diarias</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            {/* Status Card */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">Estado del Dispositivo:</span>
                {isSubscribed ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Vinculado y Activo
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    No Vinculado
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-300 leading-relaxed">
                {isSubscribed ? (
                  <p>
                    Recibirás en tu pantalla de bloqueo los mejores pronósticos de <strong className="text-emerald-400">Ganador Local</strong>, <strong className="text-emerald-400">Over 2.5 Goles</strong> y los <strong className="text-teal-400">3 Parleys exclusivos</strong> cada mañana.
                  </p>
                ) : (
                  <p>
                    Activa las notificaciones en este navegador o teléfono móvil para que el motor MCP te envíe las alertas de mayor valor (+EV) del día.
                  </p>
                )}
              </div>

              {/* iOS Tips */}
              <div className="bg-slate-900/90 rounded-lg p-2.5 border border-slate-800 text-[11px] text-slate-400">
                💡 <span className="font-semibold text-slate-300">En iPhone (iOS):</span> Pulsa <strong>Compartir</strong> ➔ <strong>Añadir a pantalla de inicio</strong> para recibir notificaciones nativas en la pantalla de bloqueo.
              </div>
            </div>

            {/* Status Message */}
            {statusMessage && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-600/40 rounded-xl text-xs text-emerald-300 text-center font-medium animate-fadeIn">
                {statusMessage}
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-1">
              {!isSubscribed ? (
                <button
                  onClick={subscribeToPush}
                  disabled={loading}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition"
                >
                  {loading ? (
                    <span className="animate-spin text-lg">⏳</span>
                  ) : (
                    <span>🔔 Vincular y Activar Alertas en este Teléfono</span>
                  )}
                </button>
              ) : (
                <div className="space-y-2">
                  <button
                    onClick={sendTestAlert}
                    disabled={testSending}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow flex items-center justify-center gap-2 transition"
                  >
                    {testSending ? (
                      <span className="animate-spin">⏳</span>
                    ) : (
                      <span>📲 Enviar Alerta de Prueba Inmediata</span>
                    )}
                  </button>
                  <button
                    onClick={unsubscribeFromPush}
                    disabled={loading}
                    className="w-full py-2 px-4 bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-700 font-medium text-xs rounded-xl transition"
                  >
                    Desvincular Notificaciones
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

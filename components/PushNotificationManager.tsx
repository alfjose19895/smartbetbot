"use client";

import React, { useState, useEffect } from "react";

export function openPushModal() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("smartbetbot:open-push-modal"));
  }
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const clean = base64String.trim().replace(/^["']|["']$/g, "");
  const padding = "=".repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

interface PushNotificationManagerProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function PushNotificationManager({
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
}: PushNotificationManagerProps = {}) {
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [testSending, setTestSending] = useState<boolean>(false);
  const [individualSending, setIndividualSending] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [internalIsOpen, setInternalIsOpen] = useState<boolean>(false);

  const isModalOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  const handleClose = () => {
    if (controlledOnClose) {
      controlledOnClose();
    } else {
      setInternalIsOpen(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
      checkExistingSubscription();
    }

    const handleOpenEvent = () => setInternalIsOpen(true);
    if (typeof window !== "undefined") {
      window.addEventListener("smartbetbot:open-push-modal", handleOpenEvent);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("smartbetbot:open-push-modal", handleOpenEvent);
      }
    };
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
      // 0. Check secure context
      if (typeof window !== "undefined" && !window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
        throw new Error("Las notificaciones Push requieren conexión segura HTTPS.");
      }

      // 1. Request Permission
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        setStatusMessage("Permiso de notificaciones denegado en el navegador.");
        setLoading(false);
        return;
      }

      // 2. Register Service Worker & Wait for Ready
      let reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      }
      await navigator.serviceWorker.ready;

      // 3. Auto-clean existing stale subscription to avoid push service key mismatch error
      try {
        const existingSub = await reg.pushManager.getSubscription();
        if (existingSub) {
          await existingSub.unsubscribe();
        }
      } catch (unsubErr) {
        console.warn("Could not clean old subscription:", unsubErr);
      }

      // 4. Fetch VAPID Public Key from Server
      const keyRes = await fetch("/api/push/subscribe");
      const keyData = await keyRes.json();
      if (!keyData.vapidPublicKey) {
        throw new Error("No se pudo obtener la clave VAPID pública");
      }

      const applicationServerKey = urlBase64ToUint8Array(keyData.vapidPublicKey);

      // 5. Subscribe with PushManager
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      });

      // 6. Send subscription to server
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
        setStatusMessage("✅ ¡Teléfono vinculado con éxito! Recibirás las alertas individuales de alta confianza.");
      } else {
        throw new Error(saveResult.error || "Error al registrar en servidor");
      }
    } catch (err: any) {
      console.error("Subscription error:", err);
      let errMsg = err.message || "No se pudo activar las alertas";
      if (errMsg.includes("push service error")) {
        errMsg = "Error de conexión con el servicio Push de Google/FCM. Por favor verifica tu conexión a internet o intenta reiniciar el navegador.";
      }
      setStatusMessage(`Error: ${errMsg}`);
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

      if (!sub) {
        setStatusMessage("Primero debes vincular este teléfono pulsando 'Vincular y Activar Alertas'.");
        setTestSending(false);
        return;
      }

      const subJSON = sub.toJSON();

      const res = await fetch("/api/push/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: subJSON.keys,
          subscription: subJSON,
          title: "🔔 SmartBetBot: ¡Alerta Push Activa!",
          message: "⭐ Tu teléfono está listo para recibir alertas individuales de partidos con confianza muy alta.",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatusMessage("📲 ¡Notificación de prueba enviada! Revisa tu pantalla.");
      } else {
        setStatusMessage(`Error: ${data.error || "No se pudo enviar la prueba"}`);
      }
    } catch (err: any) {
      console.error("Send test error:", err);
      setStatusMessage("Error de conexión al enviar la prueba push.");
    } finally {
      setTestSending(false);
    }
  };

  const sendIndividualPicksAlerts = async () => {
    setIndividualSending(true);
    setStatusMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;

      if (!sub) {
        setStatusMessage("Primero debes vincular este teléfono pulsando 'Vincular y Activar Alertas'.");
        setIndividualSending(false);
        return;
      }

      const subJSON = sub.toJSON();

      const res = await fetch("/api/push/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "individual_picks",
          endpoint: sub.endpoint,
          keys: subJSON.keys,
          subscription: subJSON,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatusMessage(`🔥 ¡${data.sentCount || data.totalPicks || "Varias"} alertas individuales enviadas a tu teléfono con su pronóstico y cuota!`);
      } else {
        setStatusMessage(`Error: ${data.error || "No se pudieron enviar las alertas individuales"}`);
      }
    } catch (err: any) {
      console.error("Send individual alerts error:", err);
      setStatusMessage("Error al enviar alertas individuales.");
    } finally {
      setIndividualSending(false);
    }
  };

  if (!isModalOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl text-slate-100 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 flex items-center justify-center text-xl shadow-xs">
              📱
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white">Alertas Push al Teléfono</h3>
              <p className="text-xs text-slate-400">Pronósticos individuales de confianza alta</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
            aria-label="Cerrar modal de alertas"
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
                Recibirás <strong className="text-emerald-400">alertas individuales en tu pantalla de bloqueo</strong> para cada partido con <strong className="text-emerald-400">confianza muy alta</strong> (Ganador Local y Over 2.5), además de los <strong className="text-teal-400">3 Parleys exclusivos</strong>.
              </p>
            ) : (
              <p>
                Activa las notificaciones en este dispositivo para que el motor MCP te envíe una alerta individual por cada partido de confianza muy alta.
              </p>
            )}
          </div>

          {/* Browser Support check */}
          {!isSupported && (
            <div className="p-2.5 bg-amber-950/40 border border-amber-600/40 rounded-lg text-xs text-amber-300">
              ⚠️ Este navegador no soporta Web Push estándar. En iPhone (iOS), pulsa <strong>Compartir</strong> ➔ <strong>Añadir a pantalla de inicio</strong> y abre la app desde el icono.
            </div>
          )}

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
              disabled={loading || !isSupported}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition cursor-pointer"
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
                onClick={sendIndividualPicksAlerts}
                disabled={individualSending || testSending}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {individualSending ? (
                  <span className="animate-spin">⏳ Enviando alertas individuales...</span>
                ) : (
                  <span>🔥 Probar Alertas Individuales (Picks Alta Confianza)</span>
                )}
              </button>
              <button
                onClick={sendTestAlert}
                disabled={testSending || individualSending}
                className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {testSending ? (
                  <span className="animate-spin">⏳ Enviando...</span>
                ) : (
                  <span>📲 Prueba Rápida de Conexión</span>
                )}
              </button>
              <button
                onClick={unsubscribeFromPush}
                disabled={loading}
                className="w-full py-2 px-4 bg-slate-900 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-800 font-medium text-xs rounded-xl transition cursor-pointer"
              >
                Desvincular Notificaciones
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

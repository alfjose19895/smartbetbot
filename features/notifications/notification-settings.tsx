"use client";

import type { FormEvent } from "react";
import { useState } from "react";

import type { Me } from "@/features/api/types";
import { browserApi } from "@/features/api/client";

const markets = ["total_goals", "both_teams_to_score", "match_winner", "double_chance"];

function firebaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
  );
}

export function NotificationSettings({ account }: { account: Me }) {
  const [preferences, setPreferences] = useState(account.preferences);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const result = await browserApi<Me>("/me/preferences", {
      method: "PATCH",
      body: JSON.stringify({
        minimum_smart_score: preferences.minimum_smart_score,
        minimum_probability: preferences.minimum_probability,
        minimum_edge: preferences.minimum_edge,
        live_enabled: preferences.live_enabled,
        prematch_enabled: preferences.prematch_enabled,
        markets: preferences.markets,
        quiet_hours_enabled: preferences.quiet_hours_enabled,
        quiet_hours_start: preferences.quiet_hours_enabled ? preferences.quiet_hours_start : null,
        quiet_hours_end: preferences.quiet_hours_enabled ? preferences.quiet_hours_end : null,
        timezone: preferences.timezone,
      }),
    });
    if (result.data) setPreferences(result.data.preferences);
    setMessage(result.error ? "No se pudieron guardar las preferencias." : "Preferencias guardadas.");
    setBusy(false);
  }

  async function enablePush() {
    if (!firebaseConfigured()) {
      setMessage("Firebase Web y VAPID todavía no están configurados.");
      return;
    }
    setBusy(true);
    try {
      const [{ initializeApp, getApps }, { getMessaging, getToken, isSupported }] = await Promise.all([
        import("firebase/app"),
        import("firebase/messaging"),
      ]);
      if (!(await isSupported())) throw new Error("unsupported");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("permission_denied");
      const app = getApps()[0] || initializeApp({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      });
      const registration = await navigator.serviceWorker.ready;
      const token = await getToken(getMessaging(app), {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: registration,
      });
      if (!token) throw new Error("missing_token");
      const result = await browserApi("/push/register", {
        method: "POST",
        body: JSON.stringify({
          fcm_token: token,
          platform: "web",
          device_id: navigator.userAgent.slice(0, 120),
          user_agent: navigator.userAgent,
        }),
      });
      if (result.error) throw new Error(result.error);
      localStorage.setItem("smartbetbot:fcm-token", token);
      setMessage("Notificaciones push activadas y token actualizado.");
    } catch {
      setMessage("No se pudo activar push. Revisa permisos y configuración Firebase.");
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    const token = localStorage.getItem("smartbetbot:fcm-token");
    if (!token) {
      setMessage("Este navegador no tiene una suscripción guardada.");
      return;
    }
    setBusy(true);
    try {
      const result = await browserApi("/push/register", {
        method: "DELETE",
        body: JSON.stringify({ fcm_token: token }),
      });
      if (result.error) throw new Error(result.error);
      if (firebaseConfigured()) {
        const [{ getApps }, { deleteToken, getMessaging, isSupported }] = await Promise.all([
          import("firebase/app"),
          import("firebase/messaging"),
        ]);
        const app = getApps()[0];
        if (app && (await isSupported())) await deleteToken(getMessaging(app));
      }
      localStorage.removeItem("smartbetbot:fcm-token");
      setMessage("Notificaciones desactivadas.");
    } catch {
      setMessage("No se pudo eliminar la suscripción.");
    } finally {
      setBusy(false);
    }
  }

  function toggleMarket(market: string) {
    setPreferences((current) => ({
      ...current,
      markets: current.markets.includes(market)
        ? current.markets.filter((item) => item !== market)
        : [...current.markets, market],
    }));
  }

  return <section className="notification-settings">
    <form onSubmit={savePreferences}>
      <div className="settings-section-heading"><div><span>Umbrales personales</span><h2>Alert preferences</h2></div><button disabled={busy} type="submit">Guardar</button></div>
      <div className="preference-grid"><label>Smart Score mínimo<input type="number" min="0" max="100" value={preferences.minimum_smart_score} onChange={(event) => setPreferences({ ...preferences, minimum_smart_score: Number(event.target.value) })} /></label><label>Probabilidad mínima<input type="number" min="0" max="1" step="0.01" value={preferences.minimum_probability} onChange={(event) => setPreferences({ ...preferences, minimum_probability: Number(event.target.value) })} /></label><label>Edge mínimo<input type="number" min="-1" max="1" step="0.01" value={preferences.minimum_edge} onChange={(event) => setPreferences({ ...preferences, minimum_edge: Number(event.target.value) })} /></label><label>Zona horaria<input value={preferences.timezone} onChange={(event) => setPreferences({ ...preferences, timezone: event.target.value })} /></label></div>
      <div className="toggle-row"><label><input type="checkbox" checked={preferences.live_enabled} onChange={(event) => setPreferences({ ...preferences, live_enabled: event.target.checked })} /> Live</label><label><input type="checkbox" checked={preferences.prematch_enabled} onChange={(event) => setPreferences({ ...preferences, prematch_enabled: event.target.checked })} /> Prematch</label><label><input type="checkbox" checked={preferences.quiet_hours_enabled} onChange={(event) => setPreferences({ ...preferences, quiet_hours_enabled: event.target.checked })} /> Quiet hours</label></div>
      {preferences.quiet_hours_enabled ? <div className="quiet-hours"><label>Desde<input type="time" value={preferences.quiet_hours_start || "22:00"} onChange={(event) => setPreferences({ ...preferences, quiet_hours_start: event.target.value })} /></label><label>Hasta<input type="time" value={preferences.quiet_hours_end || "07:00"} onChange={(event) => setPreferences({ ...preferences, quiet_hours_end: event.target.value })} /></label></div> : null}
      <fieldset><legend>Mercados · vacío significa todos</legend><div className="market-options">{markets.map((market) => <label key={market}><input type="checkbox" checked={preferences.markets.includes(market)} onChange={() => toggleMarket(market)} /> {market.replaceAll("_", " ")}</label>)}</div></fieldset>
    </form>
    <div className="push-actions"><div><span>Firebase Cloud Messaging</span><h3>Push en este dispositivo</h3><p>El token puede renovarse pulsando Activar nuevamente.</p></div><button disabled={busy} onClick={enablePush} type="button">Activar / refrescar</button><button className="secondary" disabled={busy} onClick={disablePush} type="button">Desactivar</button></div>
    {message ? <p className="settings-feedback" role="status">{message}</p> : null}
  </section>;
}

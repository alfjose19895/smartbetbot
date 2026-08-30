"use client";

import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { SUPPORTED_LEAGUES, ALL_LEAGUE_IDS, TOP_5_LEAGUE_IDS, CUPS_LEAGUE_IDS, AMERICAS_LEAGUE_IDS } from "@/lib/sports/api-football";

interface UserItem {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "user";
  roleId?: number;
  roleName?: string;
  status: "approved" | "pending";
  createdAt: string;
}

export default function AdminControlPage() {
  const [activeTab, setActiveTab] = useState<"sports" | "users">("sports");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<"all" | "top5" | "cups" | "americas">("all");

  // Users state
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [userMsg, setUserMsg] = useState<string | null>(null);

  const addLog = (msg: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 49)]);
  };

  const getTargetLeagueIds = () => {
    switch (selectedGroup) {
      case "top5":
        return TOP_5_LEAGUE_IDS;
      case "cups":
        return CUPS_LEAGUE_IDS;
      case "americas":
        return AMERICAS_LEAGUE_IDS;
      default:
        return ALL_LEAGUE_IDS;
    }
  };

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (data.users) {
        setUsers(data.users);
      }
    } catch {
      addLog("✗ Error al cargar la lista de usuarios");
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (activeTab === "users") {
      fetchUsers();
    }
  }, [activeTab]);

  const handleToggleApproval = async (user: UserItem) => {
    const nextStatus = user.status === "approved" ? "pending" : "approved";
    try {
      setUserMsg(`Actualizando estado de ${user.email}...`);
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          action: "updateStatus",
          status: nextStatus,
        }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, status: nextStatus } : u))
        );
        addLog(`✓ Usuario ${user.email} marcado como ${nextStatus === "approved" ? "APROBADO" : "PENDIENTE"}`);
      }
    } catch {
      addLog(`✗ Error al actualizar usuario ${user.email}`);
    } finally {
      setTimeout(() => setUserMsg(null), 3000);
    }
  };

  const handleToggleRole = async (user: UserItem) => {
    const nextRole = user.role === "admin" ? "user" : "admin";
    try {
      setUserMsg(`Cambiando rol de ${user.email}...`);
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          action: "updateRole",
          role: nextRole,
        }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, role: nextRole } : u))
        );
        addLog(`✓ Rol de ${user.email} cambiado a ${nextRole.toUpperCase()}`);
      }
    } catch {
      addLog(`✗ Error al cambiar rol de ${user.email}`);
    } finally {
      setTimeout(() => setUserMsg(null), 3000);
    }
  };

  const handleSyncLeagues = async () => {
    try {
      setLoadingAction("leagues");
      const targetIds = getTargetLeagueIds();
      addLog(`⚡ Iniciando sincronización de ${targetIds.length} ligas...`);

      const res = await fetch("/api/admin/sync/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueIds: targetIds }),
      });
      const data = await res.json();
      if (data.success) {
        addLog(`✓ Ligas sincronizadas: ${data.leaguesSaved} ligas, ${data.teamsSaved} equipos.`);
      } else {
        addLog(`✗ Error en sincronización de ligas: ${data.error || "Desconocido"}`);
      }
    } catch (err) {
      addLog(`✗ Fallo de red al sincronizar ligas: ${String(err)}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSyncFixtures = async () => {
    try {
      setLoadingAction("fixtures");
      const targetIds = getTargetLeagueIds();
      addLog(`⚡ Consultando próximos partidos y cuotas para ${targetIds.length} ligas...`);

      const res = await fetch("/api/admin/sync/fixtures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueIds: targetIds, lookaheadDays: 14 }),
      });
      const data = await res.json();
      if (data.success) {
        addLog(`✓ Fixtures sincronizados: ${data.fixturesSaved} partidos guardados con cuotas.`);
      } else {
        addLog(`✗ Error en sincronización de fixtures: ${data.error || "Desconocido"}`);
      }
    } catch (err) {
      addLog(`✗ Fallo de red al sincronizar fixtures: ${String(err)}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleGeneratePredictions = async () => {
    try {
      setLoadingAction("predictions");
      const targetIds = getTargetLeagueIds();
      addLog(`⚡ Ejecutando motor de pronósticos para ${targetIds.length} ligas...`);

      const res = await fetch("/api/admin/sync/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueIds: targetIds }),
      });
      const data = await res.json();
      if (data.success) {
        addLog(`✓ Motor finalizado: ${data.count} oportunidades de valor calculadas con éxito.`);
      } else {
        addLog(`✗ Error en cálculo de pronósticos: ${data.error || "Desconocido"}`);
      }
    } catch (err) {
      addLog(`✗ Fallo de red al generar pronósticos: ${String(err)}`);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 overflow-x-hidden">
      <Navbar userRole="admin" />

      <main className="mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-xl bg-purple-500/10 px-3 py-1 text-xs font-extrabold text-purple-700 dark:bg-purple-500/10 dark:text-purple-400 border border-purple-500/30">
              <span>👑</span>
              <span>Panel de Control Maestro (Admin)</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              Administración General & Control de Usuarios
            </h1>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm dark:text-slate-400">
              Gestiona fuentes de datos de API-Football, cuotas de casas de apuestas y aprobación de usuarios apostadores
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mt-6 flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab("sports")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "sports"
                ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800"
            }`}
          >
            <span>⚽</span>
            <span>Sincronización Deportiva & Cuotas</span>
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "users"
                ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800"
            }`}
          >
            <span>👥</span>
            <span>Gestión de Usuarios & Aprobaciones ({users.length || "..."})</span>
          </button>
        </div>

        {/* TAB 1: SPORTS SYNC */}
        {activeTab === "sports" && (
          <div className="mt-6 space-y-6">
            {/* Group Selector */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                Seleccionar Conjunto de Ligas a Sincronizar:
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  onClick={() => setSelectedGroup("all")}
                  className={`rounded-xl p-3 text-left transition border ${
                    selectedGroup === "all"
                      ? "bg-emerald-50 border-emerald-500 text-slate-900 font-bold dark:bg-emerald-950/80 dark:border-emerald-500 dark:text-white"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-950/60 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <div className="text-base">⚡ Todas las Ligas</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{ALL_LEAGUE_IDS.length} ligas activas</div>
                </button>

                <button
                  onClick={() => setSelectedGroup("top5")}
                  className={`rounded-xl p-3 text-left transition border ${
                    selectedGroup === "top5"
                      ? "bg-emerald-50 border-emerald-500 text-slate-900 font-bold dark:bg-emerald-950/80 dark:border-emerald-500 dark:text-white"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-950/60 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <div className="text-base">🏆 Top 5 Europa</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Premier, LaLiga, Serie A, etc.</div>
                </button>

                <button
                  onClick={() => setSelectedGroup("cups")}
                  className={`rounded-xl p-3 text-left transition border ${
                    selectedGroup === "cups"
                      ? "bg-emerald-50 border-emerald-500 text-slate-900 font-bold dark:bg-emerald-950/80 dark:border-emerald-500 dark:text-white"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-950/60 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <div className="text-base">⭐ Copas & UEFA</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Champions, Europa, Libertadores</div>
                </button>

                <button
                  onClick={() => setSelectedGroup("americas")}
                  className={`rounded-xl p-3 text-left transition border ${
                    selectedGroup === "americas"
                      ? "bg-emerald-50 border-emerald-500 text-slate-900 font-bold dark:bg-emerald-950/80 dark:border-emerald-500 dark:text-white"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-950/60 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <div className="text-base">🌎 Américas & Más</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Brasil, Argentina, MX, MLS</div>
                </button>
              </div>
            </div>

            {/* 1-Click Sync Cards Grid */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                <div>
                  <span className="text-2xl">🏆</span>
                  <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-white">Sincronizar Ligas</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Descarga metadatos y logos de las {getTargetLeagueIds().length} ligas y sus planteles.
                  </p>
                </div>
                <button
                  onClick={handleSyncLeagues}
                  disabled={!!loadingAction}
                  className="mt-5 w-full rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-800 transition hover:bg-slate-200 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:border-slate-700 disabled:opacity-50"
                >
                  {loadingAction === "leagues" ? "⏳ Sincronizando..." : `🔄 Sincronizar (${getTargetLeagueIds().length})`}
                </button>
              </div>

              <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                <div>
                  <span className="text-2xl">⚽</span>
                  <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-white">Partidos & Cuotas</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Consulta partidos programados a 14 días y descarga líneas de cuotas de casas de apuestas.
                  </p>
                </div>
                <button
                  onClick={handleSyncFixtures}
                  disabled={!!loadingAction}
                  className="mt-5 w-full rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-800 transition hover:bg-slate-200 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:border-slate-700 disabled:opacity-50"
                >
                  {loadingAction === "fixtures" ? "⏳ Sincronizando..." : "🔄 Sincronizar Fixtures"}
                </button>
              </div>

              <div className="flex flex-col justify-between rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm dark:border-emerald-900/60 dark:bg-gradient-to-b dark:from-slate-900 dark:to-emerald-950/40">
                <div>
                  <span className="text-2xl">⚡</span>
                  <h3 className="mt-3 text-base font-bold text-emerald-800 dark:text-emerald-400">Generar Pronósticos</h3>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Calcula cuotas justas, valor esperado y genera los picks recomendados para apostadores.
                  </p>
                </div>
                <button
                  onClick={handleGeneratePredictions}
                  disabled={!!loadingAction}
                  className="mt-5 w-full rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 shadow-md shadow-emerald-500/20 disabled:opacity-50"
                >
                  {loadingAction === "predictions" ? "⏳ Calculando..." : "🚀 Generar Todos los Picks"}
                </button>
              </div>
            </div>

            {/* Supported Leagues List */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                Ligas Incluidas en el Catálogo ({SUPPORTED_LEAGUES.length})
              </h4>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {SUPPORTED_LEAGUES.map((l) => (
                  <span
                    key={l.id}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-800 border border-slate-200 dark:bg-slate-950/80 dark:text-slate-300 dark:border-slate-800"
                  >
                    <span>{l.name}</span>
                    <span className="text-[10px] text-slate-500 font-normal">({l.country})</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: USER MANAGEMENT & APPROVALS */}
        {activeTab === "users" && (
          <div className="mt-6 space-y-6">
            {userMsg && (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-300 p-3 text-center text-xs font-bold text-emerald-800 dark:bg-emerald-950/80 dark:border-emerald-700 dark:text-emerald-300">
                {userMsg}
              </div>
            )}

            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900/80">
              <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    Usuarios Registrados & Control de Acceso
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Aprueba nuevos registros y define qué usuarios tienen rol de Administrador o Apostador
                  </p>
                </div>
                <button
                  onClick={fetchUsers}
                  className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  🔄 Refrescar
                </button>
              </div>

              {loadingUsers ? (
                <div className="py-12 text-center text-slate-500">
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                  <p className="mt-2 text-xs font-semibold">Cargando usuarios...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase text-[11px] tracking-wider dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3.5">Usuario / Correo</th>
                        <th className="px-4 py-3.5">Rol Actual</th>
                        <th className="px-4 py-3.5 text-center">Estado</th>
                        <th className="px-4 py-3.5 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800/60 dark:text-slate-300">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50 transition dark:hover:bg-slate-850/60">
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-900 dark:text-white">{u.fullName}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{u.email}</div>
                          </td>
                          <td className="px-4 py-3">
                            {u.role === "admin" ? (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700 border border-purple-200 dark:bg-purple-950/80 dark:text-purple-300 dark:border-purple-800">
                                👑 {u.roleName || "Administrador"} (ID: {u.roleId || 1})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 border border-blue-200 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-800">
                                🎯 {u.roleName || "Apostador"} (ID: {u.roleId || 2})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {u.status === "approved" ? (
                              <span className="inline-flex items-center rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-800">
                                ✓ Aprobado
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 border border-amber-200 dark:bg-amber-950/80 dark:text-amber-400 dark:border-amber-800">
                                ⏳ Pendiente
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleToggleApproval(u)}
                                className={`rounded-xl px-2.5 py-1 text-xs font-bold transition border ${
                                  u.status === "approved"
                                    ? "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                                    : "bg-emerald-500 text-slate-950 hover:bg-emerald-400 border-emerald-400 shadow-sm"
                                }`}
                              >
                                {u.status === "approved" ? "Pausar" : "✓ Aprobar Cuenta"}
                              </button>

                              <button
                                onClick={() => handleToggleRole(u)}
                                className="rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:border-slate-700"
                              >
                                {u.role === "admin" ? "Hacer Apostador" : "Hacer Admin"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live Terminal Console */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-900 p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Consola de Ejecución en Tiempo Real
              </h4>
            </div>
            <button
              onClick={() => setLogs([])}
              className="text-[11px] text-slate-500 hover:text-slate-300"
            >
              Limpiar consola
            </button>
          </div>

          <div className="mt-4 flex max-h-56 flex-col gap-1.5 overflow-y-auto font-mono text-xs text-slate-300">
            {logs.length === 0 ? (
              <div className="text-slate-500">Esperando acciones del administrador...</div>
            ) : (
              logs.map((log, index) => (
                <div
                  key={index}
                  className={`py-0.5 ${
                    log.includes("✓")
                      ? "text-emerald-400"
                      : log.includes("✗")
                      ? "text-red-400"
                      : "text-slate-300"
                  }`}
                >
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

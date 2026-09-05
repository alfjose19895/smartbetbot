"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { PredictionCard } from "@/components/PredictionCard";
import { MatchDetailModal } from "@/components/MatchDetailModal";
import { MarketOpportunity } from "@/lib/sports/prediction-engine";
import { SUPPORTED_LEAGUES, ALL_LEAGUE_IDS, TOP_5_LEAGUE_IDS, CUPS_LEAGUE_IDS, AMERICAS_LEAGUE_IDS } from "@/lib/sports/api-football";

interface UserItem {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "user";
  roleId?: number;
  roleName?: string;
  status: "approved" | "paused" | "pending";
  createdAt: string;
  lastSignInAt?: string | null;
  lastSignInFormatted?: string;
  loginCount?: number;
}

interface AuditItem {
  id: string;
  userId?: string;
  email: string;
  fullName?: string;
  action: string;
  actionLabel: string;
  ip?: string;
  userAgent?: string;
  device?: string;
  timestamp: string;
  formattedDate: string;
}

function AdminControlContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<"sports" | "users" | "audit" | "mcp">(
    tabParam === "mcp" ? "mcp" : tabParam === "audit" ? "audit" : tabParam === "users" ? "users" : "sports"
  );

  useEffect(() => {
    if (tabParam === "mcp") {
      setActiveTab("mcp");
    } else if (tabParam === "audit") {
      setActiveTab("audit");
    } else if (tabParam === "users") {
      setActiveTab("users");
    } else if (tabParam === "sports") {
      setActiveTab("sports");
    }
  }, [tabParam]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<"all" | "top5" | "cups" | "americas">("all");

  // Users state
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [userMsg, setUserMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Audit Logs state
  const [auditLogs, setAuditLogs] = useState<AuditItem[]>([]);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);
  const [auditSearch, setAuditSearch] = useState<string>("");
  const [auditActionFilter, setAuditActionFilter] = useState<string>("all");

  // Edit Modal State
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<string>("bettor");
  const [editStatus, setEditStatus] = useState<"approved" | "paused">("approved");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState<"all" | "pending" | "approved" | "paused">("all");
  // MCP Agent State (Admin Exclusive)
  const [mcpQuery, setMcpQuery] = useState("");
  const [mcpCountry, setMcpCountry] = useState("españa");
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpResults, setMcpResults] = useState<MarketOpportunity[]>([]);
  const [mcpMetrics, setMcpMetrics] = useState<{
    totalMatches: number;
    averageProbability: string;
    averageOdds: string;
    highConfidenceCount: number;
  } | null>(null);
  const [mcpAiAnalysis, setMcpAiAnalysis] = useState<{
    intent: string;
    summary: string;
    insights: string[];
    recommendation: string;
    parlayRecommendation?: {
      totalOdds: string;
      combinedProbability: string;
      selectionsCount: number;
      legs: Array<{ match: string; market: string; selection: string; odds: number }>;
    };
  } | null>(null);
  const [mcpSearched, setMcpSearched] = useState(false);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);

  const QUICK_COUNTRIES = [
    { id: "españa", label: "España", flag: "🇪🇸" },
    { id: "inglaterra", label: "Inglaterra", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
    { id: "alemania", label: "Alemania", flag: "🇩🇪" },
    { id: "italia", label: "Italia", flag: "🇮🇹" },
    { id: "francia", label: "Francia", flag: "🇫🇷" },
    { id: "portugal", label: "Portugal", flag: "🇵🇹" },
    { id: "ecuador", label: "Ecuador", flag: "🇪🇨" },
    { id: "mexico", label: "México", flag: "🇲🇽" },
    { id: "costa rica", label: "Costa Rica", flag: "🇨🇷" },
    { id: "brasil", label: "Brasil", flag: "🇧🇷" },
    { id: "argentina", label: "Argentina", flag: "🇦🇷" },
    { id: "colombia", label: "Colombia", flag: "🇨🇴" },
  ];

  const handleMcpSearch = async (customQuery?: string, countryParam?: string) => {
    const activeQuery = customQuery !== undefined ? customQuery : mcpQuery;
    const activeCountry = countryParam !== undefined ? countryParam : mcpCountry;

    setMcpLoading(true);
    setMcpSearched(true);
    try {
      const res = await fetch("/api/mcp/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: activeQuery,
          country: activeCountry,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMcpResults(data.predictions || []);
        setMcpMetrics(data.metrics || null);
        setMcpAiAnalysis(data.aiAnalysis || null);
      }
    } catch (err) {
      console.error("MCP Admin search error:", err);
    } finally {
      setMcpLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "mcp" && mcpResults.length === 0 && !mcpSearched) {
      handleMcpSearch("Pronósticos de España para hoy", "españa");
    }
  }, [activeTab]);


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
      if (data.auditLogs) {
        setAuditLogs(data.auditLogs);
      }
    } catch {
      addLog("✗ Error al cargar la lista de usuarios");
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      setLoadingAudit(true);
      const res = await fetch("/api/admin/users?type=audit");
      const data = await res.json();
      if (data.auditLogs) {
        setAuditLogs(data.auditLogs);
      }
    } catch {
      addLog("✗ Error al cargar la bitácora de conexiones");
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    if (activeTab === "users") {
      fetchUsers();
    } else if (activeTab === "audit") {
      fetchAuditLogs();
    }
  }, [activeTab]);

  const pendingUsers = users.filter((u) => u.status === "pending");
  const pendingUsersCount = pendingUsers.length;
  const approvedUsersCount = users.filter((u) => u.status === "approved").length;
  const pausedUsersCount = users.filter((u) => u.status === "paused").length;
  const filteredUsers = users.filter((u) => {
    if (userFilter === "pending") return u.status === "pending";
    if (userFilter === "approved") return u.status === "approved";
    if (userFilter === "paused") return u.status === "paused";
    return true;
  });

  const openEditModal = (user: UserItem) => {
    setEditingUser(user);
    setEditFullName(user.fullName);
    setEditEmail(user.email);
    setEditPassword("");
    setEditRole(user.role === "admin" ? "admin" : "bettor");
    setEditStatus(user.status === "paused" ? "paused" : "approved");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      setSavingEdit(true);
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: editingUser.id,
          action: "editUser",
          fullName: editFullName,
          email: editEmail,
          password: editPassword.trim() ? editPassword.trim() : undefined,
          role: editRole,
          status: editStatus,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setUserMsg({ text: `✓ Usuario ${editEmail} actualizado con éxito.`, type: "success" });
        addLog(`✓ Datos actualizados para ${editEmail}`);
        setEditingUser(null);
        await fetchUsers();
      } else {
        setUserMsg({ text: `✗ ${data.error || "Error al actualizar usuario"}`, type: "error" });
      }
    } catch (err) {
      setUserMsg({ text: `✗ Fallo de red: ${String(err)}`, type: "error" });
    } finally {
      setSavingEdit(false);
      setTimeout(() => setUserMsg(null), 4000);
    }
  };

  const handleDeleteUser = async (user: UserItem) => {
    if (!window.confirm(`¿Estás seguro de ELIMINAR permanentemente a ${user.email}? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      setDeletingId(user.id);
      setUserMsg({ text: `Eliminando usuario ${user.email}...`, type: "success" });
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          action: "deleteUser",
        }),
      });

      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
        addLog(`✓ Usuario ${user.email} eliminado permanentemente.`);
        setUserMsg({ text: `✓ Usuario ${user.email} eliminado definitivamente.`, type: "success" });
      } else {
        const data = await res.json();
        setUserMsg({ text: `✗ Error: ${data.error || "No se pudo eliminar"}`, type: "error" });
      }
    } catch (err) {
      setUserMsg({ text: `✗ Fallo de red: ${String(err)}`, type: "error" });
    } finally {
      setDeletingId(null);
      setTimeout(() => setUserMsg(null), 4000);
    }
  };


  const handleToggleApproval = async (user: UserItem) => {
    const nextStatus = user.status === "approved" ? "pending" : "approved";
    try {
      setUserMsg({ text: `Actualizando estado de ${user.email}...`, type: "success" });
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
      setUserMsg({ text: `Cambiando rol de ${user.email}...`, type: "success" });
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
        <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab("sports")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
              activeTab === "sports"
                ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-black"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800"
            }`}
          >
            <span>⚽</span>
            <span>Sincronización Deportiva & Cuotas</span>
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
              activeTab === "users"
                ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-black"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800"
            }`}
          >
            <span>👥</span>
            <span>Gestión de Usuarios & Aprobaciones ({users.length || "..."})</span>
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
              activeTab === "audit"
                ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-black"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800"
            }`}
          >
            <span>📑</span>
            <span>Bitácora de Conexiones & Accesos ({auditLogs.length || "..."})</span>
          </button>
          <button
            onClick={() => setActiveTab("mcp")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
              activeTab === "mcp"
                ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-black"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800"
            }`}
          >
            <span>🤖</span>
            <span>Agente MCP de Pronósticos</span>
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

        {/* TAB 2: USER MANAGEMENT */}
        {activeTab === "users" && (
          <div className="mt-6 space-y-6">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block">Total Usuarios</span>
                <span className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{users.length}</span>
              </div>
              <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4 shadow-sm dark:border-amber-700/60 dark:bg-amber-950/30">
                <span className="text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300 block">⏳ Pendientes Aprobación</span>
                <span className="mt-1 text-2xl font-black text-amber-800 dark:text-amber-400">{pendingUsersCount}</span>
              </div>
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50/60 p-4 shadow-sm dark:border-emerald-700/60 dark:bg-emerald-950/30">
                <span className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300 block">✓ Aprobados / Activos</span>
                <span className="mt-1 text-2xl font-black text-emerald-800 dark:text-emerald-400">{approvedUsersCount}</span>
              </div>
              <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4 shadow-sm dark:border-red-800/60 dark:bg-red-950/30">
                <span className="text-[10px] font-bold uppercase text-red-700 dark:text-red-400 block">⏸️ Pausados / Bloqueados</span>
                <span className="mt-1 text-2xl font-black text-red-700 dark:text-red-400">{pausedUsersCount}</span>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-600 mr-1 dark:text-slate-400">Filtrar Estado:</span>
                <button
                  onClick={() => setUserFilter("all")}
                  className={`rounded-xl px-3 py-1 text-xs font-bold transition cursor-pointer ${
                    userFilter === "all"
                      ? "bg-slate-900 text-white dark:bg-slate-700"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  Todos ({users.length})
                </button>
                <button
                  onClick={() => setUserFilter("pending")}
                  className={`rounded-xl px-3 py-1 text-xs font-bold transition cursor-pointer ${
                    userFilter === "pending"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  ⏳ Pendientes ({pendingUsersCount})
                </button>
                <button
                  onClick={() => setUserFilter("approved")}
                  className={`rounded-xl px-3 py-1 text-xs font-bold transition cursor-pointer ${
                    userFilter === "approved"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  ✓ Aprobados ({approvedUsersCount})
                </button>
                <button
                  onClick={() => setUserFilter("paused")}
                  className={`rounded-xl px-3 py-1 text-xs font-bold transition cursor-pointer ${
                    userFilter === "paused"
                      ? "bg-red-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  ⏸️ Pausados ({pausedUsersCount})
                </button>
              </div>
            </div>

            {userMsg && (
              <div className={`rounded-2xl p-3 text-center text-xs font-bold ${
                userMsg.type === "success"
                  ? "bg-emerald-50 border border-emerald-300 text-emerald-800 dark:bg-emerald-950/80 dark:border-emerald-700 dark:text-emerald-300"
                  : "bg-red-50 border border-red-300 text-red-800 dark:bg-red-950/80 dark:border-red-700 dark:text-red-300"
              }`}>
                {userMsg.text}
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900/80">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    Usuarios Registrados & Control de Acceso
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Supervisa última conexión, cantidad de accesos y gestiona roles y aprobaciones
                  </p>
                </div>
                <button
                  onClick={fetchUsers}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
                >
                  🔄 Refrescar
                </button>
              </div>

              {loadingUsers ? (
                <div className="py-8 text-center text-slate-500">
                  <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                  <p className="mt-1.5 text-xs font-semibold">Cargando usuarios...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Usuario / Correo</th>
                        <th className="px-3 py-2">Rol Actual</th>
                        <th className="px-3 py-2">Último Inicio de Sesión</th>
                        <th className="px-3 py-2 text-center">Conexiones</th>
                        <th className="px-3 py-2 text-center">Estado</th>
                        <th className="px-3 py-2 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800/60 dark:text-slate-300">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50/80 transition dark:hover:bg-slate-850/60">
                          <td className="px-3 py-2">
                            <div className="font-bold text-slate-900 dark:text-white leading-snug">{u.fullName}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">{u.email}</div>
                          </td>
                          <td className="px-3 py-2">
                            {u.role === "admin" ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-700 border border-purple-200 dark:bg-purple-950/80 dark:text-purple-300 dark:border-purple-800">
                                👑 {u.roleName || "Administrador"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-200 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-800">
                                🎯 {u.roleName || "Apostador"}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                              {u.lastSignInFormatted || "Sin registros"}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              {u.lastSignInAt ? "Hora local (Ecuador UTC-5)" : "Nunca conectado"}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className="inline-flex items-center justify-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
                              🔢 {u.loginCount || 0}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {u.status === "approved" ? (
                              <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-800">
                                ✓ Aprobado
                              </span>
                            ) : u.status === "paused" ? (
                              <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700 border border-red-200 dark:bg-red-950/80 dark:text-red-400 dark:border-red-800">
                                ⏸️ Pausado
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200 dark:bg-amber-950/80 dark:text-amber-400 dark:border-amber-800">
                                ⏳ Pendiente
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleToggleApproval(u)}
                                className={`rounded-lg px-2 py-0.5 text-[11px] font-bold transition border cursor-pointer ${
                                  u.status === "approved"
                                    ? "bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
                                    : "bg-emerald-500 text-slate-950 hover:bg-emerald-400 border-emerald-400 shadow-sm"
                                }`}
                                title={u.status === "approved" ? "Pausar usuario y bloquear acceso" : "Activar cuenta"}
                              >
                                {u.status === "approved" ? "⏸️ Pausar" : "✓ Aprobar"}
                              </button>

                              <button
                                onClick={() => openEditModal(u)}
                                className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:border-slate-700 cursor-pointer"
                                title="Editar datos o rol"
                              >
                                ✏️ Editar
                              </button>

                              <button
                                onClick={() => handleDeleteUser(u)}
                                disabled={deletingId === u.id}
                                className="rounded-lg bg-red-50 px-1.5 py-0.5 text-[11px] font-bold text-red-700 hover:bg-red-100 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900/60 cursor-pointer disabled:opacity-50"
                                title="Eliminar definitivamente"
                              >
                                {deletingId === u.id ? "⏳" : "🗑️"}
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

        {/* TAB 4: AGENTE MCP DE PRONÓSTICOS (AI INTERNAL AGENT) */}
        {activeTab === "mcp" && (
          <div className="mt-6 space-y-6">
            {/* AI Agent Header & Command Center */}
            <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950/40 p-6 shadow-2xl text-white">
              <div className="absolute top-0 right-0 -mt-8 -mr-8 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500 to-cyan-400 text-2xl shadow-lg shadow-emerald-500/30">
                    🤖
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg sm:text-xl font-black tracking-tight text-white">
                        Agente MCP de Inteligencia Cuantitativa
                      </h3>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-black text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        IA Activa
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Escribe lo que necesitas en lenguaje natural: el agente interpretará tu instrucción y aplicará el algoritmo cuantitativo en tiempo real.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleMcpSearch(mcpQuery, mcpCountry)}
                    disabled={mcpLoading}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-slate-950 shadow-lg shadow-emerald-500/25 hover:bg-emerald-400 transition cursor-pointer disabled:opacity-50"
                  >
                    {mcpLoading ? (
                      <>
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                        <span>Analizando...</span>
                      </>
                    ) : (
                      <>
                        <span>⚡</span>
                        <span>Ejecutar Consulta IA</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Natural Language Prompt Bar */}
              <div className="mt-5 space-y-3">
                <div className="relative flex items-center">
                  <span className="absolute left-4 text-lg text-emerald-400 pointer-events-none">💬</span>
                  <input
                    type="text"
                    value={mcpQuery}
                    onChange={(e) => setMcpQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleMcpSearch(mcpQuery, mcpCountry);
                      }
                    }}
                    placeholder="Ejemplo: 'busca partidos de Costa Rica con cuota mayor a 1.80' o 'analiza Alajuelense vs Saprissa' o 'dame un parley de 3 partidos'..."
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 pl-12 pr-28 py-3.5 text-sm text-white placeholder-slate-400 shadow-inner outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition"
                  />
                  <button
                    onClick={() => handleMcpSearch(mcpQuery, mcpCountry)}
                    disabled={mcpLoading}
                    className="absolute right-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-slate-950 hover:bg-emerald-400 transition cursor-pointer disabled:opacity-50"
                  >
                    Enviar
                  </button>
                </div>

                {/* Quick Prompt Suggestion Chips */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] font-bold text-slate-400 mr-1">Sugerencias rápidas:</span>
                  {[
                    { label: "🇨🇷 Alajuelense vs Saprissa", query: "analiza el clásico LD Alajuelense vs Deportivo Saprissa", country: "costa rica" },
                    { label: "🇪🇸 La Liga Española", query: "mejores pronósticos de La Liga española para hoy", country: "españa" },
                    { label: "🔥 Probabilidad > 65%", query: "busca los partidos con probabilidad mayor al 65%", country: "" },
                    { label: "⚽ Ambos Equipos Anotan", query: "partidos con Ambos Equipos Anotan y cuota mayor a 1.70", country: "" },
                    { label: "💣 Bombas Cuota > 2.00", query: "encuentra bombas del día con cuota mayor a 2.00", country: "" },
                    { label: "🎲 Parley de 3 Partidos", query: "genera un parley de 3 selecciones de alta confianza", country: "" },
                    { label: "🇪🇨 Ecuador Liga Pro", query: "pronósticos de la Liga Pro de Ecuador", country: "ecuador" },
                    { label: "🏴󠁧󠁢󠁥󠁮󠁧󠁿 Inglaterra Over 2.5", query: "partidos de ligas de Inglaterra con Over 2.5 goles", country: "inglaterra" },
                  ].map((chip, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setMcpQuery(chip.query);
                        setMcpCountry(chip.country || "españa");
                        handleMcpSearch(chip.query, chip.country);
                      }}
                      className="rounded-lg bg-slate-800/80 px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:bg-emerald-500/20 hover:text-emerald-300 border border-slate-700/60 transition cursor-pointer"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Reasoning & Briefing Card */}
            {mcpAiAnalysis && (
              <div className="rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-white via-emerald-50/20 to-white p-5 sm:p-6 shadow-sm dark:border-emerald-900/40 dark:from-slate-900 dark:via-slate-900/90 dark:to-slate-950">
                <div className="flex items-center gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-3.5">
                  <span className="text-xl">🧠</span>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                      Informe Ejecutivo del Agente de Inteligencia
                    </h4>
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      Objetivo: {mcpAiAnalysis.intent}
                    </span>
                  </div>
                </div>

                <div className="mt-3.5 space-y-3 text-xs text-slate-700 dark:text-slate-300">
                  <p className="font-medium leading-relaxed text-sm text-slate-900 dark:text-slate-100 bg-emerald-50/60 dark:bg-emerald-950/40 p-3 rounded-2xl border border-emerald-200/60 dark:border-emerald-800/40">
                    {mcpAiAnalysis.summary}
                  </p>

                  {mcpAiAnalysis.insights && mcpAiAnalysis.insights.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 block tracking-wider">
                        Factores Clave & Hallazgos Estadísticos:
                      </span>
                      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {mcpAiAnalysis.insights.map((insight, i) => (
                          <li key={i} className="flex items-start gap-2 bg-slate-50 dark:bg-slate-850 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800">
                            <span className="text-emerald-500 font-bold shrink-0">✦</span>
                            <span className="text-[11px] leading-snug">{insight}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Parlay Recommendation Card */}
                  {mcpAiAnalysis.parlayRecommendation && (
                    <div className="mt-3 rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-transparent p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🎲</span>
                          <span className="font-black text-slate-900 dark:text-white text-sm">
                            Combinada Sugerida ({mcpAiAnalysis.parlayRecommendation.selectionsCount} Selecciones)
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">Cuota Acumulada:</span>
                          <span className="text-base font-black text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded-lg">
                            @{mcpAiAnalysis.parlayRecommendation.totalOdds}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2.5 divide-y divide-slate-200 dark:divide-slate-800 text-[11px]">
                        {mcpAiAnalysis.parlayRecommendation.legs.map((leg, li) => (
                          <div key={li} className="py-1.5 flex items-center justify-between">
                            <span className="font-bold text-slate-800 dark:text-slate-200">{leg.match}</span>
                            <span className="text-slate-600 dark:text-slate-400">
                              {leg.market} ({leg.selection}) <strong className="text-emerald-600 dark:text-emerald-400">@{leg.odds.toFixed(2)}</strong>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-2 flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    <span>💡 Recomendación Operativa:</span>
                    <span className="text-emerald-700 dark:text-emerald-300">{mcpAiAnalysis.recommendation}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Metrics Header */}
            {mcpMetrics && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                  <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block">Partidos Coincidentes</span>
                  <span className="mt-0.5 text-2xl font-black text-slate-900 dark:text-white">{mcpMetrics.totalMatches}</span>
                </div>
                <div className="rounded-2xl border border-emerald-300 bg-emerald-50/60 p-4 shadow-sm dark:border-emerald-700/60 dark:bg-emerald-950/30">
                  <span className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300 block">Probabilidad Promedio</span>
                  <span className="mt-0.5 text-2xl font-black text-emerald-800 dark:text-emerald-400">{mcpMetrics.averageProbability}</span>
                </div>
                <div className="rounded-2xl border border-cyan-300 bg-cyan-50/60 p-4 shadow-sm dark:border-cyan-700/60 dark:bg-cyan-950/30">
                  <span className="text-[10px] font-bold uppercase text-cyan-800 dark:text-cyan-300 block">Cuota Promedio Real</span>
                  <span className="mt-0.5 text-2xl font-black text-cyan-800 dark:text-cyan-400">{mcpMetrics.averageOdds}</span>
                </div>
                <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4 shadow-sm dark:border-amber-700/60 dark:bg-amber-950/30">
                  <span className="text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300 block">Alta / Muy Alta Confianza</span>
                  <span className="mt-0.5 text-2xl font-black text-amber-800 dark:text-amber-400">{mcpMetrics.highConfidenceCount}</span>
                </div>
              </div>
            )}

            {/* Results Grid */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-black text-slate-900 dark:text-white">
                    Pronósticos Analizados por el Algoritmo ({mcpResults.length})
                  </h4>
                  {mcpLoading && (
                    <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                  )}
                </div>
              </div>

              {mcpLoading ? (
                <div className="py-16 text-center text-slate-500 rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" />
                  <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">
                    Ejecutando algoritmos cuantitativos y analizando líneas de apuestas...
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Calculando xG, probabilidades Poisson y valor esperado</p>
                </div>
              ) : mcpResults.length === 0 ? (
                <div className="py-16 text-center text-slate-500 rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <span className="text-3xl block mb-2">🔍</span>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    No se encontraron partidos que cumplan exactamente los criterios de tu búsqueda.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Prueba con un país diferente o una condición de cuota más amplia.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {mcpResults.map((opp) => (
                    <PredictionCard
                      key={opp.fixtureId}
                      prediction={opp}
                      onOpenDetail={(pick) => setActiveModalPick(pick)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: AUDIT LOG (BITÁCORA DE CONEXIONES) */}
        {activeTab === "audit" && (
          <div className="mt-6 space-y-6">
            {/* Audit KPI Cards */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block">Total Eventos Registrados</span>
                <span className="mt-0.5 text-xl font-black text-slate-900 dark:text-white">{auditLogs.length}</span>
              </div>
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50/60 p-3 shadow-sm dark:border-emerald-700/60 dark:bg-emerald-950/30">
                <span className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300 block">✓ Inicios de Sesión Exitosos</span>
                <span className="mt-0.5 text-xl font-black text-emerald-800 dark:text-emerald-400">
                  {auditLogs.filter((l) => l.action === "login_success").length}
                </span>
              </div>
              <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-3 shadow-sm dark:border-amber-700/60 dark:bg-amber-950/30">
                <span className="text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300 block">⏳ Accesos Pendientes</span>
                <span className="mt-0.5 text-xl font-black text-amber-800 dark:text-amber-400">
                  {auditLogs.filter((l) => l.action === "login_failed").length}
                </span>
              </div>
              <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-3 shadow-sm dark:border-blue-800/60 dark:bg-blue-950/30">
                <span className="text-[10px] font-bold uppercase text-blue-700 dark:text-blue-400 block">👥 Usuarios Únicos Registrados</span>
                <span className="mt-0.5 text-xl font-black text-blue-700 dark:text-blue-400">
                  {new Set(auditLogs.map((l) => l.email)).size}
                </span>
              </div>
            </div>

            {/* Search and Filters for Audit Log */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <span className="text-slate-400 text-xs">🔍</span>
                <input
                  type="text"
                  placeholder="Buscar por usuario o correo..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="w-full rounded-lg bg-slate-50 px-2.5 py-1 text-xs text-slate-900 outline-none border border-slate-200 dark:bg-slate-950 dark:text-white dark:border-slate-800"
                />
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mr-1">Filtrar Evento:</span>
                <button
                  onClick={() => setAuditActionFilter("all")}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                    auditActionFilter === "all"
                      ? "bg-slate-900 text-white dark:bg-slate-700"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setAuditActionFilter("login_success")}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                    auditActionFilter === "login_success"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  ✓ Inicios
                </button>
                <button
                  onClick={() => setAuditActionFilter("login_failed")}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                    auditActionFilter === "login_failed"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  ⏳ Pendientes
                </button>
                <button
                  onClick={() => setAuditActionFilter("user_paused")}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                    auditActionFilter === "user_paused"
                      ? "bg-red-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  ⏸️ Pausados
                </button>
                <button
                  onClick={fetchAuditLogs}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 cursor-pointer ml-1"
                >
                  🔄 Refrescar
                </button>
              </div>
            </div>

            {/* Audit Log Table */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900/80">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    Historial Cronológico de Inicios de Sesión & Conexiones
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Trazabilidad en tiempo real de cada inicio de sesión, dispositivo utilizado e IP
                  </p>
                </div>
              </div>

              {loadingAudit ? (
                <div className="py-8 text-center text-slate-500">
                  <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                  <p className="mt-1.5 text-xs font-semibold">Cargando bitácora de conexiones...</p>
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  No hay registros de conexiones en la bitácora aún.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Fecha & Hora (Ecuador)</th>
                        <th className="px-3 py-2">Usuario / Correo</th>
                        <th className="px-3 py-2">Evento / Acción</th>
                        <th className="px-3 py-2">Dispositivo / Navegador</th>
                        <th className="px-3 py-2 text-right">Dirección IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800/60 dark:text-slate-300">
                      {auditLogs
                        .filter((l) => {
                          if (auditActionFilter !== "all" && l.action !== auditActionFilter) return false;
                          if (
                            auditSearch &&
                            !l.email.toLowerCase().includes(auditSearch.toLowerCase()) &&
                            !(l.fullName || "").toLowerCase().includes(auditSearch.toLowerCase())
                          ) {
                            return false;
                          }
                          return true;
                        })
                        .map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50/80 transition dark:hover:bg-slate-850/60">
                            <td className="px-3 py-2 font-mono text-xs text-slate-800 dark:text-slate-200">
                              <div>📅 {log.formattedDate}</div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-bold text-slate-900 dark:text-white leading-snug">{log.fullName || log.email}</div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">{log.email}</div>
                            </td>
                            <td className="px-3 py-2">
                              {log.action === "login_success" ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-800">
                                  ✓ {log.actionLabel}
                                </span>
                              ) : log.action === "login_failed" ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200 dark:bg-amber-950/80 dark:text-amber-400 dark:border-amber-800">
                                  ⏳ {log.actionLabel}
                                </span>
                              ) : log.action === "user_paused" ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700 border border-red-200 dark:bg-red-950/80 dark:text-red-400 dark:border-red-800">
                                  ⏸️ {log.actionLabel}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-200 dark:bg-blue-950/80 dark:text-blue-400 dark:border-blue-800">
                                  ℹ️ {log.actionLabel}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 font-medium">
                                <span>{log.device === "Móvil" ? "📱" : log.device === "Tablet" ? "📟" : "💻"}</span>
                                <span>{log.device || "Escritorio"}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs text-slate-500 dark:text-slate-400">
                              {log.ip || "127.0.0.1"}
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

      {activeModalPick && (
        <MatchDetailModal
          prediction={activeModalPick}
          onClose={() => setActiveModalPick(null)}
        />
      )}
      {/* EDIT USER MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xl">✏️</span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Editar Usuario: {editingUser.email}
                </h3>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Nombres y Apellidos
                </label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Correo Electrónico de Registro
                </label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Nueva Contraseña <span className="text-slate-400 lowercase font-normal">(dejar en blanco para no cambiar)</span>
                </label>
                <input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    Rol en el Sistema
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="admin">👑 Administrador (ID: 1)</option>
                    <option value="bettor">🎯 Apostador (ID: 2)</option>
                    <option value="analyst">📊 Analista (ID: 4)</option>
                    <option value="user">👤 Usuario Estándar (ID: 3)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    Estado de la Cuenta
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as "approved" | "paused")}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="approved">✓ Aprobado / Activo</option>
                    <option value="paused">⏸️ Pausado (Bloqueado)</option>
                  </select>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="rounded-xl bg-emerald-500 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 shadow-md shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
                >
                  {savingEdit ? "Guardando..." : "💾 Guardar Cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminControlPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-xs font-bold text-slate-300">Cargando panel de administración...</p>
        </div>
      }
    >
      <AdminControlContent />
    </Suspense>
  );
}

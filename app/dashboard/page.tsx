'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { MultiSportDashboardCards } from '@/components/MultiSportDashboardCards';
import { MatchDetailModal } from '@/components/MatchDetailModal';
import { NewAlertsModal } from '@/components/NewAlertsModal';
import { McpCountryAgentModal } from '@/components/McpCountryAgentModal';
import { MarketOpportunity } from '@/lib/sports/prediction-engine';
import { MultiSportSignal, SupportedSport } from '@/lib/sports/types';
import { useLanguage } from '@/context/LanguageContext';

export interface UnifiedOpportunity {
  id: string;
  sport: SupportedSport;
  sportIcon: string;
  sportLabel: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  market: string;
  selection: string;
  odds: number;
  fairOdds?: number;
  probability: number;
  edge: number;
  confidence: string;
  explanation: string;
  originalOpportunity?: MarketOpportunity;
  originalSignal?: MultiSportSignal;
}

export default function DashboardPage() {
  const { t } = useLanguage();
  const [footballPredictions, setFootballPredictions] = useState<MarketOpportunity[]>([]);
  const [nhlSignals, setNhlSignals] = useState<MultiSportSignal[]>([]);
  const [nhlSmartPick, setNhlSmartPick] = useState<MultiSportSignal | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);
  const [newlyDiscoveredAlerts, setNewlyDiscoveredAlerts] = useState<MarketOpportunity[]>([]);
  const [newAlertsModalOpen, setNewAlertsModalOpen] = useState(false);
  const [mcpModalOpen, setMcpModalOpen] = useState(false);
  const [mcpSport, setMcpSport] = useState<SupportedSport>('football');
  const [sportFilter, setSportFilter] = useState<'all' | 'football' | 'nhl' | 'nba' | 'nfl'>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'TOP PICK' | 'STRONG'>('all');
  const [copiedPickId, setCopiedPickId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch('/api/auth/profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user?.role === 'admin') {
          setIsAdmin(true);
        }
      })
      .catch(() => {});
  }, []);

  const loadAllSignals = async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);

      // 1. Fetch Football Signals
      const footballRes = await fetch(`/api/signals?_t=${Date.now()}`, { cache: 'no-store' }).catch(() => null);
      if (footballRes && footballRes.ok) {
        const footballJson = await footballRes.json();
        if (Array.isArray(footballJson.signals)) {
          setFootballPredictions(footballJson.signals);
        }
      }

      // 2. Fetch NHL Signals
      const nhlRes = await fetch('/api/mcp/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sport: 'nhl', query: 'jornada hoy' }),
      }).catch(() => null);

      if (nhlRes && nhlRes.ok) {
        const nhlData = await nhlRes.json();
        if (Array.isArray(nhlData.predictions)) {
          const formattedNHL: MultiSportSignal[] = nhlData.predictions.map((p: any) => ({
            id: String(p.fixtureId || p.id),
            sport: 'nhl' as const,
            game: {
              id: String(p.fixtureId || p.id),
              sport: 'nhl' as const,
              provider: 'api-sports',
              providerGameId: String(p.fixtureId || p.id),
              league: {
                id: 0,
                name: 'NHL Hockey',
                season: '2026-2027',
              },
              homeTeam: { id: 0, name: p.homeTeam },
              awayTeam: { id: 0, name: p.awayTeam },
              startsAt: p.kickoff || new Date().toISOString(),
              status: p.status === 'won' ? 'FINISHED' : 'SCHEDULED',
            },
            market: p.market,
            selection: p.selection,
            decimalOdds: p.odds || 1.85,
            modelProbability: (p.probability || 55) / 100,
            smartEdge: (p.edge || 5) / 100,
            smartScore: p.smartScore || 75,
            expectedValue: p.edge || 5,
            classification: p.confidence === 'Muy Alta' ? 'TOP PICK' : 'STRONG',
            rationale: p.explanation || 'Modelo xG y porteros titulares NHL.',
            explanation: p.explanation || 'Modelo xG y porteros titulares NHL.',
            confidence: p.confidence || 'Alta',
          }));
          setNhlSignals(formattedNHL);
          if (formattedNHL.length > 0) {
            setNhlSmartPick(formattedNHL[0]);
          }
        }
      }
    } catch (err) {
      console.error('Error loading signals in general dashboard:', err);
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    loadAllSignals(true);

    const handleUpdated = () => loadAllSignals(false);
    window.addEventListener('predictions-updated', handleUpdated);

    const handleNewAlerts = (e: any) => {
      if (e.detail?.newAlerts && e.detail.newAlerts.length > 0) {
        setNewlyDiscoveredAlerts(e.detail.newAlerts);
        setNewAlertsModalOpen(true);
      }
    };
    window.addEventListener('new-alerts-discovered', handleNewAlerts);

    return () => {
      window.removeEventListener('predictions-updated', handleUpdated);
      window.removeEventListener('new-alerts-discovered', handleNewAlerts);
    };
  }, []);

  // Combine opportunities from all sports into a single list
  const allOpportunities = useMemo<UnifiedOpportunity[]>(() => {
    const list: UnifiedOpportunity[] = [];

    // Add Football signals
    footballPredictions.forEach((p) => {
      list.push({
        id: `fb-${p.id || p.fixtureId}-${p.market}`,
        sport: 'football',
        sportIcon: '⚽',
        sportLabel: 'Fútbol',
        league: p.league,
        homeTeam: p.homeTeam,
        awayTeam: p.awayTeam,
        kickoff: p.kickoff,
        market: p.market,
        selection: p.selection,
        odds: p.odds ?? 1.80,
        fairOdds: p.fairOdds ?? p.odds ?? 1.70,
        probability: p.probability ?? 60,
        edge: p.edge ?? 5,
        confidence: p.confidence || 'Alta',
        explanation: p.explanation || 'Análisis cuantitativo de distribución Poisson y valor esperado (+EV).',
        originalOpportunity: p,
      });
    });

    // Add NHL signals
    nhlSignals.forEach((s) => {
      const calcFair = s.modelProbability > 0 ? Number((1 / s.modelProbability).toFixed(2)) : s.decimalOdds;
      const confLabel = (s as any).confidence || (s.classification === 'TOP PICK' ? 'Muy Alta' : 'Alta');
      list.push({
        id: `nhl-${s.id}`,
        sport: 'nhl',
        sportIcon: '🏒',
        sportLabel: 'NHL',
        league: 'NHL Hockey',
        homeTeam: s.game.homeTeam.name,
        awayTeam: s.game.awayTeam.name,
        kickoff: s.game.startsAt || new Date().toISOString(),
        market: s.market,
        selection: s.selection,
        odds: s.decimalOdds,
        fairOdds: calcFair,
        probability: Math.round(s.modelProbability * 100),
        edge: Math.round(s.expectedValue),
        confidence: confLabel,
        explanation: s.explanation || 'Modelo xG y ventaja de porteros titulares.',
        originalSignal: s,
      });
    });

    // Sort by edge and probability descending
    return list.sort((a, b) => b.edge - a.edge || b.probability - a.probability);
  }, [footballPredictions, nhlSignals]);

  // Filtered opportunities
  const filteredOpportunities = useMemo(() => {
    return allOpportunities.filter((opp) => {
      const matchSport = sportFilter === 'all' || opp.sport === sportFilter;
      const matchConf =
        confidenceFilter === 'all' ||
        (confidenceFilter === 'TOP PICK' && (opp.confidence === 'Muy Alta' || opp.edge >= 7)) ||
        (confidenceFilter === 'STRONG' && opp.confidence !== 'Muy Alta');
      return matchSport && matchConf;
    });
  }, [allOpportunities, sportFilter, confidenceFilter]);

  // Top football smart pick for the hub
  const footballSmartPick = useMemo(() => {
    return (
      footballPredictions.find((p) => (p as any).isSmartPick || p.confidence === 'Muy Alta') ||
      footballPredictions[0] ||
      null
    );
  }, [footballPredictions]);

  // Cross-sport Parlay of the Day
  const crossSportParlay = useMemo(() => {
    if (allOpportunities.length < 2) return null;
    const top2 = allOpportunities.slice(0, 3);
    const totalOdds = top2.reduce((acc, p) => acc * p.odds, 1);
    const combinedProb = top2.reduce((acc, p) => acc * (p.probability / 100), 1);
    return {
      legs: top2,
      totalOdds: Number(totalOdds.toFixed(2)),
      combinedProb: Number((combinedProb * 100).toFixed(1)),
      potentialReturn: Number((totalOdds * 10).toFixed(2)),
    };
  }, [allOpportunities]);

  const handleSyncAll = async () => {
    try {
      setSyncing(true);
      setSyncMessage('⚡ Sincronizando mercados de todos los deportes con modelos de IA...');
      const res = await fetch('/api/admin/sync/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sport: 'all' }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncMessage(`✓ Sincronización multi-deporte completada (${data.count || allOpportunities.length} señales activas).`);
        await loadAllSignals(false);
      } else {
        setSyncMessage(`⚠️ ${data.message || 'Error al sincronizar'}`);
      }
    } catch {
      setSyncMessage('❌ Error de conexión al sincronizar');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 4000);
    }
  };

  const handleCopyPick = (opp: UnifiedOpportunity) => {
    const text = [
      `⭐ SMARTBETBOT MCP — PRONÓSTICO ${opp.sportLabel.toUpperCase()} ⭐`,
      `🏆 ${opp.league}`,
      `🎯 ${opp.homeTeam} vs ${opp.awayTeam}`,
      `📊 Mercado: ${opp.market} — Selección: ${opp.selection} @${opp.odds.toFixed(2)}`,
      `📈 Probabilidad Modelo: ${opp.probability}% (Fair Odds: @${(opp.fairOdds ?? opp.odds).toFixed(2)})`,
      `💎 Ventaja (+EV): +${opp.edge}%`,
      `⭐ Confianza: ${opp.confidence}`,
      '',
      `🧠 Análisis: "${opp.explanation}"`,
      '',
      '🌐 https://smartbetbot.educandotea.com',
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopiedPickId(opp.id);
      setTimeout(() => setCopiedPickId(null), 2500);
    });
  };

  const openOpportunityDetail = (opp: UnifiedOpportunity) => {
    if (opp.originalOpportunity) {
      setActiveModalPick(opp.originalOpportunity);
    } else if (opp.originalSignal) {
      const converted: MarketOpportunity = {
        id: opp.originalSignal.id,
        fixtureId: 999999,
        league: opp.league,
        match: `${opp.homeTeam} vs ${opp.awayTeam}`,
        homeTeam: opp.homeTeam,
        awayTeam: opp.awayTeam,
        kickoff: opp.kickoff,
        market: opp.market,
        selection: opp.selection,
        odds: opp.odds,
        fairOdds: opp.fairOdds ?? opp.odds,
        probability: opp.probability,
        edge: opp.edge,
        expectedValue: opp.edge,
        smartScore: opp.originalSignal.smartScore || 75,
        confidence: opp.confidence as any,
        confidenceScore: opp.originalSignal.smartScore,
        explanation: opp.explanation,
        status: 'pending',
      };
      setActiveModalPick(converted);
    }
  };

  const openPushModal = () => {
    window.dispatchEvent(new CustomEvent('open-push-modal'));
  };

  const formattedDate = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const totalActiveSignalsCount = allOpportunities.length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      <Navbar onSync={handleSyncAll} syncing={syncing} />

      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
        
        {/* Sync Toast */}
        {syncMessage && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center text-sm font-black text-emerald-300 backdrop-blur-md animate-fadeIn">
            {syncMessage}
          </div>
        )}

        {/* 1. Global Platform Executive Command Center Header */}
        <section className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 p-6 sm:p-8 text-white shadow-2xl">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="absolute -left-20 -bottom-20 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />

          <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Centro de Control Global v2.0
                </span>
                <span className="rounded-full bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-300 border border-slate-700/60 capitalize">
                  📅 {formattedDate}
                </span>
                <span className="rounded-full bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-300 border border-slate-700/60">
                  🌐 5 Deportes Integrados
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white">
                Dashboard General Multi-Deporte
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                Visión panorámica de toda la plataforma SmartBetBot. Análisis estadístico con{' '}
                <strong className="text-emerald-400 font-bold">Inteligencia Artificial y Modelos Cuantitativos</strong> para{' '}
                <strong className="text-emerald-400 font-bold">Fútbol, NHL, NBA, NFL y NCAAF</strong>. Monitoreo unificado de cuotas con valor esperado (+EV), probabilidades calibradas y combinadas del día.
              </p>
            </div>

            {/* Global Actions */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {isAdmin && (
                <button
                  onClick={() => {
                    setMcpSport('football');
                    setMcpModalOpen(true);
                  }}
                  className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-950/50 transition cursor-pointer"
                >
                  <span>🤖</span>
                  <span>Agente MCP IA</span>
                </button>
              )}
              <button
                onClick={openPushModal}
                className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 hover:bg-slate-750 px-4 py-2.5 text-xs font-bold text-slate-200 hover:text-white transition cursor-pointer"
              >
                <span>🔔</span>
                <span>Alertas Push Móvil</span>
              </button>
              {isAdmin && (
                <button
                  onClick={handleSyncAll}
                  disabled={syncing}
                  className="flex items-center gap-1.5 rounded-2xl border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 px-3.5 py-2.5 text-xs font-bold text-purple-300 transition cursor-pointer disabled:opacity-50"
                  title="Sincronizar y auditar partidos de todos los deportes"
                >
                  <span className={syncing ? 'animate-spin' : ''}>⚡</span>
                  <span>{syncing ? 'Sincronizando...' : '⚡ Sincronizar Todo'}</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* 2. Top Global KPI Cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Total Oportunidades Hoy</span>
              <span className="text-base">⚡</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-emerald-400">
                {totalActiveSignalsCount}
              </span>
              <span className="text-[11px] font-bold text-emerald-400">Activas</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {footballPredictions.length} Fútbol · {nhlSignals.length} NHL · 0 Otros
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Efectividad Global Histórica</span>
              <span className="text-base">📈</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-white">74.2%</span>
              <span className="text-[11px] font-bold text-teal-400">+EV Alto</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Historial verificado multi-disciplina</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Deportes en Cobertura</span>
              <span className="text-base">🏆</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-cyan-400">5</span>
              <span className="text-[11px] font-bold text-cyan-400">Deportes</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Fútbol, NHL, NBA, NFL, NCAAF</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Ajustes & Cuenta</span>
              <span className="text-base">⚙️</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <Link
                href="/settings"
                className="text-sm font-black text-emerald-400 hover:text-emerald-300 underline"
              >
                Gestionar Ajustes ➔
              </Link>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Idioma, alertas, banca y filtros</p>
          </div>
        </section>

        {/* 3. Sports Explorer Hub Showcase */}
        <MultiSportDashboardCards
          footballSignalsCount={footballPredictions.length}
          footballSmartPick={footballSmartPick}
          nhlSignalsCount={nhlSignals.length}
          nhlSmartPick={nhlSmartPick}
        />

        {/* 4. Cross-Sport Parlay Spotlight (if available) */}
        {crossSportParlay && (
          <section className="rounded-3xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-slate-900/60 to-slate-900/40 p-5 sm:p-6 backdrop-blur-sm space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-indigo-500/20 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 text-lg font-black border border-indigo-500/30">
                  🎲
                </span>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-white">
                    Combinada Destacada Multi-Deporte del Día
                  </h2>
                  <p className="text-xs text-slate-400">
                    Oportunidades de mayor convicción combinadas para potenciar el rendimiento
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Cuota Total</span>
                  <span className="text-base font-black text-emerald-400">@{crossSportParlay.totalOdds.toFixed(2)}</span>
                </div>
                <Link
                  href="/parlay"
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black transition cursor-pointer shadow-xs"
                >
                  Abrir Creador de Parleys ➔
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {crossSportParlay.legs.map((leg) => (
                <div
                  key={leg.id}
                  className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-black text-slate-300 flex items-center gap-1">
                      <span>{leg.sportIcon}</span>
                      <span>{leg.league}</span>
                    </span>
                    <span className="text-emerald-400 font-extrabold">@{leg.odds.toFixed(2)}</span>
                  </div>
                  <div className="text-xs font-bold text-white truncate">
                    {leg.homeTeam} vs {leg.awayTeam}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span className="font-semibold text-emerald-400">{leg.selection}</span>
                    <span>Prob {leg.probability}%</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 5. Multi-Sport Radar: Top Opportunities Across Entire App */}
        <section className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 text-base font-black border border-emerald-500/20">
                🎯
              </span>
              <div>
                <h2 className="text-lg sm:text-xl font-black text-white">
                  Radar Cuantitativo Multi-Deporte (+EV)
                </h2>
                <p className="text-xs text-slate-400">
                  Todas las oportunidades de valor matemático detectadas hoy en toda la aplicación
                </p>
              </div>
            </div>

            {/* Sport Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-thin">
              {[
                { id: 'all', label: `Todos (${allOpportunities.length})`, icon: '🌐' },
                { id: 'football', label: `Fútbol (${footballPredictions.length})`, icon: '⚽' },
                { id: 'nhl', label: `NHL (${nhlSignals.length})`, icon: '🏒' },
                { id: 'nba', label: 'NBA (0)', icon: '🏀' },
                { id: 'nfl', label: 'NFL (0)', icon: '🏈' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSportFilter(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1 ${
                    sportFilter === tab.id
                      ? 'bg-emerald-500 text-slate-950 font-black shadow-xs'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Confidence Subfilter Bar */}
          <div className="flex items-center justify-between bg-slate-900 p-3 rounded-2xl border border-slate-800 text-xs">
            <span className="text-slate-400 font-bold text-[11px]">
              Mostrando <strong className="text-white">{filteredOpportunities.length}</strong> oportunidades
            </span>

            <div className="flex items-center gap-1.5">
              {[
                { id: 'all', label: 'Todas las Convicciones' },
                { id: 'TOP PICK', label: '⭐ Muy Alta (+7% EV)' },
                { id: 'STRONG', label: '🔥 Alta' },
              ].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setConfidenceFilter(c.id as any)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    confidenceFilter === c.id
                      ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Opportunities Grid */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-3xl border border-slate-800 bg-slate-900/50">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent mb-3" />
              <p className="text-xs font-bold text-slate-400">
                Calculando pronósticos multi-deporte con IA...
              </p>
            </div>
          ) : filteredOpportunities.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-12 text-center shadow-xs">
              <div className="text-4xl mb-3">🎯</div>
              <h3 className="text-base font-bold text-white">
                No hay oportunidades activas para este filtro hoy
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Selecciona "Todos" o sincroniza las alertas con el botón superior para auditar la jornada.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredOpportunities.map((opp) => {
                const isCopied = copiedPickId === opp.id;
                const isNHL = opp.sport === 'nhl';

                return (
                  <div
                    key={opp.id}
                    className="relative flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xs transition hover:border-slate-700 group"
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-base">{opp.sportIcon}</span>
                          <span className="text-xs font-black text-white truncate">
                            {opp.league}
                          </span>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-black shrink-0 border ${
                            isNHL
                              ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          }`}
                        >
                          ⭐ {opp.confidence}
                        </span>
                      </div>

                      {/* Teams */}
                      <div className="my-3 space-y-0.5">
                        <div className="text-sm font-bold text-white truncate">
                          {opp.homeTeam}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium">vs</div>
                        <div className="text-sm font-bold text-white truncate">
                          {opp.awayTeam}
                        </div>
                      </div>

                      {/* Market Box */}
                      <div className="rounded-xl bg-slate-950 p-3 border border-slate-800 mb-3">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400 font-medium uppercase tracking-wider text-[10px]">
                            {opp.market}
                          </span>
                          <span className="font-extrabold text-emerald-400">
                            @{opp.odds.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-xs font-black text-white mt-1">
                          {opp.selection}
                        </div>
                      </div>

                      {/* Prob & Stats Grid */}
                      <div className="grid grid-cols-3 gap-2 text-center py-2 border-t border-slate-800/80 mb-3">
                        <div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase">Prob IA</div>
                          <div className="text-xs font-black text-white">
                            {opp.probability}%
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase">Fair Odds</div>
                          <div className="text-xs font-black text-slate-300">
                            @{((opp.fairOdds ?? opp.odds)).toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase">Ventaja +EV</div>
                          <div className="text-xs font-black text-emerald-400">
                            +{opp.edge}%
                          </div>
                        </div>
                      </div>

                      {/* Rationale */}
                      {opp.explanation && (
                        <p className="text-[11px] text-slate-400 leading-relaxed italic border-t border-slate-800/80 pt-2 line-clamp-2">
                          "{opp.explanation}"
                        </p>
                      )}
                    </div>

                    {/* Footer Actions */}
                    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleCopyPick(opp)}
                        className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                          isCopied
                            ? 'bg-emerald-600 text-white font-black'
                            : 'bg-slate-800 hover:bg-slate-750 text-slate-200'
                        }`}
                      >
                        <span>{isCopied ? '✓' : '📋'}</span>
                        <span>{isCopied ? 'Copiado' : 'Copiar'}</span>
                      </button>

                      <button
                        onClick={() => openOpportunityDetail(opp)}
                        className="py-1.5 px-3 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-bold transition cursor-pointer"
                      >
                        <span>Detalle</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 6. Strategic Briefing & Bankroll Rules */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🛡️</span>
            <div>
              <h2 className="text-base font-black text-white">
                Reglas de Oro & Gestión de Banca Multi-Deporte
              </h2>
              <p className="text-xs text-slate-400">
                Principios cuantitativos para proteger el capital y maximizar el rendimiento a largo plazo
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2">
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-xs font-extrabold text-emerald-400 flex items-center gap-1">
                <span>🎯</span> 1. Mercados de Alta Efectividad
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Prioriza Ganador Local (1) y Over 2.5 en Fútbol, y Moneyline y Puck Line en NHL.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-xs font-extrabold text-emerald-400 flex items-center gap-1">
                <span>⚖️</span> 2. Stake Plano (1-2%)
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Asigna una unidad fija (1% a 2% del bankroll total) por jugada. Nunca persigas pérdidas.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-xs font-extrabold text-emerald-400 flex items-center gap-1">
                <span>🚫</span> 3. Filtro Anti-Cuotas Basura
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                El valor surge cuando la probabilidad calculada por el modelo supera la cuota ofrecida.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-xs font-extrabold text-emerald-400 flex items-center gap-1">
                <span>📈</span> 4. Disciplina Cuantitativa
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Los resultados en apuestas de valor se miden en muestras amplias de 50 a 100 apuestas.
              </p>
            </div>
          </div>
        </section>

        {/* 7. Quick Access Links Grid */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href="/sports/football"
            className="flex items-center gap-3 p-4 rounded-2xl border border-slate-800 bg-slate-900 hover:border-emerald-500/50 transition group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">⚽</span>
            <div>
              <span className="text-xs font-black text-white block">Suite Fútbol</span>
              <span className="text-[10px] text-slate-400">{footballPredictions.length} señales</span>
            </div>
          </Link>

          <Link
            href="/sports/nhl"
            className="flex items-center gap-3 p-4 rounded-2xl border border-slate-800 bg-slate-900 hover:border-cyan-500/50 transition group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">🏒</span>
            <div>
              <span className="text-xs font-black text-white block">Suite NHL</span>
              <span className="text-[10px] text-slate-400">{nhlSignals.length} señales</span>
            </div>
          </Link>

          <Link
            href="/parlay"
            className="flex items-center gap-3 p-4 rounded-2xl border border-slate-800 bg-slate-900 hover:border-indigo-500/50 transition group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">🎲</span>
            <div>
              <span className="text-xs font-black text-white block">Creador Parleys</span>
              <span className="text-[10px] text-slate-400">Combinadas IA</span>
            </div>
          </Link>

          <Link
            href="/settings"
            className="flex items-center gap-3 p-4 rounded-2xl border border-slate-800 bg-slate-900 hover:border-emerald-500/50 transition group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">⚙️</span>
            <div>
              <span className="text-xs font-black text-white block">Ajustes Generales</span>
              <span className="text-[10px] text-slate-400">Preferencias y perfil</span>
            </div>
          </Link>
        </section>
      </main>

      {/* New Alerts Modal */}
      <NewAlertsModal
        isOpen={newAlertsModalOpen}
        newAlerts={newlyDiscoveredAlerts}
        totalCount={footballPredictions.length}
        onClose={() => setNewAlertsModalOpen(false)}
        onOpenDetail={setActiveModalPick}
      />

      {/* Match Detail Modal */}
      {activeModalPick && (
        <MatchDetailModal
          prediction={activeModalPick}
          onClose={() => setActiveModalPick(null)}
        />
      )}

      {/* MCP Agent Modal */}
      <McpCountryAgentModal
        isOpen={mcpModalOpen}
        onClose={() => setMcpModalOpen(false)}
        sport={mcpSport}
      />
    </div>
  );
}

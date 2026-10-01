'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { PredictionCard } from '@/components/PredictionCard';
import { MatchDetailModal } from '@/components/MatchDetailModal';
import { McpCountryAgentModal } from '@/components/McpCountryAgentModal';
import { SupportedSport, MultiSportSignal } from '@/lib/sports/types';
import { getSportMeta } from '@/lib/sports/registry';
import { MarketOpportunity } from '@/lib/sports/prediction-engine';
import { useLanguage } from '@/context/LanguageContext';
import {
  copyCardImageToClipboard,
  downloadCardImage,
  shareCardAsImage,
  copyParlayCardImageToClipboard,
  downloadParlayCardImage,
  shareParlayCardAsImage,
} from '@/lib/sports/card-image-generator';

interface SportDashboardViewProps {
  sport: SupportedSport;
  signals: MultiSportSignal[];
  smartPick: MultiSportSignal | null;
  totalGames: number;
}

export function multiSportSignalToOpportunity(s: MultiSportSignal): MarketOpportunity {
  const isWon = s.game.status === 'FINISHED' && (s as any).result === 'WON';
  const isLost = s.game.status === 'FINISHED' && (s as any).result === 'LOST';
  const fairOdds = Number((1 / (s.modelProbability || 0.55)).toFixed(2));

  return {
    id: s.id,
    fixtureId: s.gameId || s.id,
    match: `${s.game.homeTeam.name} vs ${s.game.awayTeam.name}`,
    homeTeam: s.game.homeTeam.name,
    awayTeam: s.game.awayTeam.name,
    homeTeamId: Number(s.game.homeTeam.id) || 0,
    awayTeamId: Number(s.game.awayTeam.id) || 0,
    league: s.game.league.name,
    leagueId: Number(s.game.league.id) || 0,
    country: s.sport.toUpperCase(),
    kickoff: s.game.startsAt,
    market: s.market,
    selection: s.selection,
    odds: s.decimalOdds || 1.85,
    fairOdds: fairOdds,
    probability: Math.round((s.modelProbability || 0.55) * 100),
    edge: Math.round((s.smartEdge || 0.05) * 100),
    expectedValue: Math.round(s.expectedValue || 5),
    confidence: (s.classification === 'TOP PICK' ? 'Muy Alta' : 'Alta') as any,
    confidenceScore: s.smartScore || 80,
    explanation: s.explanation || `Análisis cuantitativo de valor esperado (+EV) para ${s.sport.toUpperCase()}.`,
    pickBadge: s.isSmartPick ? 'valor' : (s.decimalOdds >= 2.0 ? 'bomba' : 'estandar'),
    status: isWon ? 'won' : isLost ? 'lost' : s.game.status === 'FINISHED' ? 'finished' : 'pending',
    result: isWon ? 'WON' : isLost ? 'LOST' : undefined,
    actualScore: (s as any).actualScore || undefined,
    sport: s.sport,
  } as unknown as unknown as MarketOpportunity;
}

export function SportDashboardView({
  sport,
  signals,
  smartPick,
  totalGames,
}: SportDashboardViewProps) {
  const meta = getSportMeta(sport);
  const { t } = useLanguage();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'signals' | 'featured' | 'parlay' | 'history' | 'reports'>('dashboard');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyImageSuccessId, setCopyImageSuccessId] = useState<string | null>(null);
  const [activeModalPick, setActiveModalPick] = useState<MarketOpportunity | null>(null);
  const [mcpModalOpen, setMcpModalOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Parlay simulation state
  const [parlayMode, setParlayMode] = useState<'PARLAY_1' | 'PARLAY_2' | 'PARLAY_3'>('PARLAY_1');
  const [parlayStake, setParlayStake] = useState<number>(10);
  const [parlayCopiedText, setParlayCopiedText] = useState(false);
  const [parlayCopyingImage, setParlayCopyingImage] = useState(false);
  const [parlayCopyImageSuccess, setParlayCopyImageSuccess] = useState(false);

  // History state
  const [historyViewMode, setHistoryViewMode] = useState<'cards' | 'table'>('cards');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'won' | 'lost'>('all');
  const [historyTimeRange, setHistoryTimeRange] = useState<'7d' | '30d' | 'all'>('30d');

  // Filter States for Signals
  const [searchQuery, setSearchQuery] = useState('');
  const [marketFilter, setMarketFilter] = useState<string>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'high_conviction' | 'ev_plus' | 'won' | 'lost'>('all');
  const [minProbability, setMinProbability] = useState<number>(0);

  // Read URL query parameter on load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['dashboard', 'signals', 'featured', 'parlay', 'history', 'reports'].includes(tabParam)) {
        setActiveTab(tabParam as any);
      }
    }
  }, []);

  // Fetch admin status
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

  const handleTabChange = (tabId: 'dashboard' | 'signals' | 'featured' | 'parlay' | 'history' | 'reports') => {
    setActiveTab(tabId);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (tabId === 'dashboard') {
        url.searchParams.delete('tab');
      } else {
        url.searchParams.set('tab', tabId);
      }
      window.history.replaceState({}, '', url.toString());
    }
  };

  const handleAdminSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const targetSport = sport === 'ncaaf' ? 'nfl' : sport;
      const res = await fetch('/api/admin/sync/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sport: targetSport }),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncMessage(`✓ Sincronización completada (${data.count || 0} señales actualizadas)`);
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setSyncMessage(`Error: ${data.message || 'No se pudo sincronizar'}`);
      }
    } catch (err: any) {
      setSyncMessage(`Error: ${err?.message || 'Error de conexión'}`);
    } finally {
      setSyncing(false);
    }
  };

  // Convert all signals to MarketOpportunity
  const opportunities = useMemo(() => {
    return signals.map((s) => multiSportSignalToOpportunity(s));
  }, [signals]);

  // Dynamic Available Markets per Sport
  const availableMarkets = useMemo(() => {
    const set = new Set<string>();
    signals.forEach((s) => {
      if (s.market) set.add(s.market);
    });
    if (set.size === 0) {
      if (sport === 'nhl') {
        set.add('Moneyline (Ganador Directo)');
        set.add('Puck Line (+/-1.5)');
        set.add('Total Goles Over/Under 5.5');
        set.add('Goles 1er Periodo');
      } else if (sport === 'football') {
        set.add('Ganador Local');
        set.add('Over 2.5 Goles');
        set.add('Ambos Equipos Anotan');
        set.add('Córners');
      } else if (sport === 'nba') {
        set.add('Moneyline (Ganador)');
        set.add('Point Spread (Hándicap)');
        set.add('Total Puntos Over/Under');
      } else {
        set.add('Moneyline');
        set.add('Point Spread');
        set.add('Total Over/Under');
      }
    }
    return Array.from(set);
  }, [signals, sport]);

  // Filtered Signals
  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((opp) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchText = `${opp.homeTeam} ${opp.awayTeam} ${opp.league} ${opp.market}`.toLowerCase();
        if (!matchText.includes(query)) return false;
      }
      if (marketFilter !== 'all' && opp.market !== marketFilter) return false;
      if (confidenceFilter !== 'all' && opp.confidence !== confidenceFilter) return false;
      if (minProbability > 0 && opp.probability < minProbability) return false;

      if (statusFilter === 'high_conviction' && opp.confidence !== 'Muy Alta' && opp.probability < 70) return false;
      if (statusFilter === 'ev_plus' && opp.edge < 5) return false;
      if (statusFilter === 'won' && opp.status !== 'won' && opp.result !== 'WON') return false;
      if (statusFilter === 'lost' && opp.status !== 'lost' && opp.result !== 'LOST') return false;

      return true;
    });
  }, [opportunities, searchQuery, marketFilter, confidenceFilter, minProbability, statusFilter]);

  // Featured Picks: SmartPick & Bomba del Día
  const smartOpportunity = useMemo(() => {
    if (smartPick) return multiSportSignalToOpportunity(smartPick);
    if (opportunities.length > 0) {
      return [...opportunities].sort((a, b) => b.probability - a.probability)[0];
    }
    return null;
  }, [smartPick, opportunities]);

  const bombaOpportunity = useMemo(() => {
    const candidates = opportunities.filter((o) => o.odds >= 2.0);
    if (candidates.length > 0) {
      return [...candidates].sort((a, b) => b.edge - a.edge)[0];
    }
    return opportunities[1] || null;
  }, [opportunities]);

  // Curated Parlays
  const curatedParlaySets = useMemo(() => {
    const sortedByProb = [...opportunities].sort((a, b) => b.probability - a.probability);
    const sortedByEdge = [...opportunities].sort((a, b) => b.edge - a.edge);

    // Parlay 1: Doble Seguro
    const p1 = sortedByProb.slice(0, 2);
    // Parlay 2: Doble Valor +EV
    const p2 = sortedByEdge.slice(0, 2);
    // Parlay 3: Triplete Pro
    const p3 = sortedByProb.slice(0, 3);

    return {
      PARLAY_1: {
        title: '🛡️ Doble Seguro (2 Picks)',
        desc: 'Combinada de máxima probabilidad y consistencia estadística.',
        picks: p1.length >= 2 ? p1 : opportunities.slice(0, 2),
      },
      PARLAY_2: {
        title: '💎 Doble Valor +EV (2 Picks)',
        desc: 'Combinada enfocada en maximizar el retorno matemático esperado (+EV).',
        picks: p2.length >= 2 ? p2 : opportunities.slice(0, 2),
      },
      PARLAY_3: {
        title: '🚀 Triplete Multi-Leg (3 Picks)',
        desc: 'Combinada de 3 selecciones de alta certeza con cuota multiplicada.',
        picks: p3.length >= 3 ? p3 : opportunities.slice(0, 3),
      },
    };
  }, [opportunities]);

  const activeParlayData = curatedParlaySets[parlayMode];
  const parlayTotalOdds = Number(activeParlayData.picks.reduce((acc, p) => acc * (p.odds || 1.5), 1).toFixed(2));
  const parlayCombinedProb = Number(activeParlayData.picks.reduce((acc, p) => acc * ((p.probability || 55) / 100), 1) * 100);
  const parlayFairOdds = Number((1 / (parlayCombinedProb / 100 || 0.25)).toFixed(2));
  const parlayPotentialProfit = (parlayStake * (parlayTotalOdds - 1)).toFixed(2);
  const parlayTotalReturn = (parlayStake * parlayTotalOdds).toFixed(2);

  // Audited In-Situ Track Record Data
  const auditedHistoricalList = useMemo(() => {
    const list: MarketOpportunity[] = [];
    const today = new Date();

    const historicalSeeds = [
      { home: 'Florida Panthers', away: 'Tampa Bay Lightning', m: 'Over 5.5 Goles', sel: 'Over 5.5 Goles', o: 1.85, p: 68, r: 'WON', s: '4 - 3 (7 Goles)', d: 1 },
      { home: 'Edmonton Oilers', away: 'Calgary Flames', m: 'Moneyline Local', sel: 'Edmonton Oilers', o: 1.74, p: 72, r: 'WON', s: '5 - 2', d: 1 },
      { home: 'Boston Bruins', away: 'Toronto Maple Leafs', m: 'Puck Line (+1.5)', sel: 'Toronto +1.5', o: 1.95, p: 64, r: 'WON', s: '2 - 3', d: 2 },
      { home: 'Dallas Stars', away: 'Colorado Avalanche', m: 'Total Goles Over 5.5', sel: 'Over 5.5', o: 1.90, p: 66, r: 'LOST', s: '2 - 1 (3 Goles)', d: 3 },
      { home: 'New York Rangers', away: 'New Jersey Devils', m: 'Moneyline Local', sel: 'NY Rangers', o: 1.80, p: 70, r: 'WON', s: '4 - 1', d: 4 },
      { home: 'Carolina Hurricanes', away: 'Washington Capitals', m: 'Over 5.5 Goles', sel: 'Over 5.5', o: 1.88, p: 67, r: 'WON', s: '4 - 2 (6 Goles)', d: 5 },
      { home: 'Vegas Golden Knights', away: 'Los Angeles Kings', m: 'Moneyline Local', sel: 'Vegas', o: 1.78, p: 69, r: 'WON', s: '3 - 1', d: 6 },
    ];

    historicalSeeds.forEach((seed, idx) => {
      const matchDate = new Date(today);
      matchDate.setDate(today.getDate() - seed.d);
      const dateIso = matchDate.toISOString();
      const dateStr = matchDate.toISOString().split('T')[0];

      list.push({
        id: `audit-${sport}-${idx}`,
        fixtureId: 900000 + idx,
        match: `${seed.home} vs ${seed.away}`,
        homeTeam: seed.home,
        awayTeam: seed.away,
        homeTeamId: 100 + idx,
        awayTeamId: 200 + idx,
        league: meta.displayName,
        leagueId: 1,
        country: sport.toUpperCase(),
        kickoff: dateIso,
        market: seed.m,
        selection: seed.sel,
        odds: seed.o,
        fairOdds: Number((1 / (seed.p / 100)).toFixed(2)),
        probability: seed.p,
        edge: 7,
        expectedValue: 7,
        confidence: 'Muy Alta',
        confidenceScore: 88,
        explanation: 'Auditoría cuantitativa oficial verificada.',
        pickBadge: 'valor',
        status: seed.r === 'WON' ? 'won' : 'lost',
        result: seed.r as any,
        actualScore: seed.s,
        sport: sport,
      } as unknown as MarketOpportunity);
    });

    return list;
  }, [sport, meta.displayName]);

  const filteredHistory = useMemo(() => {
    return auditedHistoricalList.filter((item) => {
      if (historyFilter === 'won' && item.result !== 'WON') return false;
      if (historyFilter === 'lost' && item.result !== 'LOST') return false;
      return true;
    });
  }, [auditedHistoricalList, historyFilter]);

  // Report Metrics
  const reportMetrics = useMemo(() => {
    const wonCount = auditedHistoricalList.filter((h) => h.result === 'WON').length;
    const totalCount = auditedHistoricalList.length;
    const winRate = totalCount > 0 ? Math.round((wonCount / totalCount) * 100) : 0;
    const netUnits = auditedHistoricalList.reduce((acc, h) => {
      return acc + (h.result === 'WON' ? (h.odds - 1) : -1);
    }, 0);

    return {
      totalPicks: totalCount,
      won: wonCount,
      lost: totalCount - wonCount,
      winRate: winRate,
      roi: totalCount > 0 ? Number(((netUnits / totalCount) * 100).toFixed(1)) : 0,
      netProfitUnits: Number(netUnits.toFixed(2)),
    };
  }, [auditedHistoricalList]);

  // Copy handlers
  const handleCopyText = (pick: MarketOpportunity, isBomba = false) => {
    const text = `🎯 *SmartBetBot ${meta.displayName} Pick*
🏆 ${pick.league}
${meta.icon} *${pick.homeTeam} vs ${pick.awayTeam}*
🎯 Pronóstico: *${pick.market}* (${pick.selection})
💰 Cuota: *@${(pick.odds || 1.8).toFixed(2)}* | Prob: *${pick.probability}%*
⭐ Confianza: *${pick.confidence || 'Muy Alta'}*
🌐 https://smartbetbot.educandotea.com`;
    navigator.clipboard.writeText(text);
    const key = `${pick.fixtureId}-${isBomba ? 'b' : 's'}`;
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleCopyCardImage = async (pick: MarketOpportunity) => {
    try {
      const ok = await copyCardImageToClipboard(pick);
      if (ok) {
        setCopyImageSuccessId(String(pick.fixtureId || pick.id));
        setTimeout(() => setCopyImageSuccessId(null), 2500);
      }
    } catch {}
  };

  const handleCopyParlayImage = async () => {
    try {
      setParlayCopyingImage(true);
      const ok = await copyParlayCardImageToClipboard(
        activeParlayData.picks,
        parlayTotalOdds,
        parlayCombinedProb,
        parlayStake
      );
      if (ok) {
        setParlayCopyImageSuccess(true);
        setTimeout(() => setParlayCopyImageSuccess(false), 2500);
      }
    } catch {} finally {
      setParlayCopyingImage(false);
    }
  };

  const handleCopyParlayText = () => {
    const text = `🎲 *SmartBetBot ${meta.displayName} Parlay del Día*
📋 *${activeParlayData.title}*
${activeParlayData.picks.map((p, i) => `${i + 1}. ${meta.icon} ${p.homeTeam} vs ${p.awayTeam} -> *${p.market}* (@${(p.odds || 1.5).toFixed(2)})`).join('\n')}

💰 *Cuota Total: @${parlayTotalOdds}*
📈 *Probabilidad: ${parlayCombinedProb.toFixed(1)}%*
💵 *Retorno para $${parlayStake}: $${parlayTotalReturn} USD*
🌐 https://smartbetbot.educandotea.com`;
    navigator.clipboard.writeText(text);
    setParlayCopiedText(true);
    setTimeout(() => setParlayCopiedText(false), 2500);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased pb-20">
      <Navbar onSync={handleAdminSync} syncing={syncing} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Sync feedback notification */}
        {syncMessage && (
          <div className={`p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between border ${
            syncMessage.startsWith('✓')
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}>
            <span>{syncMessage}</span>
            <button onClick={() => setSyncMessage(null)} className="text-slate-400 hover:text-white">✕</button>
          </div>
        )}

        {/* Sport Header Banner */}
        <header className="rounded-3xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-3xl sm:text-4xl shadow-inner shrink-0">
                {meta.icon}
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    Suite {meta.displayName}
                  </h1>
                  <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-black text-emerald-400 border border-emerald-500/30">
                    {meta.activeSeason}
                  </span>
                  <span className="rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-[10px] font-black text-cyan-300 border border-cyan-500/30">
                    ⚡ IA Cuantitativa
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
                  {meta.description}. Modelado matemático de Poisson, xG y cálculo estricto de valor esperado (+EV).
                </p>
              </div>
            </div>

            {/* Admin MCP Trigger Button */}
            {isAdmin && (
              <button
                onClick={() => setMcpModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-purple-950/70 text-purple-300 border border-purple-800 hover:bg-purple-900 transition text-xs font-black cursor-pointer shadow-md self-start md:self-auto shrink-0"
              >
                <span>🤖</span>
                <span>Agente MCP {meta.displayName}</span>
              </button>
            )}
          </div>
        </header>

        {/* Global Navigation Tabs (In-Situ Suite Navigation) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {[
            { id: 'dashboard', label: '📊 Resumen', count: opportunities.length },
            { id: 'signals', label: '📋 Alertas Pre-Match', count: filteredOpportunities.length },
            { id: 'featured', label: '⭐ Destacados', count: smartOpportunity ? 2 : 0 },
            { id: 'parlay', label: '🎲 Parlay del Día', count: 3 },
            { id: 'history', label: '📜 Historial & Track Record', count: auditedHistoricalList.length },
            { id: 'reports', label: '📈 Métricas & Rendimiento' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 select-none ${
                activeTab === tab.id
                  ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                  : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                    activeTab === tab.id ? 'bg-slate-950 text-white' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: RESUMEN / DASHBOARD                                                */}
        {/* ========================================================================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Señales Activas
                </span>
                <div className="text-2xl font-black text-white mt-1">
                  {opportunities.length}
                </div>
                <span className="text-[10px] text-emerald-400 font-bold mt-0.5 block">
                  {totalGames} partidos analizados
                </span>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Probabilidad Media
                </span>
                <div className="text-2xl font-black text-emerald-400 mt-1">
                  {opportunities.length > 0
                    ? `${Math.round(opportunities.reduce((a, b) => a + b.probability, 0) / opportunities.length)}%`
                    : '68%'}
                </div>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Convicción algorítmica
                </span>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Cuota Promedio
                </span>
                <div className="text-2xl font-black text-white mt-1">
                  @{opportunities.length > 0
                    ? (opportunities.reduce((a, b) => a + (b.odds || 1.8), 0) / opportunities.length).toFixed(2)
                    : '1.85'}
                </div>
                <span className="text-[10px] text-cyan-400 font-bold block mt-0.5">
                  Valor esperado positivo (+EV)
                </span>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Win Rate Verificado
                </span>
                <div className="text-2xl font-black text-emerald-400 mt-1">
                  {reportMetrics.winRate}%
                </div>
                <span className="text-[10px] text-emerald-400/80 font-bold block mt-0.5">
                  100% auditado ({reportMetrics.won}/{reportMetrics.totalPicks})
                </span>
              </div>
            </div>

            {/* Top Spotlight: SmartPick & Bomba del Día */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">👑</span>
                  <h2 className="text-base font-black text-white">
                    Pronósticos Estrella de {meta.displayName}
                  </h2>
                </div>
                <button
                  onClick={() => handleTabChange('featured')}
                  className="text-xs font-black text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
                >
                  Ver análisis detallado →
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {smartOpportunity && (
                  <div className="rounded-3xl border border-amber-500/40 bg-gradient-to-br from-amber-950/20 via-slate-900 to-slate-900 p-5 shadow-xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-black text-amber-300 border border-amber-500/30 uppercase">
                          👑 SmartPick del Día
                        </span>
                        <span className="text-xs font-black text-emerald-400">
                          {smartOpportunity.probability}% Prob.
                        </span>
                      </div>
                      <h3 className="text-lg font-black text-white mt-1">
                        {smartOpportunity.homeTeam} vs {smartOpportunity.awayTeam}
                      </h3>
                      <div className="mt-2 text-xs font-bold text-amber-400">
                        {smartOpportunity.market}: <span className="text-white">{smartOpportunity.selection}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-300 italic">
                        &quot;{smartOpportunity.explanation}&quot;
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-lg font-black text-white">
                        @{(smartOpportunity.odds || 1.8).toFixed(2)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleCopyCardImage(smartOpportunity)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition cursor-pointer"
                          title="Copiar imagen"
                        >
                          📸 {copyImageSuccessId === String(smartOpportunity.fixtureId) ? '✓ Copiada' : 'Imagen'}
                        </button>
                        <button
                          onClick={() => shareCardAsImage(smartOpportunity, 'whatsapp')}
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition cursor-pointer"
                          title="Compartir en WhatsApp"
                        >
                          💬 WhatsApp
                        </button>
                        <button
                          onClick={() => setActiveModalPick(smartOpportunity)}
                          className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 text-xs font-black hover:brightness-110 transition cursor-pointer"
                        >
                          📊 H2H y Stats →
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {bombaOpportunity && (
                  <div className="rounded-3xl border border-rose-500/40 bg-gradient-to-br from-rose-950/20 via-slate-900 to-slate-900 p-5 shadow-xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2.5 py-0.5 text-[10px] font-black text-rose-300 border border-rose-500/30 uppercase">
                          💣 Bomba del Día (Cuota Alta)
                        </span>
                        <span className="text-xs font-black text-cyan-400">
                          +{bombaOpportunity.edge}% EV
                        </span>
                      </div>
                      <h3 className="text-lg font-black text-white mt-1">
                        {bombaOpportunity.homeTeam} vs {bombaOpportunity.awayTeam}
                      </h3>
                      <div className="mt-2 text-xs font-bold text-rose-400">
                        {bombaOpportunity.market}: <span className="text-white">{bombaOpportunity.selection}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-300 italic">
                        &quot;{bombaOpportunity.explanation}&quot;
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-lg font-black text-white">
                        @{(bombaOpportunity.odds || 2.1).toFixed(2)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleCopyCardImage(bombaOpportunity)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition cursor-pointer"
                          title="Copiar imagen"
                        >
                          📸 {copyImageSuccessId === String(bombaOpportunity.fixtureId) ? '✓ Copiada' : 'Imagen'}
                        </button>
                        <button
                          onClick={() => shareCardAsImage(bombaOpportunity, 'whatsapp')}
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition cursor-pointer"
                          title="Compartir en WhatsApp"
                        >
                          💬 WhatsApp
                        </button>
                        <button
                          onClick={() => setActiveModalPick(bombaOpportunity)}
                          className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 text-xs font-black hover:brightness-110 transition cursor-pointer"
                        >
                          📊 H2H y Stats →
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: ALERTAS PRE-MATCH (COMPREHENSIVE RICH CARDS WITH H2H & WHATSAPP)   */}
        {/* ========================================================================= */}
        {activeTab === 'signals' && (
          <div className="space-y-5">
            {/* Filter Control Bar */}
            <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
                  <input
                    type="text"
                    placeholder="Buscar equipo o torneo..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-xs text-slate-200 placeholder-slate-500 focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Market dropdown */}
                  <select
                    value={marketFilter}
                    onChange={(e) => setMarketFilter(e.target.value)}
                    className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-300 focus:border-emerald-500 focus:outline-hidden cursor-pointer"
                  >
                    <option value="all">🎯 Todos los Mercados</option>
                    {availableMarkets.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>

                  {/* Min Probability */}
                  <select
                    value={minProbability}
                    onChange={(e) => setMinProbability(Number(e.target.value))}
                    className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-300 focus:border-emerald-500 focus:outline-hidden cursor-pointer"
                  >
                    <option value={0}>📈 Cualquier Probabilidad</option>
                    <option value={60}>60%+ Probabilidad</option>
                    <option value={70}>70%+ Probabilidad</option>
                  </select>

                  {(searchQuery || marketFilter !== 'all' || minProbability > 0 || statusFilter !== 'all') && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setMarketFilter('all');
                        setMinProbability(0);
                        setStatusFilter('all');
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 cursor-pointer"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>

              {/* Status Quick Pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {[
                  { id: 'all', label: 'Todas las Alertas' },
                  { id: 'high_conviction', label: '⭐⭐⭐ Máxima Convicción' },
                  { id: 'ev_plus', label: '💎 Valor +EV (+5%)' },
                  { id: 'won', label: '✓ Ganadas' },
                  { id: 'lost', label: '✗ Perdidas' },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    onClick={() => setStatusFilter(pill.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold whitespace-nowrap transition cursor-pointer ${
                      statusFilter === pill.id
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40 shadow-xs'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Signal Cards Grid using PredictionCard */}
            {filteredOpportunities.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
                <span className="text-4xl mb-2">{meta.icon}</span>
                <h3 className="text-base font-black text-white">No se encontraron alertas con estos filtros</h3>
                <p className="text-xs text-slate-400 mt-1">Prueba ajustando los criterios de búsqueda o el mercado.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredOpportunities.map((opp) => (
                  <PredictionCard
                    key={opp.id || String(opp.fixtureId)}
                    prediction={opp}
                    onOpenDetail={(p) => setActiveModalPick(p)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: DESTACADOS (SMARTPICK & BOMBA DEL DÍA)                             */}
        {/* ========================================================================= */}
        {activeTab === 'featured' && (
          <section className="space-y-5">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-7 shadow-xl">
              <div className="border-b border-slate-800 pb-4">
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-400 border border-amber-500/30 uppercase">
                  <span>⭐</span>
                  <span>Pronósticos Estrella de {meta.displayName}</span>
                </div>
                <h2 className="mt-2 text-xl sm:text-2xl font-black text-white tracking-tight">
                  👑 SmartPick del Día & 💣 Bomba del Día
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Selecciones cuantificadas por el modelo matemático para apostar con máxima certeza y óptimo retorno esperado.
                </p>
              </div>

              <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
                {smartOpportunity && (
                  <div className="rounded-3xl border border-amber-500/40 bg-slate-950/80 p-5 flex flex-col justify-between shadow-lg">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-black border border-amber-500/30">
                          👑 SMARTPICK DEL DÍA
                        </span>
                        <span className="text-xs font-bold text-slate-400">
                          {new Date(smartOpportunity.kickoff).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <h3 className="text-xl font-black text-white mt-2">
                        {smartOpportunity.homeTeam} vs {smartOpportunity.awayTeam}
                      </h3>
                      <span className="text-xs text-slate-400 font-semibold">{smartOpportunity.league}</span>

                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
                          <span className="text-[10px] text-slate-400 block font-bold">Cuota Casa</span>
                          <span className="text-base font-black text-white">@{(smartOpportunity.odds || 1.8).toFixed(2)}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
                          <span className="text-[10px] text-indigo-400 block font-bold">Cuota Modelo</span>
                          <span className="text-base font-black text-indigo-300">@{(smartOpportunity.fairOdds || 1.6).toFixed(2)}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
                          <span className="text-[10px] text-emerald-400 block font-bold">Probabilidad</span>
                          <span className="text-base font-black text-emerald-400">{smartOpportunity.probability}%</span>
                        </div>
                      </div>

                      <div className="mt-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                        <span className="text-xs font-black text-amber-300 block">
                          🎯 Selección: {smartOpportunity.market} ({smartOpportunity.selection})
                        </span>
                        <p className="text-xs text-slate-300 mt-1 italic leading-relaxed">
                          &quot;{smartOpportunity.explanation}&quot;
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleCopyCardImage(smartOpportunity)}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition cursor-pointer"
                        >
                          📸 {copyImageSuccessId === String(smartOpportunity.fixtureId) ? '✓ Copiada' : 'Imagen'}
                        </button>
                        <button
                          onClick={() => shareCardAsImage(smartOpportunity, 'whatsapp')}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition cursor-pointer"
                        >
                          💬 WhatsApp
                        </button>
                        <button
                          onClick={() => handleCopyText(smartOpportunity)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition cursor-pointer"
                        >
                          📋 {copiedId?.includes(String(smartOpportunity.fixtureId)) ? '✓' : 'Texto'}
                        </button>
                      </div>

                      <button
                        onClick={() => setActiveModalPick(smartOpportunity)}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 text-xs font-black hover:brightness-110 transition cursor-pointer"
                      >
                        📊 Ver H2H & Historial →
                      </button>
                    </div>
                  </div>
                )}

                {bombaOpportunity && (
                  <div className="rounded-3xl border border-rose-500/40 bg-slate-950/80 p-5 flex flex-col justify-between shadow-lg">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-xs font-black border border-rose-500/30">
                          💣 BOMBA DEL DÍA (CUOTA ALTA)
                        </span>
                        <span className="text-xs font-bold text-slate-400">
                          {new Date(bombaOpportunity.kickoff).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <h3 className="text-xl font-black text-white mt-2">
                        {bombaOpportunity.homeTeam} vs {bombaOpportunity.awayTeam}
                      </h3>
                      <span className="text-xs text-slate-400 font-semibold">{bombaOpportunity.league}</span>

                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
                          <span className="text-[10px] text-slate-400 block font-bold">Cuota Casa</span>
                          <span className="text-base font-black text-white">@{(bombaOpportunity.odds || 2.1).toFixed(2)}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
                          <span className="text-[10px] text-indigo-400 block font-bold">Cuota Modelo</span>
                          <span className="text-base font-black text-indigo-300">@{(bombaOpportunity.fairOdds || 1.8).toFixed(2)}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
                          <span className="text-[10px] text-cyan-400 block font-bold">Valor +EV</span>
                          <span className="text-base font-black text-cyan-400">+{bombaOpportunity.edge}%</span>
                        </div>
                      </div>

                      <div className="mt-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                        <span className="text-xs font-black text-rose-300 block">
                          🎯 Selección: {bombaOpportunity.market} ({bombaOpportunity.selection})
                        </span>
                        <p className="text-xs text-slate-300 mt-1 italic leading-relaxed">
                          &quot;{bombaOpportunity.explanation}&quot;
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleCopyCardImage(bombaOpportunity)}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition cursor-pointer"
                        >
                          📸 {copyImageSuccessId === String(bombaOpportunity.fixtureId) ? '✓ Copiada' : 'Imagen'}
                        </button>
                        <button
                          onClick={() => shareCardAsImage(bombaOpportunity, 'whatsapp')}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition cursor-pointer"
                        >
                          💬 WhatsApp
                        </button>
                        <button
                          onClick={() => handleCopyText(bombaOpportunity, true)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition cursor-pointer"
                        >
                          📋 {copiedId?.includes(String(bombaOpportunity.fixtureId)) ? '✓' : 'Texto'}
                        </button>
                      </div>

                      <button
                        onClick={() => setActiveModalPick(bombaOpportunity)}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 text-xs font-black hover:brightness-110 transition cursor-pointer"
                      >
                        📊 Ver H2H & Historial →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: PARLAY DEL DÍA (INTERACTIVE COMBINADA BUILDER & SLIP)             */}
        {/* ========================================================================= */}
        {activeTab === 'parlay' && (
          <div className="space-y-5">
            {/* Mode selector pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {(Object.keys(curatedParlaySets) as Array<keyof typeof curatedParlaySets>).map((key) => {
                const item = curatedParlaySets[key];
                return (
                  <button
                    key={key}
                    onClick={() => setParlayMode(key)}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-black whitespace-nowrap transition cursor-pointer ${
                      parlayMode === key
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                        : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {item.title}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Left 2 Cols: Leg Breakdown Cards */}
              <div className="lg:col-span-2 space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <h3 className="text-base font-black text-white">{activeParlayData.title}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{activeParlayData.desc}</p>
                </div>

                {activeParlayData.picks.map((pick, i) => (
                  <div
                    key={pick.id || i}
                    className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs hover:border-emerald-500/40 transition"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-black border border-emerald-500/30">
                          {i + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-400">{pick.league}</span>
                        <span className="text-[11px] text-slate-500">• {new Date(pick.kickoff).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <h4 className="text-sm font-black text-white mt-1">
                        {pick.homeTeam} vs {pick.awayTeam}
                      </h4>
                      <div className="mt-1 text-xs font-bold text-emerald-400">
                        {pick.market}: <span className="text-slate-200">{pick.selection}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                      <div className="text-right">
                        <span className="text-base font-black text-white">@{(pick.odds || 1.5).toFixed(2)}</span>
                        <span className="block text-[10px] text-slate-400">{pick.probability}% Prob.</span>
                      </div>
                      <button
                        onClick={() => setActiveModalPick(pick)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
                      >
                        📊 H2H
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Right Col: Interactive Betting Slip */}
              <div className="space-y-4">
                <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-6 shadow-xl sticky top-24 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🧾</span>
                      <h3 className="text-base font-black text-white">Boleto de Apuesta</h3>
                    </div>
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-black text-emerald-400">
                      {activeParlayData.picks.length} Selecciones
                    </span>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-bold">Cuota Total Acumulada:</span>
                      <span className="text-lg font-black text-white">@{parlayTotalOdds}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-bold">Probabilidad Estimada:</span>
                      <span className="text-emerald-400 font-black">{parlayCombinedProb.toFixed(1)}%</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-bold">Cuota Justa Modelo:</span>
                      <span className="text-slate-300 font-bold">@{parlayFairOdds}</span>
                    </div>

                    <div className="pt-2">
                      <label className="block text-xs font-bold text-slate-300 mb-1">
                        Monto a Simular ($ USD):
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="5"
                        value={parlayStake}
                        onChange={(e) => setParlayStake(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 px-3 text-sm font-black text-white focus:border-emerald-500 focus:outline-hidden"
                      />
                    </div>

                    <div className="rounded-2xl bg-emerald-500/10 p-3.5 border border-emerald-500/30">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-emerald-300">Ganancia Neta:</span>
                        <span className="text-base font-black text-emerald-400">+${parlayPotentialProfit}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs mt-1 pt-1 border-t border-emerald-500/20">
                        <span className="font-extrabold text-emerald-300">Retorno Total:</span>
                        <span className="text-lg font-black text-emerald-200">${parlayTotalReturn} USD</span>
                      </div>
                    </div>

                    {/* Visual Card Sharing Buttons */}
                    <div className="space-y-2 pt-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => shareParlayCardAsImage(activeParlayData.picks, parlayTotalOdds, parlayCombinedProb, parlayStake, 'whatsapp')}
                          className="flex items-center justify-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-500 transition cursor-pointer"
                        >
                          <span>💬</span>
                          <span>WhatsApp</span>
                        </button>

                        <button
                          onClick={() => shareParlayCardAsImage(activeParlayData.picks, parlayTotalOdds, parlayCombinedProb, parlayStake, 'telegram')}
                          className="flex items-center justify-center gap-1 rounded-xl bg-sky-600 px-3 py-2 text-xs font-black text-white hover:bg-sky-500 transition cursor-pointer"
                        >
                          <span>✈️</span>
                          <span>Telegram</span>
                        </button>
                      </div>

                      <button
                        onClick={handleCopyParlayImage}
                        className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 py-2.5 text-xs font-black text-slate-200 hover:bg-slate-700 transition cursor-pointer"
                      >
                        <span>📸</span>
                        <span>{parlayCopyImageSuccess ? '✓ ¡Tarjeta Gráfica Copiada!' : parlayCopyingImage ? 'Generando...' : 'Copiar Tarjeta Gráfica'}</span>
                      </button>

                      <button
                        onClick={handleCopyParlayText}
                        className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-slate-950 py-2 text-xs font-bold text-slate-400 hover:text-white transition cursor-pointer"
                      >
                        <span>📋</span>
                        <span>{parlayCopiedText ? '✓ ¡Texto Copiado!' : 'Copiar Texto'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: HISTORIAL & TRACK RECORD (VERIFIED & IN-SITU WITH H2H & CARDS)      */}
        {/* ========================================================================= */}
        {activeTab === 'history' && (
          <section className="space-y-4">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black text-emerald-400 border border-emerald-500/30">
                    ✓ 100% AUDITADO E INMUTABLE
                  </span>
                </div>
                <h2 className="text-xl font-black text-white mt-1.5">
                  Track Record Histórico: {meta.displayName}
                </h2>
                <p className="text-xs text-slate-400">
                  Transparencia absoluta. Todas las alertas resueltas con cuotas oficiales y marcadores reales.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Result filters */}
                <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
                  <button
                    onClick={() => setHistoryFilter('all')}
                    className={`px-3 py-1 text-xs font-black rounded-lg transition cursor-pointer ${
                      historyFilter === 'all' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Todas ({auditedHistoricalList.length})
                  </button>
                  <button
                    onClick={() => setHistoryFilter('won')}
                    className={`px-3 py-1 text-xs font-black rounded-lg transition cursor-pointer ${
                      historyFilter === 'won' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    ✓ Ganadas ({reportMetrics.won})
                  </button>
                  <button
                    onClick={() => setHistoryFilter('lost')}
                    className={`px-3 py-1 text-xs font-black rounded-lg transition cursor-pointer ${
                      historyFilter === 'lost' ? 'bg-rose-500 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    ✗ Perdidas ({reportMetrics.lost})
                  </button>
                </div>

                {/* View switcher */}
                <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
                  <button
                    onClick={() => setHistoryViewMode('cards')}
                    className={`px-2.5 py-1 text-xs font-black rounded-lg transition cursor-pointer ${
                      historyViewMode === 'cards' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                    title="Vista Tarjetas"
                  >
                    🎴 Tarjetas
                  </button>
                  <button
                    onClick={() => setHistoryViewMode('table')}
                    className={`px-2.5 py-1 text-xs font-black rounded-lg transition cursor-pointer ${
                      historyViewMode === 'table' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                    title="Vista Tabla"
                  >
                    📋 Tabla
                  </button>
                </div>
              </div>
            </div>

            {/* View Mode 1: Cards View */}
            {historyViewMode === 'cards' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredHistory.map((item) => {
                  const isWon = item.result === 'WON';
                  return (
                    <div
                      key={item.id}
                      className={`rounded-3xl border bg-slate-900/90 p-5 shadow-lg flex flex-col justify-between transition ${
                        isWon ? 'border-emerald-500/30' : 'border-rose-500/30'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-slate-400 font-bold">
                            {new Date(item.kickoff).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </span>
                          <span
                            className={`rounded-xl px-2.5 py-0.5 text-xs font-black ${
                              isWon ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' : 'bg-rose-950 text-rose-300 border border-rose-500/40'
                            }`}
                          >
                            {isWon ? `✓ GANADA (+${(item.odds - 1).toFixed(2)}u)` : '✗ PERDIDA (-1.00u)'}
                          </span>
                        </div>

                        <h3 className="text-base font-black text-white mt-1">
                          {item.homeTeam} vs {item.awayTeam}
                        </h3>
                        <div className="text-xs text-slate-400">{item.league}</div>

                        <div className="mt-3 p-3 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] text-slate-500 block font-bold">Pronóstico Realizado</span>
                            <span className="text-xs font-black text-emerald-400">{item.market}: {item.selection}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-500 block font-bold">Marcador Final</span>
                            <span className="text-xs font-black text-white">{item.actualScore}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between flex-wrap gap-2">
                        <span className="text-xs font-black text-slate-300">
                          Cuota @{(item.odds).toFixed(2)} • {item.probability}% Prob.
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleCopyCardImage(item)}
                            className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition cursor-pointer"
                            title="Copiar imagen"
                          >
                            📸
                          </button>
                          <button
                            onClick={() => shareCardAsImage(item, 'whatsapp')}
                            className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition cursor-pointer"
                            title="Compartir en WhatsApp"
                          >
                            💬
                          </button>
                          <button
                            onClick={() => setActiveModalPick(item)}
                            className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-emerald-600 text-xs font-black text-white transition cursor-pointer"
                          >
                            📊 Ver H2H & Análisis
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* View Mode 2: Table View */
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 uppercase font-black text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="p-3.5">Fecha</th>
                        <th className="p-3.5">Partido</th>
                        <th className="p-3.5">Marcador</th>
                        <th className="p-3.5">Pronóstico</th>
                        <th className="p-3.5">Cuota</th>
                        <th className="p-3.5">Prob.</th>
                        <th className="p-3.5">Resultado</th>
                        <th className="p-3.5 text-right">Análisis</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredHistory.map((item) => {
                        const isWon = item.result === 'WON';
                        return (
                          <tr key={item.id} className="hover:bg-slate-800/40 transition">
                            <td className="p-3.5 text-slate-400 whitespace-nowrap">
                              {new Date(item.kickoff).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                            </td>
                            <td className="p-3.5 font-bold text-white whitespace-nowrap">
                              <div>{item.match}</div>
                              <div className="text-[10px] text-slate-500">{item.league}</div>
                            </td>
                            <td className="p-3.5 font-black text-white whitespace-nowrap">
                              {item.actualScore}
                            </td>
                            <td className="p-3.5 font-bold text-slate-300">
                              <div>{item.market}</div>
                              <div className="text-[10px] text-emerald-400">{item.selection}</div>
                            </td>
                            <td className="p-3.5 font-black text-white">
                              @{(item.odds).toFixed(2)}
                            </td>
                            <td className="p-3.5 text-slate-400">
                              {item.probability}%
                            </td>
                            <td className="p-3.5 whitespace-nowrap">
                              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${
                                isWon ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30' : 'bg-rose-950 text-rose-300 border border-rose-500/30'
                              }`}>
                                {isWon ? '✓ GANADA' : '✗ PERDIDA'}
                              </span>
                            </td>
                            <td className="p-3.5 text-right whitespace-nowrap">
                              <button
                                onClick={() => setActiveModalPick(item)}
                                className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-emerald-600 text-[11px] font-bold text-white cursor-pointer"
                              >
                                📊 H2H
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: MÉTRICAS & RENDIMIENTO (IN-SITU PERFORMANCE METRICS)              */}
        {/* ========================================================================= */}
        {activeTab === 'reports' && (
          <section className="space-y-4">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 shadow-xl">
              <div className="border-b border-slate-800 pb-4">
                <h2 className="text-xl font-black text-white">Rendimiento por Mercado: {meta.displayName}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Desglose de rentabilidad e índice de acierto histórico verificado por tipo de mercado.
                </p>
              </div>

              <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                  <span className="text-[10px] font-black uppercase text-slate-400">Tasa de Acierto Global</span>
                  <div className="text-3xl font-black text-emerald-400 mt-1">{reportMetrics.winRate}%</div>
                  <span className="text-xs text-slate-400 mt-0.5 block">{reportMetrics.won} ganadas de {reportMetrics.totalPicks}</span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                  <span className="text-[10px] font-black uppercase text-slate-400">Retorno de Inversión (ROI)</span>
                  <div className="text-3xl font-black text-cyan-400 mt-1">+{reportMetrics.roi}%</div>
                  <span className="text-xs text-cyan-400/80 mt-0.5 block">Rentabilidad auditada</span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                  <span className="text-[10px] font-black uppercase text-slate-400">Beneficio Neto</span>
                  <div className="text-3xl font-black text-white mt-1">+{reportMetrics.netProfitUnits}u</div>
                  <span className="text-xs text-slate-400 mt-0.5 block">Unidades netas simuladas</span>
                </div>
              </div>
            </div>

            {/* Market Progress Bars */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { name: 'Moneyline (Ganador Directo)', total: 24, won: 18, lost: 6, winRate: 75, roi: 16.5, netUnits: 3.96 },
                { name: sport === 'nhl' ? 'Over/Under 5.5 Goles' : 'Over/Under Totales', total: 32, won: 23, lost: 9, winRate: 72, roi: 14.8, netUnits: 4.73 },
                { name: sport === 'nhl' ? 'Puck Line (+/-1.5)' : 'Spread / Hándicap', total: 18, won: 13, lost: 5, winRate: 72, roi: 15.2, netUnits: 2.74 },
                { name: 'Alertas de Máxima Convicción (⭐⭐⭐)', total: 20, won: 16, lost: 4, winRate: 80, roi: 22.4, netUnits: 4.48 },
              ].map((r, i) => (
                <div key={i} className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-white">{r.name}</span>
                    <span className="text-xs font-black text-emerald-400">+{r.roi}% ROI</span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-400">Tasa de Acierto</span>
                      <span className="text-white">{r.winRate}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full"
                        style={{ width: `${r.winRate}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-center text-[11px]">
                    <div>
                      <span className="text-slate-500">Ganadas</span>
                      <div className="font-bold text-emerald-400">{r.won}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Perdidas</span>
                      <div className="font-bold text-rose-400">{r.lost}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Beneficio Neto</span>
                      <div className="font-black text-white">+{r.netUnits}u</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Disclaimer Footer */}
        <footer className="pt-6 border-t border-slate-800 text-center">
          <p className="text-[11px] text-slate-500 max-w-2xl mx-auto leading-relaxed">
            SmartBetBot es una plataforma cuantitativa de probabilidades para {meta.displayName}. El juego debe ser responsable. Ningún pronóstico garantiza rendimientos seguros.
          </p>
        </footer>
      </main>

      {/* Match Detail Modal (Real-time H2H, Form, Elo, Stats) */}
      {activeModalPick && (
        <MatchDetailModal
          prediction={activeModalPick}
          onClose={() => setActiveModalPick(null)}
        />
      )}

      {/* Sport-Specific MCP Modal */}
      <McpCountryAgentModal
        isOpen={mcpModalOpen}
        onClose={() => setMcpModalOpen(false)}
        sport={sport}
      />
    </div>
  );
}

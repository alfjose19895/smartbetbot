'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/context/LanguageContext';
import { logoutAction } from '@/features/auth/actions';
import { SupportedSport } from '@/lib/sports/types';

interface NavbarProps {
  onSync?: () => void;
  syncing?: boolean;
  userRole?: string;
  userEmail?: string;
}

const SPORTS_OPTIONS: Array<{
  id: SupportedSport | 'nfl_ncaaf' | 'all';
  label: string;
  icon: string;
  href: string;
  badge?: string;
  activeMatches: (path: string) => boolean;
}> = [
  {
    id: 'all',
    label: 'Todos los Deportes',
    icon: '🌐',
    href: '/dashboard',
    activeMatches: (p) => p === '/dashboard' || p === '/',
  },
  {
    id: 'football',
    label: 'Fútbol',
    icon: '⚽',
    href: '/signals',
    activeMatches: (p) =>
      p === '/signals' ||
      p === '/sports/football' ||
      p === '/parlay' ||
      p === '/history' ||
      p === '/reports' ||
      p === '/featured' ||
      p === '/weekend' ||
      p === '/corners-vip' ||
      p === '/cards-vip' ||
      p === '/shots-vip' ||
      p === '/over25-vip' ||
      p === '/btts-vip' ||
      p === '/home-win-vip' ||
      p === '/away-win-vip',
  },
  {
    id: 'nhl',
    label: 'NHL',
    icon: '🏒',
    href: '/sports/nhl',
    badge: 'ACTIVO',
    activeMatches: (p) => p === '/sports/nhl' || p === '/nhl',
  },
  {
    id: 'nba',
    label: 'NBA',
    icon: '🏀',
    href: '/sports/nba',
    activeMatches: (p) => p === '/sports/nba' || p === '/nba',
  },
  {
    id: 'nfl_ncaaf',
    label: 'NFL / NCAAF',
    icon: '🏈',
    href: '/sports/nfl',
    activeMatches: (p) => p === '/sports/nfl' || p === '/sports/ncaaf' || p === '/nfl' || p === '/ncaaf',
  },
];

// Definition of each individual VIP module (Strictly single instance)
const VIP_MODULES_NAV = [
  {
    id: 'corners_vip',
    href: '/corners-vip',
    label: 'Corners VIP',
    icon: '🚩',
    tag: 'Córners +EV',
    prob: '≥ 70%',
  },
  {
    id: 'over25_vip',
    href: '/over25-vip',
    label: 'Over 2.5 VIP',
    icon: '⚽',
    tag: 'Goles Totales',
    prob: '≥ 60%',
  },
  {
    id: 'btts_vip',
    href: '/btts-vip',
    label: 'Ambos Anotan VIP',
    icon: '🥅',
    tag: 'Ambos Marcan (BTTS)',
    prob: '≥ 58%',
  },
  {
    id: 'home_win_vip',
    href: '/home-win-vip',
    label: 'Gana Local VIP',
    icon: '🏠',
    tag: 'Victoria Equipo Local',
    prob: '≥ 58%',
  },
  {
    id: 'away_win_vip',
    href: '/away-win-vip',
    label: 'Gana Visitante VIP',
    icon: '✈️',
    tag: 'Victoria Equipo Visitante',
    prob: '≥ 65%',
  },
  {
    id: 'cards_vip',
    href: '/cards-vip',
    label: 'Tarjetas VIP',
    icon: '🟨',
    tag: 'Amonestaciones Cuantitativas',
    prob: 'Cuantitativo',
  },
  {
    id: 'shots_vip',
    href: '/shots-vip',
    label: 'Disparos VIP',
    icon: '🎯',
    tag: 'Remates y Tiros a Puerta',
    prob: 'Cuantitativo',
  },
  {
    id: 'weekend',
    href: '/weekend',
    label: 'Finde VIP',
    icon: '💎',
    tag: '15 Picks Exclusivos',
    prob: 'Fin de Semana',
  },
];

export function Navbar({ onSync, syncing = false, userRole, userEmail }: NavbarProps) {
  const pathname = usePathname();
  const [currentTab, setCurrentTab] = useState<string | null>(null);
  const { language, t } = useLanguage();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sportDropdownOpen, setSportDropdownOpen] = useState(false);
  const [vipDropdownOpen, setVipDropdownOpen] = useState(false);
  const [currentRole, setCurrentRole] = useState<string>(userRole || 'user');
  const [vipModules, setVipModules] = useState<string[]>([]);
  const [vipAccess, setVipAccess] = useState<boolean>(false);
  const [currentEmail, setCurrentEmail] = useState<string>(userEmail || '');
  const [loggingOut, setLoggingOut] = useState(false);
  const [localSyncing, setLocalSyncing] = useState(false);

  const sportDropdownRef = useRef<HTMLDivElement>(null);
  const vipDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sportDropdownRef.current && !sportDropdownRef.current.contains(event.target as Node)) {
        setSportDropdownOpen(false);
      }
      if (vipDropdownRef.current && !vipDropdownRef.current.contains(event.target as Node)) {
        setVipDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setCurrentTab(params.get('tab'));
    }
  }, [pathname]);

  // Fetch session profile and load VIP permissions
  useEffect(() => {
    fetch('/api/auth/profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          if (!userRole) setCurrentRole(data.user.role || 'user');
          if (!userEmail) setCurrentEmail(data.user.email || '');
          setVipModules(Array.isArray(data.user.vipModules) ? data.user.vipModules : []);
          setVipAccess(Boolean(data.user.vipAccess));
        }
      })
      .catch(() => {});
  }, [userRole, userEmail]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logoutAction();
    } catch {
      window.location.href = '/login';
    } finally {
      setLoggingOut(false);
    }
  };

  const handleAdminSync = async () => {
    if (onSync) {
      onSync();
      return;
    }
    try {
      setLocalSyncing(true);
      const targetSport = currentSport.id === 'nfl_ncaaf' ? 'nfl' : currentSport.id;
      const res = await fetch('/api/admin/sync/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sport: targetSport }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.newAlerts && data.newAlerts.length > 0) {
          window.dispatchEvent(new CustomEvent('new-alerts-discovered', { detail: { newAlerts: data.newAlerts } }));
        }
        if (Array.isArray(data.predictions)) {
          window.dispatchEvent(new CustomEvent('predictions-updated', { detail: data.predictions }));
        }
        setTimeout(() => {
          window.location.reload();
        }, 800);
      }
    } catch {
    } finally {
      setLocalSyncing(false);
    }
  };

  const isSyncInProgress = syncing || localSyncing;

  // Active sport detection (Default to General "all" if on dashboard or root)
  const currentSport =
    SPORTS_OPTIONS.find((s) => s.id !== 'all' && s.activeMatches(pathname)) || SPORTS_OPTIONS[0];

  const isUserAdmin = currentRole === 'admin' || (currentEmail || '').toLowerCase().includes('ajhs1589');

  // Filter VIP modules authorized for current user (Strictly unique)
  const authorizedVipModules = VIP_MODULES_NAV.filter((mod) => {
    if (isUserAdmin) return true;
    if (vipModules.includes('*')) return true;
    return vipModules.includes(mod.id);
  });

  const isCurrentVipRoute = VIP_MODULES_NAV.some((m) => pathname === m.href);

  // Dynamic navigation links adapted to current sport context
  const getSportHref = (type: 'dashboard' | 'signals' | 'featured' | 'weekend' | 'parlay' | 'history' | 'reports' | 'settings') => {
    if (type === 'settings') return '/settings';
    if (currentSport.id === 'all' || currentSport.id === 'football') {
      if (type === 'dashboard') return '/dashboard';
      if (type === 'signals') return '/signals';
      if (type === 'featured') return '/featured';
      if (type === 'weekend') return '/weekend';
      if (type === 'parlay') return '/parlay';
      if (type === 'history') return '/history';
      if (type === 'reports') return '/reports';
    }
    const base = currentSport.href;
    if (type === 'dashboard') return base;
    return `${base}?tab=${type}`;
  };

  const checkIsActive = (href: string) => {
    if (href === '/settings') return pathname === '/settings';
    if (href.includes('?tab=')) {
      const [path, query] = href.split('?tab=');
      return pathname === path && currentTab === query;
    }
    if (currentSport.id !== 'all') {
      return pathname === href && (!currentTab || currentTab === 'dashboard');
    }
    return pathname === href;
  };

  const primaryNavLinks = [
    {
      href: getSportHref('dashboard'),
      label: currentSport.id === 'all' ? 'Dashboard' : t('navDashboard'),
      icon: '📊',
    },
    { href: getSportHref('signals'), label: 'Pre-Match', icon: '📋' },
    { href: getSportHref('featured'), label: 'Destacados ⭐', icon: '⭐' },
    { href: getSportHref('parlay'), label: t('navParlay'), icon: '🎲' },
  ];

  const secondaryNavLinks = [
    { href: getSportHref('history'), label: t('navHistory'), icon: '📜' },
    { href: getSportHref('reports'), label: 'Reportes', icon: '📈' },
    { href: '/settings', label: t('navSettings'), icon: '⚙️' },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-md transition-colors">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3 gap-2 sm:gap-4">
        
        {/* Left: Brand Logo & Sport Selector Dropdown */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <Link href="/" className="flex items-center gap-2 select-none group">
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 text-base sm:text-lg font-black text-slate-950 shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              🎯
            </span>
            <div className="flex flex-col">
              <span className="text-base sm:text-lg font-black tracking-tight text-white leading-none">
                Smart<span className="text-emerald-400">Bet</span>Bot
              </span>
              {currentRole && (
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 leading-none">
                  {isUserAdmin ? '👑 ' + t('navAdminRole') : t('navBettor')}
                </span>
              )}
            </div>
          </Link>

          {/* Sport Selector Dropdown */}
          <div className="relative" ref={sportDropdownRef}>
            <button
              onClick={() => setSportDropdownOpen(!sportDropdownOpen)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/90 px-2.5 py-1.5 text-xs font-black text-white hover:border-slate-700 hover:bg-slate-800/80 transition cursor-pointer shadow-xs"
            >
              <span className="text-sm">{currentSport.icon}</span>
              <span className="hidden sm:inline max-w-[120px] truncate">{currentSport.label}</span>
              <span className="text-[10px] text-slate-400">▼</span>
            </button>

            {sportDropdownOpen && (
              <div className="absolute left-0 mt-2 w-52 rounded-2xl border border-slate-800 bg-slate-950/98 p-1.5 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-800/60 mb-1">
                  Seleccionar Deporte
                </div>
                {SPORTS_OPTIONS.map((sport) => {
                  const isSelected = currentSport.id === sport.id;
                  return (
                    <Link
                      key={sport.id}
                      href={sport.href}
                      onClick={() => setSportDropdownOpen(false)}
                      className={`flex items-center justify-between rounded-xl px-2.5 py-2 text-xs font-bold transition ${
                        isSelected
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-black'
                          : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{sport.icon}</span>
                        <span>{sport.label}</span>
                      </div>
                      {sport.badge ? (
                        <span className="rounded-full bg-cyan-500 px-1.5 py-0.2 text-[8px] font-black text-slate-950">
                          {sport.badge}
                        </span>
                      ) : isSelected ? (
                        <span className="text-xs text-emerald-400">✓</span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Center: Clean Non-Overflowing Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-1 xl:gap-1.5">
          {/* Primary Core Links */}
          {primaryNavLinks.map((link) => {
            const isActive = checkIsActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-2.5 xl:px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/30 shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900'
                }`}
              >
                <span>{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            );
          })}

          {/* Elegant VIP Modules Dropdown (Solves Horizontal Overflow) */}
          {authorizedVipModules.length > 0 && (
            <div className="relative" ref={vipDropdownRef}>
              <button
                type="button"
                onClick={() => setVipDropdownOpen(!vipDropdownOpen)}
                className={`px-2.5 xl:px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 border ${
                  isCurrentVipRoute
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40 shadow-xs shadow-emerald-500/20'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200'
                }`}
                title="Módulos VIP de Alta Convicción"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                <span>💎 Módulos VIP</span>
                <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[9px] font-black text-amber-300 border border-amber-500/30">
                  {authorizedVipModules.length}
                </span>
                <span className="text-[10px] text-amber-400">▼</span>
              </button>

              {vipDropdownOpen && (
                <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-[440px] rounded-2xl border border-slate-800 bg-slate-950/98 p-2 shadow-2xl backdrop-blur-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/80 mb-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <span>💎</span>
                      <span>Suite de Módulos VIP</span>
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 bg-slate-900 px-2 py-0.5 rounded-full border border-slate-800">
                      {isUserAdmin ? '👑 Acceso Total Admin' : `${authorizedVipModules.length} activos`}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {authorizedVipModules.map((mod) => {
                      const isActive = pathname === mod.href;
                      return (
                        <Link
                          key={mod.href}
                          href={mod.href}
                          onClick={() => setVipDropdownOpen(false)}
                          className={`flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer group border ${
                            isActive
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-xs'
                              : 'border-slate-800/80 bg-slate-900/50 hover:bg-slate-900 hover:border-slate-700 text-slate-300 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-base shrink-0 group-hover:scale-110 transition-transform">
                              {mod.icon}
                            </span>
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-bold truncate leading-tight">
                                {mod.label}
                              </span>
                              <span className="text-[10px] text-slate-400 truncate">
                                {mod.tag}
                              </span>
                            </div>
                          </div>
                          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-slate-950 text-emerald-400 border border-emerald-500/20 shrink-0 ml-1.5">
                            {mod.prob}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Secondary Links (Historial, Reportes, Ajustes) */}
          {secondaryNavLinks.map((link) => {
            const isActive = checkIsActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-2 xl:px-2.5 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/30 shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900'
                }`}
              >
                <span>{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            );
          })}

          {/* Admin Dashboard shortcut */}
          {isUserAdmin && (
            <Link
              href="/admin"
              className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition cursor-pointer border ${
                pathname === '/admin'
                  ? 'bg-purple-600 text-white shadow-xs border-purple-500'
                  : 'text-purple-400 hover:text-purple-300 hover:bg-purple-950/40 border-purple-500/30 bg-purple-500/10'
              }`}
            >
              <span>👑</span>
              <span>{t('navAdmin')}</span>
            </Link>
          )}
        </nav>

        {/* Right: Actions & User Control */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Admin Search Button */}
          {isUserAdmin && (
            <button
              onClick={handleAdminSync}
              disabled={isSyncInProgress}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-black text-emerald-400 transition hover:bg-emerald-500/20 cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-xs"
              title="Sincronizar y auditar partidos de hoy"
            >
              <span className={isSyncInProgress ? 'animate-spin' : ''}>⚡</span>
              <span>{isSyncInProgress ? '...' : '⚡ Buscar'}</span>
            </button>
          )}

          {/* Logout Button (Desktop) */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="hidden md:flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-300 shadow-xs hover:border-red-900/60 hover:bg-red-950/40 hover:text-red-400 transition cursor-pointer"
            title={t('navLogout')}
          >
            <span>⎋</span>
            <span>{loggingOut ? '...' : t('navLogout')}</span>
          </button>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Abrir menú"
            className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-200 shadow-xs lg:hidden cursor-pointer"
          >
            <span className="text-base font-bold">{mobileMenuOpen ? '✕' : '☰'}</span>
          </button>
        </div>
      </div>

      {/* Mobile Menu Drawer (Completely deduplicated and neatly organized) */}
      {mobileMenuOpen && (
        <div className="border-t border-slate-800 bg-slate-950/98 px-4 py-4 shadow-2xl backdrop-blur-xl lg:hidden animate-in fade-in slide-in-from-top-2 duration-150 space-y-4 max-h-[85vh] overflow-y-auto">
          {/* User Info Header */}
          {currentEmail && (
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 text-xs text-slate-400">
              <div className="truncate mr-2">
                Usuario: <span className="font-bold text-white">{currentEmail}</span>
              </div>
              <span className="rounded-md bg-emerald-950 px-2 py-0.5 text-[10px] font-extrabold text-emerald-400 shrink-0 border border-emerald-500/20">
                {isUserAdmin ? '👑 ' + t('navAdminRole') : t('navBettor')}
              </span>
            </div>
          )}

          {/* 1. Sport Selector in Mobile */}
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">
              🏆 Seleccionar Deporte
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SPORTS_OPTIONS.map((sport) => {
                const isSelected = currentSport.id === sport.id;
                return (
                  <Link
                    key={sport.id}
                    href={sport.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2 rounded-xl p-2.5 text-xs font-bold transition ${
                      isSelected
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-400/40 font-black'
                        : 'bg-slate-900 text-slate-300 border border-slate-800'
                    }`}
                  >
                    <span className="text-base">{sport.icon}</span>
                    <span className="truncate">{sport.label}</span>
                    {sport.badge && (
                      <span className="rounded-full bg-cyan-500 px-1 py-0.2 text-[8px] font-black text-slate-950 ml-auto">
                        {sport.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* 2. Core Navigation Links (Mobile) */}
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">
              🧭 Navegación Principal ({currentSport.label})
            </div>
            <div className="grid grid-cols-2 gap-2">
              {primaryNavLinks.map((link) => {
                const isActive = checkIsActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2 rounded-xl p-2.5 text-xs font-bold transition ${
                      isActive
                        ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-500/30 font-black'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                    }`}
                  >
                    <span className="text-base">{link.icon}</span>
                    <span className="truncate">{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* 3. Authorized VIP Modules (Strictly Single Instance, No Duplicates) */}
          {authorizedVipModules.length > 0 && (
            <div>
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-amber-400 mb-2">
                <span>💎 Módulos VIP Autorizados</span>
                <span className="text-[9px] bg-amber-500/10 text-amber-300 px-1.5 py-0.2 rounded border border-amber-500/20">
                  {authorizedVipModules.length} activos
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {authorizedVipModules.map((mod) => {
                  const isActive = pathname === mod.href;
                  return (
                    <Link
                      key={mod.href}
                      href={mod.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex flex-col gap-0.5 rounded-xl p-2.5 text-xs transition border ${
                        isActive
                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40 font-bold'
                          : 'bg-slate-900/90 text-slate-200 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{mod.icon}</span>
                        <span className="font-bold truncate">{mod.label}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 truncate">{mod.prob}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Secondary Navigation (Historial, Reportes, Configuración, Admin) */}
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">
              📊 Análisis & Sistema
            </div>
            <div className="grid grid-cols-2 gap-2">
              {secondaryNavLinks.map((link) => {
                const isActive = checkIsActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2 rounded-xl p-2.5 text-xs font-bold transition ${
                      isActive
                        ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-500/30 font-black'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                    }`}
                  >
                    <span className="text-base">{link.icon}</span>
                    <span className="truncate">{link.label}</span>
                  </Link>
                );
              })}

              {isUserAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 rounded-xl p-2.5 text-xs font-bold bg-purple-950/50 text-purple-300 border border-purple-800 col-span-2"
                >
                  <span className="text-base">👑</span>
                  <span>Panel de Administración</span>
                </Link>
              )}
            </div>
          </div>

          {/* Full-width Mobile Logout Button */}
          <div className="pt-2 border-t border-slate-800">
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-900 bg-red-950/60 py-2.5 text-xs font-bold text-red-300 cursor-pointer"
            >
              <span className="text-sm font-bold">⎋</span>
              <span>{loggingOut ? '...' : t('navLogout')}</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

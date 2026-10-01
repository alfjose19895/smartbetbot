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
      p === '/featured',
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

export function Navbar({ onSync, syncing = false, userRole, userEmail }: NavbarProps) {
  const pathname = usePathname();
  const [currentTab, setCurrentTab] = useState<string | null>(null);
  const { language, t } = useLanguage();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sportDropdownOpen, setSportDropdownOpen] = useState(false);
  const [currentRole, setCurrentRole] = useState<string>(userRole || 'user');
  const [currentEmail, setCurrentEmail] = useState<string>(userEmail || '');
  const [loggingOut, setLoggingOut] = useState(false);
  const [localSyncing, setLocalSyncing] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close sport dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSportDropdownOpen(false);
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

  // Fetch session profile
  useEffect(() => {
    if (!userRole || !userEmail) {
      fetch('/api/auth/profile')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.user) {
            setCurrentRole(data.user.role || 'user');
            setCurrentEmail(data.user.email || '');
          }
        })
        .catch(() => {});
    }
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
        window.location.reload();
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

  // Dynamic navigation links adapted to current sport context with global Settings option
  const getSportHref = (type: 'dashboard' | 'signals' | 'parlay' | 'history' | 'settings') => {
    if (type === 'settings') return '/settings';
    if (currentSport.id === 'all' || currentSport.id === 'football') {
      if (type === 'dashboard') return '/dashboard';
      if (type === 'signals') return '/signals';
      if (type === 'parlay') return '/parlay';
      if (type === 'history') return '/history';
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

  const essentialNavLinks = [
    {
      href: getSportHref('dashboard'),
      label: currentSport.id === 'all' ? 'Dashboard General' : t('navDashboard'),
      icon: '📊',
    },
    { href: getSportHref('signals'), label: 'Pre-Match', icon: '📋' },
    { href: getSportHref('parlay'), label: t('navParlay'), icon: '🎲' },
    { href: getSportHref('history'), label: t('navHistory'), icon: '📜' },
    { href: '/settings', label: t('navSettings'), icon: '⚙️' },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-md transition-colors">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3 gap-2 sm:gap-4">
        
        {/* Left: Brand Logo & Sport Selector Dropdown */}
        <div className="flex items-center gap-3 shrink-0">
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
                  {currentRole === 'admin' ? `👑 ${t('navAdminRole')}` : `🎯 ${t('navBettor')}`}
                </span>
              )}
            </div>
          </Link>

          {/* Sport Selector Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setSportDropdownOpen(!sportDropdownOpen)}
              className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-2.5 sm:px-3 py-1.5 text-xs font-black text-slate-200 hover:border-slate-700 hover:bg-slate-850 transition cursor-pointer shadow-xs"
              aria-label="Seleccionar Deporte"
            >
              <span className="text-sm sm:text-base">{currentSport.icon}</span>
              <span className="hidden sm:inline font-black text-white">{currentSport.label}</span>
              <span className="text-[10px] text-slate-400">▼</span>
            </button>

            {sportDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-56 rounded-2xl border border-slate-800 bg-slate-900/98 p-1.5 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 border-b border-slate-800/80 mb-1">
                  🏆 Deportes & Módulos
                </div>
                {SPORTS_OPTIONS.map((sport) => {
                  const isSelected = currentSport.id === sport.id;
                  return (
                    <Link
                      key={sport.id}
                      href={sport.href}
                      onClick={() => setSportDropdownOpen(false)}
                      className={`flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-xs font-bold transition ${
                        isSelected
                          ? 'bg-emerald-950 text-emerald-300 font-black'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-emerald-400'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{sport.icon}</span>
                        <span>{sport.label}</span>
                      </div>
                      {sport.badge ? (
                        <span className="rounded-full bg-cyan-500 px-1.5 py-0.2 text-[9px] font-black text-slate-950">
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

        {/* Center: Clean Essential Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-1 xl:gap-1.5">
          {essentialNavLinks.map((link) => {
            const isActive = checkIsActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
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
          {currentRole === 'admin' && (
            <Link
              href="/admin"
              className={`hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition cursor-pointer ${
                pathname === '/admin'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-purple-400 hover:text-purple-300 hover:bg-purple-950/40'
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
          {currentRole === 'admin' && (
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

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="border-t border-slate-800 bg-slate-950/98 px-4 py-4 shadow-2xl backdrop-blur-xl lg:hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* User Info */}
          {currentEmail && (
            <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2.5 text-xs text-slate-400">
              <div className="truncate mr-2">
                Usuario: <span className="font-bold text-white">{currentEmail}</span>
              </div>
              <span className="rounded-md bg-emerald-950 px-2 py-0.5 text-[10px] font-extrabold text-emerald-400 shrink-0">
                {currentRole === 'admin' ? t('navAdminRole') : t('navBettor')}
              </span>
            </div>
          )}

          {/* Sport Selector in Mobile */}
          <div className="mb-4">
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

          {/* Navigation Links Grid (Mobile) */}
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">
            🧭 Navegación ({currentSport.label})
          </div>
          <nav className="grid grid-cols-2 gap-2">
            {essentialNavLinks.map((link) => {
              const isActive = checkIsActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 rounded-xl p-3 text-xs font-bold transition ${
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

            {currentRole === 'admin' && (
              <Link
                href="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 rounded-xl p-3 text-xs font-bold bg-purple-950/50 text-purple-300 border border-purple-800 col-span-2"
              >
                <span className="text-base">👑</span>
                <span>Panel de Administración</span>
              </Link>
            )}
          </nav>

          {/* Full-width Mobile Logout Button */}
          <div className="mt-4 pt-3 border-t border-slate-800">
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

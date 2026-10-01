import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { getVerifiedIdentity } from '@/features/auth/lib/session';
import { isValidSport } from '@/lib/sports/registry';
import { isSportFeatureEnabled } from '@/lib/sports/config';
import { NHLSyncEngine } from '@/lib/sports/nhl/nhl-sync';
import { SportDashboardView } from '@/components/SportDashboardView';
import { MultiSportSignal, SupportedSport } from '@/lib/sports/types';

interface SportPageProps {
  params: Promise<{ sport: string }>;
}

export default async function DynamicSportPage({ params }: SportPageProps) {
  const identity = await getVerifiedIdentity();
  const { sport } = await params;

  if (!identity) {
    redirect(`/login?next=/sports/${sport}`);
  }

  // Football uses the primary native suite (/signals, /dashboard, /parlay, /history)
  if (sport === 'football') {
    redirect('/signals');
  }

  if (!isValidSport(sport)) {
    notFound();
  }

  const isEnabled = isSportFeatureEnabled(sport as SupportedSport);

  let signals: MultiSportSignal[] = [];
  let smartPick: MultiSportSignal | null = null;
  let totalGames = 0;

  // 1. NHL SPORT SUITE
  if (sport === 'nhl' && isEnabled) {
    try {
      const nhlData = await NHLSyncEngine.getTodayNHLSignals();
      signals = nhlData.signals || [];
      smartPick = nhlData.smartPick || null;
      totalGames = nhlData.gamesCount || 0;
    } catch {
      signals = [];
      smartPick = null;
      totalGames = 0;
    }
  }

  return (
    <SportDashboardView
      sport={sport as SupportedSport}
      signals={signals}
      smartPick={smartPick}
      totalGames={totalGames}
    />
  );
}

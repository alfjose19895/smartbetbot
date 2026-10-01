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

  if (!isValidSport(sport)) {
    notFound();
  }

  const isEnabled = isSportFeatureEnabled(sport as SupportedSport);

  let signals: MultiSportSignal[] = [];
  let smartPick: MultiSportSignal | null = null;
  let totalGames = 0;

  if (sport === 'nhl' && isEnabled) {
    const nhlData = await NHLSyncEngine.getTodayNHLSignals();
    signals = nhlData.signals;
    smartPick = nhlData.smartPick;
    totalGames = nhlData.gamesCount;
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

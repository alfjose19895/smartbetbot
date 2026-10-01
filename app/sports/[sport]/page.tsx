import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { getVerifiedIdentity } from '@/features/auth/lib/session';
import { isValidSport, getCurrentSportSeason } from '@/lib/sports/registry';
import { isSportFeatureEnabled } from '@/lib/sports/config';
import { NHLSyncEngine } from '@/lib/sports/nhl/nhl-sync';
import { SportDashboardView } from '@/components/SportDashboardView';
import { MultiSportSignal, SupportedSport } from '@/lib/sports/types';
import { getStoredPredictions, loadDailySnapshotAsync, getEcuadorDateString } from '@/lib/sports/db';
import { getFeaturedDailyPicks } from '@/lib/sports/prediction-engine';

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

  // 1. NHL SPORT SUITE
  if (sport === 'nhl' && isEnabled) {
    const nhlData = await NHLSyncEngine.getTodayNHLSignals();
    signals = nhlData.signals;
    smartPick = nhlData.smartPick;
    totalGames = nhlData.gamesCount;
  }

  // 2. FOOTBALL SPORT SUITE
  if (sport === 'football') {
    const todayDateStr = getEcuadorDateString(Date.now());
    let footballPredictions = getStoredPredictions();
    if (!footballPredictions || footballPredictions.length === 0) {
      footballPredictions = (await loadDailySnapshotAsync(todayDateStr)) || [];
    }
    const todayOnly = footballPredictions.filter((p) => {
      const pDate = p.kickoff ? getEcuadorDateString(p.kickoff) : todayDateStr;
      return pDate === todayDateStr;
    });
    totalGames = todayOnly.length;
    signals = todayOnly.map((p) => ({
      id: String(p.fixtureId || p.id),
      sport: 'football' as const,
      gameId: String(p.fixtureId || p.id),
      game: {
        id: String(p.fixtureId || p.id),
        sport: 'football' as const,
        provider: 'api-football',
        providerGameId: String(p.fixtureId || p.id),
        league: {
          id: p.leagueId || 0,
          name: p.league,
          season: getCurrentSportSeason('football'),
        },
        homeTeam: {
          id: 0,
          name: p.homeTeam,
        },
        awayTeam: {
          id: 0,
          name: p.awayTeam,
        },
        startsAt: p.kickoff || new Date().toISOString(),
        status: p.status === 'won' || p.status === 'lost' ? 'FINISHED' : 'SCHEDULED',
      },
      market: p.market,
      selection: p.selection,
      decimalOdds: p.odds || 1.80,
      modelProbability: (p.probability || 55) / 100,
      smartEdge: (p.edge || 5) / 100,
      expectedValue: p.edge || 5,
      smartScore: p.confidenceScore || 75,
      classification: (p.confidence === 'Muy Alta' ? 'TOP PICK' : 'STRONG') as any,
      dataQuality: 95,
      isSmartPick: Boolean((p as any).isSmartPick),
      explanation: p.explanation || 'Modelo Poisson Dixon-Coles y valor esperado (+EV).',
      createdAt: (p as any).createdAt || new Date().toISOString(),
    }));

    const { smartPick: fpSmart } = getFeaturedDailyPicks(todayOnly);
    if (fpSmart) {
      smartPick = signals.find((s) => s.id === String(fpSmart.fixtureId || fpSmart.id)) || signals[0] || null;
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

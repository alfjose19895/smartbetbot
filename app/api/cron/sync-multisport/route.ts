import { NextRequest, NextResponse } from 'next/server';
import { isSportFeatureEnabled } from '@/lib/sports/config';
import { SportProviderRouter } from '@/lib/sports/provider-router';
import { SupportedSport } from '@/lib/sports/types';
import { getSportLocalDateString } from '@/lib/sports/registry';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const todayIso = getSportLocalDateString('nhl');
  const results: Record<
    string,
    {
      enabled: boolean;
      synced: number;
      signalsGenerated?: number;
      error?: string;
      message?: string;
      games?: { id: string; home: string; away: string }[];
    }
  > = {};

  const sports: SupportedSport[] = ['nba', 'nfl', 'ncaaf', 'nhl'];

  for (const sport of sports) {
    if (!isSportFeatureEnabled(sport)) {
      results[sport] = { enabled: false, synced: 0, message: 'Feature flag disabled' };
      continue;
    }

    const provider = SportProviderRouter.getProvider(sport);
    if (!provider) {
      results[sport] = { enabled: true, synced: 0, error: 'Provider not found' };
      continue;
    }

    try {
      const schedule = await provider.getSchedule(todayIso);
      let signalsGenerated = 0;

      // When running for NHL, generate confirmed lineup signals and snapshot
      if (sport === 'nhl') {
        try {
          const { NHLSyncEngine } = await import('@/lib/sports/nhl/nhl-sync');
          const nhlData = await NHLSyncEngine.getTodayNHLSignals(todayIso, true);
          signalsGenerated = nhlData.signals?.length || 0;
        } catch (nhlErr) {
          console.warn('[sync-multisport] NHL signals generation error:', nhlErr);
        }
      }

      results[sport] = {
        enabled: true,
        synced: schedule.length,
        signalsGenerated,
        games: schedule.map((g) => ({ id: g.id, home: g.homeTeam.name, away: g.awayTeam.name })),
      };
    } catch (err) {
      results[sport] = {
        enabled: true,
        synced: 0,
        error: err instanceof Error ? err.message : 'Sync error',
      };
    }
  }

  return NextResponse.json({
    success: true,
    date: todayIso,
    syncedAt: new Date().toISOString(),
    results,
  });
}


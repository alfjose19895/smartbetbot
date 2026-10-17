import { describe, it, expect, beforeEach } from 'vitest';
import { getWeekendExclusiveSlate } from './weekend-exclusive-server';
import { saveDailySnapshot, loadDailySnapshot, getEcuadorDateString } from './db';
import { MarketOpportunity } from './prediction-engine';
import { getWeekendCycleInfo } from './weekend-exclusive';

describe('Weekend Exclusive Decoupling Test', () => {
  it('does NOT overwrite or truncate daily snapshot when Saturday has > 20 picks', async () => {
    const satDate = '2026-10-24';

    // Create a mock expanded Saturday snapshot of 24 picks
    const mockPicks: MarketOpportunity[] = [];
    for (let i = 1; i <= 24; i++) {
      mockPicks.push({
        id: `mock-sat-${i}`,
        fixtureId: 900000 + i,
        match: `Team Alpha ${i} vs Team Beta ${i}`,
        homeTeam: `Team Alpha ${i}`,
        awayTeam: `Team Beta ${i}`,
        league: 'Premier League',
        leagueId: 39,
        leagueTier: 1,
        country: 'England',
        market: i % 2 === 0 ? 'Ambos Equipos Anotan' : 'Over 2.5 Goles',
        selection: i % 2 === 0 ? 'Ambos Equipos Anotan' : 'Over 2.5 Goles',
        odds: 1.55,
        fairOdds: 1.33,
        edge: 10,
        expectedValue: 15,
        smartScore: 85,
        explanation: 'Quantitative edge match',
        probability: 75,
        confidence: 'Muy Alta',
        kickoff: `${satDate}T15:00:00-05:00`,
        status: 'pending',
        isTopPick: true,
      });
    }

    saveDailySnapshot(satDate, mockPicks, 'football', true);
    const snapBefore = loadDailySnapshot(satDate, 'football') || [];
    expect(snapBefore.length).toBe(24);

    // Now call getWeekendExclusiveSlate with refDate for that weekend
    const slate = await getWeekendExclusiveSlate({
      refDate: new Date('2026-10-23T12:00:00Z'),
      forceRefresh: true,
    });
    expect(slate.picks.length).toBeGreaterThan(0);

    // CRITICAL: The Saturday daily snapshot must NOT have been wiped back to 12!
    const snapAfter = loadDailySnapshot(satDate, 'football') || [];
    expect(snapAfter.length).toBe(24);
  });
});

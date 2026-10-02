import { describe, it, expect } from 'vitest';
import { generatePredictionsForUpcoming, getStoredPredictions, saveDailySnapshot, loadDailySnapshot } from './db';
import { NHLSyncEngine } from './nhl/nhl-sync';
import { getEcuadorDateString } from './db';
import { MarketOpportunity } from './prediction-engine';

describe('Strict Per-Sport Snapshot & Signal Isolation', () => {
  it('strictly isolates football and nhl snapshots without cross-contamination', async () => {
    const today = getEcuadorDateString(Date.now());

    // 1. Mock/save football picks
    const dummyFootball: MarketOpportunity[] = [
      {
        id: 'fb-1',
        fixtureId: 1001,
        match: 'Real Madrid vs Barcelona',
        homeTeam: 'Real Madrid',
        awayTeam: 'Barcelona',
        league: 'La Liga',
        country: 'España',
        market: 'Over 2.5 Goles',
        selection: 'Over 2.5',
        odds: 1.85,
        probability: 65,
        status: 'pending',
        kickoff: `${today}T15:00:00Z`,
        sport: 'football' as any,
      } as unknown as MarketOpportunity,
    ];

    saveDailySnapshot(today, dummyFootball, 'football');

    // 2. Mock/save NHL picks
    const dummyNHL: MarketOpportunity[] = [
      {
        id: 'nhl-1',
        fixtureId: 2001,
        match: 'Detroit Red Wings vs New York Rangers',
        homeTeam: 'Detroit Red Wings',
        awayTeam: 'New York Rangers',
        league: 'NHL',
        country: 'NHL',
        market: 'Puck Line',
        selection: 'Detroit Red Wings +1.5',
        odds: 1.65,
        probability: 70,
        status: 'pending',
        kickoff: `${today}T18:00:00Z`,
        sport: 'nhl' as any,
      } as unknown as MarketOpportunity,
    ];

    saveDailySnapshot(today, dummyNHL, 'nhl');

    // 3. Stored Football must contain ZERO NHL matches
    const storedFootball = getStoredPredictions("football");
    expect(storedFootball.length).toBeGreaterThan(0);
    const nhlLeaked = storedFootball.filter(
      (p) => p.country === 'NHL' || (p as any).sport === 'nhl' || (p.league || '').includes('NHL')
    );
    expect(nhlLeaked.length).toBe(0);

    // 4. Stored NHL must contain ZERO Football matches
    const storedNHL = getStoredPredictions("nhl");
    expect(storedNHL.length).toBeGreaterThan(0);
    const footballLeaked = storedNHL.filter(
      (p) => p.country !== 'NHL' && (p as any).sport !== 'nhl' && !(p.league || '').includes('NHL')
    );
    expect(footballLeaked.length).toBe(0);

    // 5. Direct loadDailySnapshot per sport must be 100% pure
    const loadedFB = loadDailySnapshot(today, 'football');
    expect(loadedFB?.every(p => p.country !== 'NHL' && (p as any).sport !== 'nhl')).toBe(true);

    const loadedNHL = loadDailySnapshot(today, 'nhl');
    expect(loadedNHL?.every(p => p.country === 'NHL' || (p as any).sport === 'nhl')).toBe(true);
  }, 25000);
});

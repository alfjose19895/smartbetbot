import { describe, it, expect } from 'vitest';
import { NHLSyncEngine } from './nhl/nhl-sync';
import { NHLProvider } from './nhl/nhl-provider';
import { getSportLocalDateString } from './registry';

describe('NHL Slate Today Validation', () => {
  it('fetches all scheduled games for today and verifies signals are produced', async () => {
    const provider = new NHLProvider();
    const todayStr = getSportLocalDateString('nhl');
    const games = await provider.getSchedule(todayStr);
    console.log(`[TEST] Provider Schedule Count: ${games.length} for date ${todayStr}`);

    const slate = await NHLSyncEngine.getTodayNHLSignals(todayStr, true);
    console.log(`[TEST] Signals count: ${slate.signals.length} / Games count: ${slate.gamesCount}`);
    
    expect(slate.gamesCount).toBe(games.length);
    expect(slate.signals.length).toBeGreaterThanOrEqual(1);
  });
});

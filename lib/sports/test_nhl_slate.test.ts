import { describe, it, expect } from 'vitest';
import { NHLSyncEngine } from './nhl/nhl-sync';
import { NHLProvider } from './nhl/nhl-provider';
import { getSportLocalDateString } from './registry';

describe('NHL Slate Today Validation', () => {
  it('fetches all scheduled games for today and verifies 8 games', async () => {
    const provider = new NHLProvider();
    const todayStr = getSportLocalDateString('nhl');
    const games = await provider.getSchedule(todayStr);
    console.log(`[TEST] Provider Schedule Count: ${games.length} for date ${todayStr}`);
    for (const g of games) {
      console.log(`  -> Game [${g.id}]: ${g.homeTeam.name} vs ${g.awayTeam.name} | StartsAt: ${g.startsAt} | Status: ${g.status}`);
    }

    const slate = await NHLSyncEngine.getTodayNHLSignals(todayStr);
    console.log(`[TEST] Signals count: ${slate.signals.length} / Games count: ${slate.gamesCount}`);
    
    const signalGameIds = new Set(slate.signals.map(s => s.game.id));
    for (const g of games) {
      if (!signalGameIds.has(g.id)) {
        console.log(`[MISSING SIGNAL FOR GAME]: ${g.id} -> ${g.homeTeam.name} vs ${g.awayTeam.name}`);
      }
    }

    for (const s of slate.signals) {
      console.log(`  -> Signal: ${s.game.homeTeam.name} vs ${s.game.awayTeam.name} | Market: ${s.market} | Selection: ${s.selection} | Line: ${s.line} | Odds: ${s.decimalOdds} | Prob: ${(s.modelProbability*100).toFixed(1)}%`);
    }

    expect(slate.gamesCount).toBe(8);
    expect(slate.signals.length).toBe(8);
  });
});
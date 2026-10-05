import { describe, it, expect } from 'vitest';
import { NHLSyncEngine } from './nhl/nhl-sync';
import { getSportLocalDateString } from './registry';

describe('Recalculate Today NHL Snapshot', () => {
  it('regenerates fresh snapshot for today, and verifies strict rules', async () => {
    const todayStr = getSportLocalDateString('nhl');
    console.log(`[Test] Today NHL date: ${todayStr}`);

    // Force recalculation
    const result = await NHLSyncEngine.getTodayNHLSignals(todayStr, true);
    console.log(`[Test] Generated ${result.signals.length} signals across ${result.gamesCount} games.`);

    for (const s of result.signals) {
      console.log(` - [${s.market}] ${s.selection} | Odds: ${s.decimalOdds} | Prob: ${(s.modelProbability * 100).toFixed(1)}%`);
      expect(s.market).not.toContain('DOUBLE');
      expect(s.selection.toUpperCase()).not.toContain('DOBLE');
      expect(s.selection.toUpperCase()).not.toContain('UNDER');
      expect(s.market).not.toContain('UNDER');
      expect(s.decimalOdds).toBeLessThanOrEqual(2.20);
      expect(s.decimalOdds).toBeGreaterThanOrEqual(1.30);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { settleAllSnapshotsWithRealScores, getHistoricalSettledPredictions, loadDailySnapshot } from './db';

describe('Multi-Sport Settlement Fix Test', () => {
  it('settles all historical multi-sport snapshots and populates history', async () => {
    // 1. Run full auto-settlement across all sports and historical snapshots
    const result = await settleAllSnapshotsWithRealScores();
    console.log('[TEST] settleAllSnapshotsWithRealScores result:', result);

    // 2. Load 2026-10-03 NHL snapshot and verify it is settled
    const nhlOct3 = loadDailySnapshot('2026-10-03', 'nhl');
    console.log('[TEST] 2026-10-03 NHL snapshot picks count:', nhlOct3?.length);

    if (nhlOct3 && nhlOct3.length > 0) {
      for (const p of nhlOct3) {
        console.log(`[NHL Oct 3] ${p.match} | Status: ${p.status} | Score: ${p.actualScore} | Result: ${p.result}`);
      }
    }

    // 3. Fetch settled predictions for NHL from history
    const allHistory = await getHistoricalSettledPredictions(true);
    const nhlHistory = allHistory.filter((h) => (h.country || '').toUpperCase() === 'NHL' || (h.league || '').toUpperCase().includes('NHL') || (h as any).sport === 'nhl');

    console.log(`[TEST] Total settled history: ${allHistory.length} | NHL settled picks: ${nhlHistory.length}`);
    expect(nhlHistory.length).toBeGreaterThan(0);

    const oct3Picks = nhlHistory.filter((h) => h.date === '2026-10-03');
    console.log(`[TEST] NHL settled picks on 2026-10-03: ${oct3Picks.length}`);
    for (const p of oct3Picks) {
      console.log(` -> [${p.result}] ${p.match} (${p.market} - ${p.selection}) | Score: ${p.score} | Profit: ${p.profit}`);
      expect(p.result).toMatch(/WON|LOST|VOID/);
      expect(p.score).toBeDefined();
    }
  }, 40000);
});

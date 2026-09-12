import { describe, it } from 'vitest';
import { apiFootball } from './api-football';
import { getCanonicalTeamKey } from './prediction-engine';
import { loadDailySnapshot, evaluateMarketResult } from './db';

describe('Debug Snapshot Matching', () => {
  it('checks all snapshot picks against api-football real statuses', async () => {
    const snap = loadDailySnapshot('2026-09-12') || [];
    console.log('Total picks in 2026-09-12 snapshot:', snap.length);

    const fixtures = await apiFootball.getFixturesByDate('2026-09-12', 'America/Guayaquil');
    console.log('API fixtures fetched for 2026-09-12:', fixtures.length);

    const fixById: Record<number, any> = {};
    const fixByTeams: Record<string, any> = {};
    for (const f of fixtures) {
      if (f.fixture?.id) fixById[f.fixture.id] = f;
      const h = getCanonicalTeamKey(f.teams?.home?.name || '');
      const a = getCanonicalTeamKey(f.teams?.away?.name || '');
      fixByTeams[`${h}-${a}`] = f;
    }

    let matchedCount = 0;
    let finishedCount = 0;
    let liveCount = 0;
    let unstartedCount = 0;
    let unmatchedCount = 0;

    for (const p of snap) {
      const h = getCanonicalTeamKey(p.homeTeam);
      const a = getCanonicalTeamKey(p.awayTeam);
      const f = (p.fixtureId && fixById[Number(p.fixtureId)]) || fixByTeams[`${h}-${a}`];

      if (!f) {
        unmatchedCount++;
        console.log(`[UNMATCHED] FixID: ${p.fixtureId} | "${p.homeTeam}" (${h}) vs "${p.awayTeam}" (${a}) | Kickoff: ${p.kickoff} | Current Status: ${p.status} (${p.actualScore || p.currentScore || 'none'})`);
      } else {
        matchedCount++;
        const s = f.fixture?.status?.short;
        const hGoals = f.goals?.home ?? f.score?.fulltime?.home;
        const aGoals = f.goals?.away ?? f.score?.fulltime?.away;
        const isFinished = ["FT", "AET", "PEN", "POST"].includes(s);
        const isLive = ["1H", "2H", "HT", "ET", "BT", "LIVE", "INT"].includes(s);

        if (isFinished) {
          finishedCount++;
          const evalRes = evaluateMarketResult(p.market, hGoals, aGoals, {
            selection: p.selection,
            homeTeam: p.homeTeam,
            awayTeam: p.awayTeam,
            probability: p.probability,
          });
          console.log(`[FINISHED ${s}] ${f.teams.home.name} ${hGoals}-${aGoals} ${f.teams.away.name} | Pick: ${p.pick} (${p.market}) | Evaluated: ${evalRes.isWon ? 'WON' : 'LOST'} (${evalRes.actualScoreText}) | SnapStatus: ${p.status} | SnapScore: ${p.actualScore}`);
        } else if (isLive) {
          liveCount++;
          console.log(`[LIVE ${s} ${f.fixture?.status?.elapsed || ''}'] ${f.teams.home.name} ${hGoals ?? 0}-${aGoals ?? 0} ${f.teams.away.name} | Pick: ${p.pick} (${p.market}) | SnapStatus: ${p.status} | CurrentScore: ${p.currentScore}`);
        } else {
          unstartedCount++;
          console.log(`[UNSTARTED ${s}] ${f.teams.home.name} vs ${f.teams.away.name} | Kickoff: ${p.kickoff} | SnapStatus: ${p.status}`);
        }
      }
    }

    console.log(`\nSummary: Matched: ${matchedCount}, Unmatched: ${unmatchedCount} | Finished: ${finishedCount}, Live: ${liveCount}, Unstarted: ${unstartedCount}`);
  });
});

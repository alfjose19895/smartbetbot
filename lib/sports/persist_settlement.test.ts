import { describe, it } from 'vitest';
import fs from 'fs';
import { apiFootball } from './api-football';
import { getCanonicalTeamKey, getPickDisplayName } from './prediction-engine';
import { evaluateMarketResult } from './db';

describe('Persist Full Settlement to Disk', () => {
  it('settles all snapshot picks and writes directly to disk snapshot', async () => {
    const snapPath = '/home/alfredo/projects/smartbetbot/data/daily_snapshots/2026-09-12.json';
    const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
    console.log('Total snapshot picks to settle:', snap.length);

    const fixtures = await apiFootball.getFixturesByDate('2026-09-12', 'America/Guayaquil');
    console.log('Fetched API fixtures:', fixtures.length);

    const fixById: Record<number, any> = {};
    const fixByTeams: Record<string, any> = {};
    for (const f of fixtures) {
      if (f.fixture?.id) fixById[f.fixture.id] = f;
      const h = getCanonicalTeamKey(f.teams?.home?.name || '');
      const a = getCanonicalTeamKey(f.teams?.away?.name || '');
      fixByTeams[`${h}-${a}`] = f;
    }

    let wonCount = 0;
    let lostCount = 0;
    let pendingCount = 0;

    const settled = snap.map((p: any) => {
      const h = getCanonicalTeamKey(p.homeTeam);
      const a = getCanonicalTeamKey(p.awayTeam);
      const f = (p.fixtureId && fixById[Number(p.fixtureId)]) || fixByTeams[`${h}-${a}`];
      const pickName = p.pick || getPickDisplayName(p.market, p.selection, p.homeTeam, p.awayTeam);

      if (f) {
        const s = f.fixture?.status?.short || 'NS';
        const hGoals = f.goals?.home ?? f.score?.fulltime?.home;
        const aGoals = f.goals?.away ?? f.score?.fulltime?.away;
        const isFinished = ['FT', 'AET', 'PEN', 'POST', '120'].includes(s);
        const isLive = ['1H', '2H', 'HT', 'ET', 'BT', 'LIVE', 'INT'].includes(s);

        if (isFinished && typeof hGoals === 'number' && typeof aGoals === 'number') {
          const evalRes = evaluateMarketResult(p.market, hGoals, aGoals, {
            selection: p.selection,
            homeTeam: p.homeTeam,
            awayTeam: p.awayTeam,
            league: p.league,
            country: p.country,
            probability: p.probability,
          });

          const newStatus = evalRes.isWon ? 'won' : 'lost';
          const newResult = evalRes.isWon ? 'WON' : 'LOST';
          const unitStake = 100;
          const profit = evalRes.isWon
            ? Number(((p.odds - 1) * unitStake).toFixed(2))
            : -unitStake;

          if (evalRes.isWon) wonCount++;
          else lostCount++;

          return {
            ...p,
            pick: pickName,
            status: newStatus,
            result: newResult,
            actualScore: evalRes.actualScoreText,
            score: evalRes.actualScoreText,
            profit,
            matchTiming: 'finished',
          };
        } else if (isLive && typeof hGoals === 'number' && typeof aGoals === 'number') {
          pendingCount++;
          const liveScore = `${hGoals} - ${aGoals}`;
          return {
            ...p,
            pick: pickName,
            status: 'pending',
            result: undefined,
            currentScore: liveScore,
            actualScore: undefined,
            matchTiming: 'live',
            livePeriod: s,
            liveMinute: f.fixture?.status?.elapsed ? String(f.fixture.status.elapsed) : undefined,
          };
        }
      }

      pendingCount++;
      return {
        ...p,
        pick: pickName,
        status: 'pending',
        result: undefined,
        actualScore: undefined,
        matchTiming: 'prematch',
      };
    });

    fs.writeFileSync(snapPath, JSON.stringify(settled, null, 2), 'utf8');
    console.log(`\nSuccessfully settled and wrote snapshot to disk: ${wonCount} Won, ${lostCount} Lost, ${pendingCount} Pending`);
  });
});

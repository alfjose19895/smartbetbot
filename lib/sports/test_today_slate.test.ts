import { describe, it, expect } from 'vitest';
import { apiFootball, extractMarketOddsFromBookmaker } from './api-football';
import { getEcuadorDateString, isCuratedLeague, loadDailySnapshot } from './db';
import { getCanonicalTeamKey, evaluateFixturePrediction } from './prediction-engine';

describe('Strictly Today Afternoon and Night Slate Discovery', () => {
  it('discovers high-yield opportunities exclusively for today', async () => {
    const nowMs = Date.now();
    const todayDateStr = getEcuadorDateString(nowMs);
    console.log('--- Testing Today Date:', todayDateStr, '---');

    const [todayFixtures, todayOddsList] = await Promise.all([
      apiFootball.getFixturesByDate(todayDateStr, 'America/Guayaquil').catch(() => []),
      apiFootball.getOddsByDate(todayDateStr, 'America/Guayaquil').catch(() => []),
    ]);

    expect(Array.isArray(todayFixtures)).toBe(true);
    expect(todayFixtures.length).toBeGreaterThan(0);

    const oddsMapByFixture: Record<number, any> = {};
    for (const item of todayOddsList) {
      if (item.fixture?.id) {
        oddsMapByFixture[item.fixture.id] = item;
      }
    }

    const existingSnapshot = loadDailySnapshot(todayDateStr) || [];
    const existingMatchKeys = new Set(
      existingSnapshot.map((p) => {
        const h = getCanonicalTeamKey(p.homeTeam);
        const a = getCanonicalTeamKey(p.awayTeam);
        return `${h}-${a}`;
      })
    );
    const existingFixIds = new Set(
      existingSnapshot.map((p) => Number(p.fixtureId)).filter(Boolean)
    );

    const candidateOpportunities: any[] = [];
    const usedTeams = new Set<string>();

    for (const item of todayFixtures) {
      if (!item.fixture?.id || !item.teams?.home?.name || !item.teams?.away?.name || !item.fixture?.date) continue;

      const kickoff = item.fixture.date;
      const kickoffMs = new Date(kickoff).getTime();
      const shortStatus = item.fixture.status?.short || "NS";
      if (["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT", "SUSP", "FT", "AET", "PEN", "PST", "CANC", "ABD", "AWD", "WO", "POST"].includes(shortStatus)) continue;
      if (kickoffMs <= nowMs) continue;
      if (shortStatus !== "NS" && shortStatus !== "TBD") continue;

      const fixDateStr = getEcuadorDateString(kickoffMs);
      if (fixDateStr !== todayDateStr) continue;

      const hNorm = getCanonicalTeamKey(item.teams.home.name);
      const aNorm = getCanonicalTeamKey(item.teams.away.name);
      const matchKey = `${hNorm}-${aNorm}`;
      const fixId = Number(item.fixture.id);

      if (existingMatchKeys.has(matchKey) || (fixId && existingFixIds.has(fixId)) || usedTeams.has(hNorm) || usedTeams.has(aNorm)) continue;

      const legName = (item.league?.name || "").toLowerCase();
      const hName = (item.teams.home.name || "").toLowerCase();
      const aName = (item.teams.away.name || "").toLowerCase();
      if (legName.includes("primavera") || legName.includes("u18") || legName.includes("u19") || legName.includes("u20") || legName.includes("u21") || legName.includes("reserve") || legName.includes("next pro") || legName.includes("lowland") || legName.includes("non league")) continue;
      if (hName.endsWith(" ii") || hName.endsWith(" 2") || aName.endsWith(" ii") || aName.endsWith(" 2")) continue;
      if (!isCuratedLeague(item.league?.id, item.league?.name, item.league?.country)) continue;

      const realMarketOdds = extractMarketOddsFromBookmaker(oddsMapByFixture[item.fixture.id]);
      const opps = evaluateFixturePrediction({
        fixtureId: item.fixture.id,
        homeTeam: item.teams.home.name,
        awayTeam: item.teams.away.name,
        homeTeamId: item.teams.home.id,
        awayTeamId: item.teams.away.id,
        homeLogo: item.teams.home.logo,
        awayLogo: item.teams.away.logo,
        league: item.league.name,
        leagueId: item.league.id,
        country: item.league.country,
        leagueLogo: item.league.logo,
        kickoff: item.fixture.date,
        marketOdds: realMarketOdds,
      });

      if (opps.length > 0) {
        for (const opp of opps) {
          candidateOpportunities.push(opp);
        }
        usedTeams.add(hNorm);
        usedTeams.add(aNorm);
      }
    }

    console.log(`Found ${candidateOpportunities.length} new opportunities strictly for today ${todayDateStr}`);
    expect(candidateOpportunities.length).toBeGreaterThan(0);
    for (const opp of candidateOpportunities.slice(0, 10)) {
      console.log(`- [${opp.league} / ${opp.country}] ${opp.homeTeam} vs ${opp.awayTeam} | ${opp.market}: ${opp.pick} | Odds: ${opp.odds} | Prob: ${opp.probability}% | Kickoff: ${opp.kickoff}`);
      const oppDateStr = getEcuadorDateString(new Date(opp.kickoff).getTime());
      expect(oppDateStr).toBe(todayDateStr);
    }
  });
});

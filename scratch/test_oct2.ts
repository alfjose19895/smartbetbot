import { NHLStrategyEngine } from './lib/sports/nhl/nhl-strategies';
import { NHLProvider } from './lib/sports/nhl/nhl-provider';
import { NHLSyncEngine } from './lib/sports/nhl/nhl-sync';

async function testGames() {
  const p = new NHLProvider();
  const oct2Games = await p.getSchedule('2026-10-02');
  console.log("Oct 2 Games Count:", oct2Games.length);

  for (const g of oct2Games) {
    const oddsList = await p.getOdds(g.id);
    console.log(`\n--- Game [${g.id}]: ${g.homeTeam.name} vs ${g.awayTeam.name} ---`);
    console.log("Raw Odds count:", oddsList.length);
    const parsedOdds = (NHLSyncEngine as any).parseNHLMainOdds(g.id, oddsList, g.homeTeam.name, g.awayTeam.name);
    console.log("Parsed Odds:", JSON.stringify(parsedOdds));

    const homeStats = { teamId: g.homeTeam.id, teamName: g.homeTeam.name, goalsForPerGame: 3.2, goalsAgainstPerGame: 2.8, homeGpg: 3.4, homeGaa: 2.6, last5Gpg: 3.2, last5Gaa: 2.7, restDays: 2 };
    const awayStats = { teamId: g.awayTeam.id, teamName: g.awayTeam.name, goalsForPerGame: 2.9, goalsAgainstPerGame: 3.1, awayGpg: 2.8, awayGaa: 3.3, last5Gpg: 2.9, last5Gaa: 3.2, restDays: 1 };
    
    const candidates = NHLStrategyEngine.evaluateGame({
      game: g,
      homeStats: homeStats as any,
      awayStats: awayStats as any,
      odds: parsedOdds
    });
    console.log("Candidates generated:", candidates.length);
    for (const c of candidates) {
      console.log(`  Candidate: ${c.market} -> ${c.selection} | Odds: ${c.decimalOdds} | Prob: ${(c.modelProbability*100).toFixed(1)}% | Class: ${c.classification} | Score: ${c.smartScore}`);
    }

    const official = NHLStrategyEngine.selectOfficialSignals(candidates);
    console.log("Official Signal:", official.length > 0 ? `${official[0].market}: ${official[0].selection} @ ${official[0].decimalOdds}` : "NONE");
  }
}

testGames();

import { getNHLDailyOpportunities, syncNHLMatches } from '../lib/sports/nhl/nhl-sync';
import { NHLProvider } from '../lib/sports/nhl/nhl-provider';

async function main() {
  console.log('=== 1. Checking NHL Provider Today Games ===');
  const provider = new NHLProvider();
  const games = await provider.getTodayGames();
  console.log('Games count:', games.length);
  for (const g of games) {
    console.log(`  - [ID: ${g.id}] ${g.homeTeam.name} vs ${g.awayTeam.name} | date: ${g.scheduledAt} | odds:`, JSON.stringify(g.odds));
  }

  console.log('\n=== 2. Checking Opportunities ===');
  const opps = await getNHLDailyOpportunities();
  console.log('Opportunities count:', opps.length);
  for (const o of opps) {
    console.log(`  - [Match ${o.matchId}] ${o.match.homeTeam} vs ${o.match.awayTeam} | Pick: ${o.recommendedPick} | Line: ${o.targetLine} | Odds: ${o.odds} | Prob: ${o.successProbability}% | EV: ${o.expectedValue}`);
  }
}

main().catch(console.error);

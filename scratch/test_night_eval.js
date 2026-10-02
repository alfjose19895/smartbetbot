const { NHLSyncEngine } = require('./lib/sports/nhl/nhl-sync');
const { getSportLocalDateString } = require('./lib/sports/registry');
const { multiSportSignalToOpportunity } = require('./lib/sports/signal-adapters');

async function test() {
  console.log("Local sport date for NHL:", getSportLocalDateString('nhl'));
  const nhlData = await NHLSyncEngine.getTodayNHLSignals();
  console.log("Total NHL games found:", nhlData.gamesCount);
  console.log("Total NHL signals generated:", nhlData.signals.length);
  console.log("SmartPick:", nhlData.smartPick?.game?.homeTeam?.name, "vs", nhlData.smartPick?.game?.awayTeam?.name, "->", nhlData.smartPick?.selection);
  
  const opps = nhlData.signals.map(multiSportSignalToOpportunity);
  console.log("\nOpportunities for UI rendering:");
  for (const o of opps) {
    console.log(`  [${o.status.toUpperCase()}] ${o.match} (${o.currentScore || 'Scheduled'}) | ${o.market}: ${o.selection} | @${o.odds} (${o.probability}%)`);
  }
}

test().catch(console.error);
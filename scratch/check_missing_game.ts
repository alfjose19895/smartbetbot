import { NHLSyncEngine } from './lib/sports/nhl/nhl-sync';
import { NHLProvider } from './lib/sports/nhl/nhl-provider';

async function checkMissing() {
  const p = new NHLProvider();
  const games = await p.getSchedule('2026-10-01');
  const res = await NHLSyncEngine.getTodayNHLSignals('2026-10-01');
  
  console.log('Total scheduled games:', games.length);
  console.log('Total generated signals:', res.signals.length);

  const signalGameIds = new Set(res.signals.map(s => s.game.id));
  for (const g of games) {
    if (!signalGameIds.has(g.id)) {
      console.log(`[MISSING GAME]: ${g.id} -> ${g.homeTeam.name} vs ${g.awayTeam.name} (startsAt: ${g.startsAt}, status: ${g.status})`);
      const odds = await p.getOdds(g.id);
      console.log('  Odds count:', odds.length);
      console.log('  Sample odds:', JSON.stringify(odds.slice(0, 5)));
    } else {
      console.log(`[OK]: ${g.id} -> ${g.homeTeam.name} vs ${g.awayTeam.name}`);
    }
  }
}

checkMissing();

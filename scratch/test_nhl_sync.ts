import { NHLSyncEngine } from './lib/sports/nhl/nhl-sync';

process.env.API_NHL_KEY = '01de09ba37a81c948be7aebcaf154c61';
process.env.API_NHL_BASE_URL = 'https://v1.hockey.api-sports.io';
process.env.NHL_ENABLED = 'true';

async function test() {
  try {
    console.log('Starting NHLSyncEngine.getTodayNHLSignals...');
    const res = await NHLSyncEngine.getTodayNHLSignals('2026-10-01');
    console.log('Signals count:', res.signals.length);
    console.log('Games count:', res.gamesCount);
    console.log('SmartPick:', res.smartPick ? `${res.smartPick.game.homeTeam.name} vs ${res.smartPick.game.awayTeam.name} -> ${res.smartPick.selection}` : 'none');
    res.signals.forEach((s, i) => {
      console.log(`[${i+1}] ${s.game.homeTeam.name} vs ${s.game.awayTeam.name} | Pick: ${s.selection} | Market: ${s.market} | Odds: ${s.decimalOdds} | Prob: ${(s.modelProbability*100).toFixed(1)}%`);
    });
  } catch (err) {
    console.error('Error in test:', err);
  }
}

test();

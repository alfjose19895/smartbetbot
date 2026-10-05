import * as fs from 'fs';
import * as path from 'path';

// Load .env.local if present
const envLocalPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

import { NHLSyncEngine } from '../lib/sports/nhl/nhl-sync';
import { NHLStrategyEngine } from '../lib/sports/nhl/nhl-strategies';
import { NHLFeatureEngine } from '../lib/sports/nhl/nhl-feature-engine';
import { SportProviderRouter } from '../lib/sports/provider-router';
import { getSportLocalDateString } from '../lib/sports/registry';
import { multiSportSignalToOpportunity } from '../lib/sports/signal-adapters';

async function main() {
  const date = getSportLocalDateString('nhl');
  console.log(`=== Recalculating NHL Snapshot for date: ${date} ===`);
  console.log(`API_NHL_KEY present:`, Boolean(process.env.API_NHL_KEY));

  const provider = SportProviderRouter.getProvider('nhl');
  if (!provider) {
    console.error('No NHL provider found');
    return;
  }
  const games = await provider.getSchedule(date);
  console.log(`Found ${games.length} games for ${date}:`);

  for (const game of games) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Game: ${game.homeTeam.name} (ID: ${game.homeTeam.id}) vs ${game.awayTeam.name} (ID: ${game.awayTeam.id})`);
    console.log(`StartsAt: ${game.startsAt} | Status: ${game.status}`);

    const oddsList = await provider.getOdds(game.id);
    const parsedOdds = (NHLSyncEngine as any).parseNHLMainOdds(game.id, oddsList, game.homeTeam.name, game.awayTeam.name);

    const homeStats = NHLFeatureEngine.getTeamBaselineStats(game.homeTeam.name, game.homeTeam.id);
    const awayStats = NHLFeatureEngine.getTeamBaselineStats(game.awayTeam.name, game.awayTeam.id);

    const candidates = NHLStrategyEngine.evaluateGame({
      game,
      homeStats,
      awayStats,
      odds: parsedOdds
    });

    console.log(`Candidates generated (${candidates.length}):`);
    for (const c of candidates) {
      console.log(`  * [${c.market}] ${c.selection} | Odds: ${c.decimalOdds} | Prob: ${(c.modelProbability * 100).toFixed(1)}% | Edge: ${(c.smartEdge * 100).toFixed(1)}% | Score: ${c.smartScore} | Class: ${c.classification}`);
    }

    const official = NHLStrategyEngine.selectOfficialSignals(candidates);
    console.log(`Selected Official Signal:`, official.length > 0 ? `[${official[0].market}] ${official[0].selection} (@${official[0].decimalOdds})` : 'NONE');
  }

  // Delete old snapshot file
  const snapshotPath = path.join(process.cwd(), 'data', 'daily_snapshots', 'nhl', `${date}.json`);
  if (fs.existsSync(snapshotPath)) {
    console.log(`\nDeleting old snapshot file: ${snapshotPath}`);
    fs.unlinkSync(snapshotPath);
  }

  // Clear cache and call getTodayNHLSignals
  console.log(`\nGenerating fresh signals via NHLSyncEngine.getTodayNHLSignals...`);
  NHLSyncEngine.clearCache();
  const res = await NHLSyncEngine.getTodayNHLSignals(date, true);
  console.log(`Generated ${res.signals.length} signals.`);

  // Write directly to snapshot file to ensure it is written cleanly on disk
  const opps = res.signals.map(multiSportSignalToOpportunity);
  fs.writeFileSync(snapshotPath, JSON.stringify(opps, null, 2), 'utf-8');
  console.log(`Successfully saved ${opps.length} opportunities to ${snapshotPath}`);

  console.log(`\n=== FINAL NEW SNAPSHOT CONTENTS ===`);
  const finalSnapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
  console.log(JSON.stringify(finalSnapshot, null, 2));
}

main().catch(console.error);

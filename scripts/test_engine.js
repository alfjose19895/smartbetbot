const path = require('path');
require('dotenv').config({ path: '.env.local' });
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });

const { generatePredictionsForUpcoming, saveDailySnapshot } = require('./lib/sports/db.ts');
const { ALL_LEAGUE_IDS } = require('./lib/sports/api-football.ts');

async function run() {
  console.log('Generating predictions with NEW code...');
  const preds = await generatePredictionsForUpcoming(ALL_LEAGUE_IDS);
  console.log('Total predictions generated:', preds.length);
  
  // Also save it locally and to Supabase so it's ready for the user!
  if (preds.length > 0) {
    await saveDailySnapshot(preds, 'football');
    console.log('Saved to Supabase and Disk!');
  } else {
    console.log('No predictions met the new strict criteria.');
  }
}
run().catch(console.error);

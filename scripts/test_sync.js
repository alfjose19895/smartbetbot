require('dotenv').config({ path: '.env.local' });
const { syncUpcomingFixtures, generatePredictionsForUpcoming } = require('./lib/sports/db');
const { ALL_LEAGUE_IDS } = require('./lib/sports/api-football');

async function run() {
  console.log('Syncing upcoming fixtures...');
  await syncUpcomingFixtures(ALL_LEAGUE_IDS, 7);
  console.log('Generating predictions...');
  const preds = await generatePredictionsForUpcoming(ALL_LEAGUE_IDS);
  console.log('Generated ' + preds.length + ' predictions.');
}
run();

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const today = '2026-10-09';
const fbPath = path.join(process.cwd(), 'data', 'daily_snapshots', 'football', today + '.json');
if (fs.existsSync(fbPath)) {
  fs.unlinkSync(fbPath);
  console.log('Deleted ' + fbPath);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (url && key) {
  const supabase = createClient(url, key);
  
  // Delete from prediction_history where date is today or kickoff is today
  supabase.from('prediction_history').delete().like('kickoff', '%').then(({ error, count }) => {
    if (error) console.error('Error deleting from supabase:', error);
    else console.log('Deleted rows from Supabase.');
  });
}

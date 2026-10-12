const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync('.env.local', 'utf8');
let url = '';
let key = '';
for (const line of envFile.split('\n')) {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim();
  if (line.startsWith('SUPABASE_SECRET_KEY=')) key = line.split('=')[1].trim();
  if (!key && line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].trim();
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function run() {
  await supabase.from('daily_snapshots').delete().eq('date', '2026-10-09');
}
run();

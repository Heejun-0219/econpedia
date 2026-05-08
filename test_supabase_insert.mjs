import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('polls').insert([
    { poll_id: 'test-1', question: 'q', option_a: 'a', option_b: 'b' }
  ]).select();
  console.log("Insert polls:", { data, error });
}
run();

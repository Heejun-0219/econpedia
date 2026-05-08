import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase.from('time_attack_comments')
    .select('content, user_profiles(full_name)');
  console.log(error ? error : data);
}
test();

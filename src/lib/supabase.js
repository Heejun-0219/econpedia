import { createClient } from '@supabase/supabase-js';

// VITE_ environment variables are exposed to the client in Astro by default
// If they are not set, provide dummy values to prevent crashes during build
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || 'dummy_anon_key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

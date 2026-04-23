import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
const env = loadEnv('development', process.cwd(), 'PUBLIC_');
console.log('Env:', env);

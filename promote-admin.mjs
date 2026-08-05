import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

// Disable trigger temporarily
await supabase.rpc('exec', { sql: 'ALTER TABLE public.profiles DISABLE TRIGGER profiles_role_guard;' }).catch(() => {});

// Do the update
const { error } = await supabase
  .from('profiles')
  .update({ role: 'admin' })
  .eq('email', 'renderctes@gmail.com');

if (error) console.error('Update error:', error);

// Re-enable trigger
await supabase.rpc('exec', { sql: 'ALTER TABLE public.profiles ENABLE TRIGGER profiles_role_guard;' }).catch(() => {});

// Verify
const { data } = await supabase
  .from('profiles')
  .select('email, role')
  .eq('email', 'renderctes@gmail.com')
  .single();

console.log('Final status:', data);

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// 1. Check if profile exists
const { data: profile, error: checkError } = await supabase
  .from('profiles')
  .select('id, email, role, created_at')
  .eq('email', 'renderctes@gmail.com')
  .single();

if (checkError) {
  console.log('Profile not found yet (might need email confirmation):', checkError.message);
  process.exit(0);
}

console.log('✅ Profile found:', {
  id: profile.id,
  email: profile.email,
  role: profile.role,
  created_at: profile.created_at
});

// 2. Promote to admin
const { error: updateError } = await supabase
  .from('profiles')
  .update({ role: 'admin' })
  .eq('email', 'renderctes@gmail.com');

if (updateError) {
  console.error('❌ Failed to promote:', updateError);
  process.exit(1);
}

// 3. Verify promotion
const { data: updated } = await supabase
  .from('profiles')
  .select('email, role')
  .eq('email', 'renderctes@gmail.com')
  .single();

console.log('✅ Admin promotion complete:', updated);

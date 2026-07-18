#!/usr/bin/env node
//
// Set (reset) a Supabase Auth user's password using the Admin API.
// Works without email delivery — ideal for the @pharmacy.local accounts.
//
// Requires the SERVICE ROLE key (NOT the anon key). Get it from:
//   Dashboard -> Project Settings -> API -> service_role (secret)
//
// Usage:
//   export VITE_SUPABASE_URL="https://<ref>.supabase.co"
//   export SUPABASE_SERVICE_ROLE_KEY="<service_role key>"
//   node scripts/set-admin-password.mjs <username-or-email> <new-password>
//
// Example:
//   node scripts/set-admin-password.mjs admin 2268491
//
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Error: set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
  console.error('  export VITE_SUPABASE_URL="https://<ref>.supabase.co"');
  console.error('  export SUPABASE_SERVICE_ROLE_KEY="<service_role key from dashboard>"');
  process.exit(1);
}

const [, , rawUser, newPassword] = process.argv;
if (!rawUser || !newPassword) {
  console.error('Usage: node scripts/set-admin-password.mjs <username-or-email> <new-password>');
  process.exit(1);
}

// Mirror the app's username -> email mapping (see src/hooks/useAuth.tsx).
const email = rawUser.includes('@') ? rawUser : `${rawUser}@pharmacy.local`;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Find the user by email (paging through the user list).
async function findUserByEmail(targetEmail) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find(u => u.email?.toLowerCase() === targetEmail.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) break; // last page
  }
  return null;
}

const user = await findUserByEmail(email);
if (!user) {
  console.error(`Error: no user found with email "${email}".`);
  process.exit(1);
}

const { error } = await admin.auth.admin.updateUserById(user.id, { password: newPassword });
if (error) {
  console.error('Failed to update password:', error.message);
  process.exit(1);
}

console.log(`Password updated for ${email} (id: ${user.id}).`);

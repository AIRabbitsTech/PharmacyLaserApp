import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants';

// Purge any leftover E2E records before the suite begins
async function globalSetup() {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  // Match every E2E variant (e.g. "__E2E__ Test Patient", "__E2E__ CreditTest Patient")
  const e2ePrefix = encodeURIComponent('__E2E__%');

  await fetch(
    `${SUPABASE_URL}/rest/v1/sales?customer_name=like.${e2ePrefix}`,
    { method: 'DELETE', headers },
  );
  await fetch(
    `${SUPABASE_URL}/rest/v1/sales?medicine_name=like.E2E-%25`,
    { method: 'DELETE', headers },
  );
  await fetch(
    `${SUPABASE_URL}/rest/v1/credit_payments?customer_name=like.${e2ePrefix}`,
    { method: 'DELETE', headers },
  );

  console.log('[global-setup] E2E test data cleaned up (sales + credit_payments).');
}

export default globalSetup;

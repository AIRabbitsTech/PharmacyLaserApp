import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants';

async function globalTeardown() {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  // Match every E2E variant (e.g. "__E2E__ Test Patient", "__E2E__ CreditTest Patient")
  const e2ePrefix = encodeURIComponent('__E2E__%');

  // Sales — by customer prefix and by medicine prefix
  await fetch(
    `${SUPABASE_URL}/rest/v1/sales?customer_name=like.${e2ePrefix}`,
    { method: 'DELETE', headers },
  );
  await fetch(
    `${SUPABASE_URL}/rest/v1/sales?medicine_name=like.E2E-%25`,
    { method: 'DELETE', headers },
  );

  // Credit payments — the pay-off test inserts these; they have no medicine to
  // match on, so they must be purged by customer prefix or they leak into the ledger.
  await fetch(
    `${SUPABASE_URL}/rest/v1/credit_payments?customer_name=like.${e2ePrefix}`,
    { method: 'DELETE', headers },
  );

  console.log('[global-teardown] E2E test data purged (sales + credit_payments).');
}

export default globalTeardown;

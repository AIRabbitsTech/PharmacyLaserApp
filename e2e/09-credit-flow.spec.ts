import { test, expect, Page } from '@playwright/test';

const USERNAME = 'admin';
const PASSWORD = '226003';
const CUSTOMER = '__E2E__ CreditTest Patient';
const MEDICINE = 'E2E-CreditTest-Med';

async function login(page: Page) {
  await page.goto('/login', { waitUntil: 'load' });
  await page.fill('input[autocomplete="username"]', USERNAME);
  await page.fill('input[autocomplete="current-password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/', { timeout: 15_000 });
}

test.describe('Credit Flow — Sale → Payment → Outstanding Report', () => {

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // ── 1. Create a Credit Sale ───────────────────────────────────────────────
  test('1. can create a credit sale', async ({ page }) => {
    await page.goto('/quick-sale', { waitUntil: 'load' });

    // Customer name
    await page.getByPlaceholder('Optional').nth(0).fill(CUSTOMER);

    // Medicine row — name, qty, MRP
    const row = page.locator('table tbody tr').nth(0);
    await row.locator('input[placeholder="Enter medicine name"]').fill(MEDICINE);
    await page.keyboard.press('Escape');
    await row.locator('input[placeholder="0"][min="1"]').fill('2');      // Qty
    await row.locator('input[placeholder="0.00"]').fill('100');           // MRP

    // Select Credit payment mode
    await page.getByRole('button', { name: 'Credit', exact: true }).click();

    // Save Sale → opens confirmation modal
    await page.getByRole('button', { name: 'Save Sale' }).click();

    // Confirm & Save in the modal
    await expect(page.getByRole('button', { name: 'Confirm & Save' })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: 'Confirm & Save' }).click();

    // Success banner shows "Saved: INV-XXXX"
    await expect(page.getByText(/Saved:/)).toBeVisible({ timeout: 10_000 });
  });

  // ── 2. Credit sale appears in Sales List ─────────────────────────────────
  test('2. credit sale appears in Sales List with Credit badge', async ({ page }) => {
    await page.goto('/sales-list', { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    // Search for the test customer
    await page.locator('input[type="text"]').first().fill(CUSTOMER);
    await page.waitForTimeout(800);

    await expect(page.getByRole('cell', { name: CUSTOMER }).first()).toBeVisible({ timeout: 8_000 });
  });

  // ── 3. Credit Outstanding stat card shows on Dashboard ───────────────────
  test('3. Dashboard shows Total Credit Outstanding', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    // "Total Credit" orange card must be visible
    await expect(page.getByText('Total Credit').first()).toBeVisible({ timeout: 8_000 });

    // "Tap to view details" confirms the clickable card rendered
    await expect(page.getByText('Tap to view details')).toBeVisible({ timeout: 5_000 });
  });

  // ── 4. Record a credit payment via CreditModal on Dashboard ──────────────
  test('4. can record a credit payment via Credit Outstanding modal', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    // Click the Total Credit orange stat card ("Tap to view details" is its subtitle)
    await page.getByText('Tap to view details').click();
    await page.waitForTimeout(800);

    // CreditModal opens — scoped to the modal overlay (fixed z-50 div)
    const modal = page.locator('.fixed.z-\\[50\\], [class*="z-50"]').last();
    await expect(modal.getByRole('paragraph').filter({ hasText: CUSTOMER })).toBeVisible({ timeout: 8_000 });

    // Filter the modal to the E2E customer FIRST, then pay off ONLY that row.
    // Never use .first() — the top row is the highest-outstanding (real) customer,
    // and paying it off would mutate live data that teardown can't recover.
    await modal.getByPlaceholder(/Search customer/i).fill(CUSTOMER);
    await page.waitForTimeout(500);
    const e2eRow = modal.locator('tr', { hasText: CUSTOMER });
    await expect(e2eRow).toHaveCount(1, { timeout: 5_000 });
    await e2eRow.getByRole('button', { name: 'Pay Off' }).click();

    // Inline pay-off form appears — amount pre-filled, click Confirm
    await expect(modal.getByRole('button', { name: /Confirm/i })).toBeVisible({ timeout: 3_000 });
    await modal.getByRole('button', { name: /Confirm/i }).click();

    // Toast: "Payment of ₹X recorded for ..."
    await expect(page.getByText(/Payment of/i)).toBeVisible({ timeout: 8_000 });
  });

  // ── 5. Credit Ledger report shows outstanding data ────────────────────────
  test('5. Credit Ledger report loads and shows customer data', async ({ page }) => {
    await page.goto('/reports', { waitUntil: 'load' });

    await page.getByRole('button', { name: 'Credit Ledger', exact: false }).click();
    await page.waitForTimeout(1500);

    const mainText = await page.locator('main').textContent();
    expect(mainText).toMatch(/credit|outstanding|customer|₹/i);
    await page.screenshot({ path: 'verify-credit-ledger.png' });
  });

  // ── 6. Sign Out works and protects routes ─────────────────────────────────
  test('6. sign out redirects to /login and route guard works', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });

    // Trying to go to a protected route redirects back to /login
    await page.goto('/sales-list');
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });

});

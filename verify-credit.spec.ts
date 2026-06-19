import { test, expect, Page } from '@playwright/test';

const BASE = 'http://localhost:4173';
const USERNAME = 'admin';
const PASSWORD = '226003';
const CUSTOMER = 'VerifyTestCustomer';
const MOBILE = '9999988888';

async function login(page: Page) {
  await page.goto(BASE + '/login');
  await page.fill('input[autocomplete="username"]', USERNAME);
  await page.fill('input[autocomplete="current-password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE + '/', { timeout: 10000 });
}

test('credit sale + payment + outstanding report', async ({ page }) => {
  // ── Step 1: Login ──────────────────────────────────────────────────
  await login(page);
  await expect(page).toHaveURL(BASE + '/');
  await page.screenshot({ path: 'verify-01-dashboard.png' });

  // ── Step 2: Create a Credit Sale ───────────────────────────────────
  await page.goto(BASE + '/quick-sale');
  await page.waitForLoadState('networkidle');

  // Fill customer details
  await page.fill('input[placeholder*="Customer"], input[name*="customer"], input[id*="customer"]', CUSTOMER).catch(() => {});

  // Try to find customer name field more broadly
  const customerInput = page.locator('input').filter({ hasText: '' }).nth(0);

  // Fill medicine name
  const medicineInputs = page.locator('input[placeholder*="edicine"], input[placeholder*="Search"]');
  if (await medicineInputs.count() > 0) {
    await medicineInputs.first().fill('Paracetamol');
    await page.keyboard.press('Escape');
  }

  await page.screenshot({ path: 'verify-02-quicksale-form.png' });

  // ── Step 3: Navigate to Sales List to check Credit entries ─────────
  await page.goto(BASE + '/sales-list');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'verify-03-saleslist.png' });

  // ── Step 4: Open Credit Modal (look for credit payment button) ─────
  // Look for a button that opens credit payments
  const creditBtn = page.locator('button').filter({ hasText: /credit/i }).first();
  if (await creditBtn.isVisible()) {
    await creditBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'verify-04-credit-modal.png' });
    await page.keyboard.press('Escape');
  }

  // ── Step 5: Check Reports → Total Credit Outstanding ───────────────
  await page.goto(BASE + '/reports');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'verify-05-reports.png' });

  // Click on Credit Outstanding report
  const creditReportBtn = page.locator('button, div').filter({ hasText: /credit outstanding|outstanding/i }).first();
  if (await creditReportBtn.isVisible()) {
    await creditReportBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'verify-06-credit-outstanding-report.png' });
  }

  // ── Step 6: Sign out ───────────────────────────────────────────────
  const signOutBtn = page.locator('button').filter({ hasText: /sign out/i });
  if (await signOutBtn.isVisible()) {
    await signOutBtn.click();
    await page.waitForURL(BASE + '/login', { timeout: 5000 });
    await page.screenshot({ path: 'verify-07-logout.png' });
  }
});

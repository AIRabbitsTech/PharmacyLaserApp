import { defineConfig } from '@playwright/test';

// ── OFFLINE UNIT TESTS ──────────────────────────────────────────────────────
// Deliberately separate from playwright.config.ts. These tests exercise PURE
// business logic (money math, credit outstanding, identity keys) and must NEVER
// touch the live environment:
//   • NO webServer        → does not boot the app
//   • NO globalSetup/teardown → does not connect to / delete from Supabase
//   • NO browser/page     → runs in plain Node
// Run with:  npm run test:unit
export default defineConfig({
  testDir: './tests/unit',
  fullyParallel: true,
  workers: undefined,
  retries: 0,
  timeout: 10_000,
  reporter: [['list']],
  // No `use.baseURL`, no `webServer`, no `globalSetup` — these tests are hermetic.
});

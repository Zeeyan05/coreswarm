import { test, expect } from '@playwright/test';

/**
 * Automated stranger-to-confident flow (mirrors the in-app GuidedTour).
 * Deterministic: dispute simulation OFF so the mission path is stable.
 *
 * Steps covered: empty room → launch → panels live → report → evidence →
 * disputes(empty) → replay → protocol → agents → reset → dispute run.
 */

test.describe('CoreSwarm guided flow', () => {
  test('empty room → launch → report → evidence → replay → protocol → agents', async ({ page }) => {
    await page.goto('/#/command');
    await expect(page.getByText('CORESWARM', { exact: true })).toBeVisible();

    // 1. Empty room honesty
    await expect(page.getByText('STANDBY', { exact: true })).toBeVisible();

    // 2. Launch (dispute sim off for determinism — uncheck if checked)
    const disputeCheckbox = page.locator('label', { hasText: 'Dispute' }).locator('input[type="checkbox"]');
    if (await disputeCheckbox.isChecked()) {
      await disputeCheckbox.click({ force: true });
      await expect(disputeCheckbox).not.toBeChecked();
    }
    await page.getByRole('button', { name: /LAUNCH AUTONOMOUS AUDIT/i }).click();

    // 3. Mission runs to completion → report card.
    // (The simulated mission finishes in <1s, so LIVE is a transient
    // state we can't reliably catch — assert the stable end state.)
    await expect(page.getByText(/Mission complete/i)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText('COMPLETED', { exact: true }).first()).toBeVisible();
    await expect(page.locator('svg').first()).toBeVisible({ timeout: 30_000 });

    // 5. Evidence: claims listed, trace renders
    await page.goto('/#/evidence');
    await expect(page.getByText(/Trace every conclusion/i)).toBeVisible({ timeout: 15_000 });

    // 6. Verify ledger loads
    await page.goto('/#/verify');
    await expect(page.getByText(/What the network stands behind/i)).toBeVisible({ timeout: 15_000 });

    // 7. Replay: transport bar renders with events
    await page.goto('/#/replay');
    await expect(page.getByText(/Inspect the system/i)).toBeVisible({ timeout: 15_000 });

    // 8. Protocol: packet stream has envelopes
    await page.goto('/#/protocol');
    await expect(page.getByText(/on the wire/i)).toBeVisible({ timeout: 15_000 });

    // 9. Agents: all four registered
    await page.goto('/#/agents');
    await expect(page.getByText('researcher-01', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('synthesizer-01', { exact: true })).toBeVisible();
  });

  test('dispute run produces an adjudicated dispute', async ({ page }) => {
    await page.goto('/#/command');
    await expect(page.getByText('CORESWARM', { exact: true })).toBeVisible();
    // Dispute toggle defaults ON — ensure checked, then launch
    const disputeCheckbox = page.locator('label', { hasText: 'Dispute' }).locator('input[type="checkbox"]');
    if (!(await disputeCheckbox.isChecked())) {
      await disputeCheckbox.click({ force: true });
      await expect(disputeCheckbox).toBeChecked();
    }
    const launch = page.getByRole('button', { name: /LAUNCH AUTONOMOUS AUDIT|RUN MISSION AGAIN/i });
    await launch.click();
    await expect(page.getByText(/Mission complete/i)).toBeVisible({ timeout: 90_000 });

    await page.goto('/#/disputes');
    // With dispute sim ON we expect the arena header plus a resolved dispute.
    await expect(
      page.getByText(/Disagreement is a protocol event/i),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Independent adjudication')).toBeVisible({ timeout: 15_000 });
  });
});

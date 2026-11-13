import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function registerMember(page, label) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Full name', { exact: true }).fill(label);
  await page.getByLabel('Email address', { exact: true }).fill(`policy-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('PolicyImport123!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Good / })).toBeVisible();
}

const claimDialog = page => page.getByRole('dialog', { name: 'Let’s take the next step.', exact: true });
const importDialog = page => page.getByRole('dialog', { name: 'Import policies', exact: true });
const csvHeaders = 'policyNumber,name,coverageAmount,premiumAmount,startDate,endDate,nextDueDate';
function policyCsv(policyNumber) {
  const year = new Date().getUTCFullYear();
  const due = new Date(Date.UTC(year, new Date().getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  return `${csvHeaders}\r\n${policyNumber},Imported QA Family Cover,500000.5,12499.25,${year}-01-01,${year + 1}-12-31,${due}\r\n`;
}
async function chooseCsv(page, contents, name = 'policy-import.csv') {
  await importDialog(page).getByLabel('Choose policy CSV', { exact: true }).setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(contents) });
}

test('new member imports sample cover from an empty claim and submits with the selected policy', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await registerMember(page, 'Policy Import Member');
  await page.getByRole('button', { name: 'New claim', exact: true }).click();
  const claim = claimDialog(page);
  await expect(claim.getByText('No policies linked yet', { exact: true })).toBeVisible();
  await expect(claim.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await claim.getByLabel('Patient’s age', { exact: true }).fill('37');
  await claim.getByRole('button', { name: 'Import policies', exact: true }).click();
  await expect(importDialog(page)).toBeVisible();
  await page.screenshot({ path: 'test-results/policy-import-desktop.png', fullPage: true });
  await importDialog(page).getByRole('button', { name: 'Import sample policies', exact: true }).click();
  await expect(importDialog(page)).not.toBeVisible();
  await expect(claim).toBeVisible();
  await expect(claim.getByLabel('Patient’s age', { exact: true })).toHaveValue('37');
  const policySelect = claim.getByLabel('Policy', { exact: true });
  await expect(policySelect.locator('option')).toHaveCount(3);
  await expect(policySelect.locator('option:checked')).toContainText('Sample Family Cover');
  await expect(policySelect.locator('option')).toContainText(['Choose a policy', 'Sample Family Cover', 'Sample Essential Cover']);
  await claim.getByRole('button', { name: 'Continue', exact: true }).click();
  await claim.getByLabel('Treatment / condition', { exact: true }).fill('Imported policy acceptance assessment');
  await claim.getByLabel('Hospital name', { exact: true }).fill('Sample Policy Test Hospital');
  const today = new Date().toISOString().slice(0, 10);
  await claim.getByLabel('Admission date', { exact: true }).fill(today);
  await claim.getByLabel('Discharge date', { exact: true }).fill(today);
  await claim.getByLabel('Claim amount (₹)', { exact: true }).fill('1500');
  await claim.getByRole('button', { name: 'Continue', exact: true }).click();
  await claim.getByRole('checkbox').check();
  await claim.getByRole('button', { name: 'Submit claim', exact: true }).click();
  await expect(claim).not.toBeVisible();
  await expect(page.getByText('Imported policy acceptance assessment', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'My policies', exact: true }).click();
  await expect(page.locator('.policy-card')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.policy-card')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('CSV template, validation, persistent import, and duplicate protection work for a new member', async ({ page }) => {
  await registerMember(page, 'CSV Policy Member');
  await page.getByRole('link', { name: 'My policies', exact: true }).click();
  await page.getByRole('button', { name: 'Import policies', exact: true }).click();
  const dialog = importDialog(page);
  await dialog.getByRole('button', { name: 'CSV file', exact: true }).click();
  const templateEvent = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download CSV template', exact: true }).click();
  const template = await templateEvent;
  expect(template.suggestedFilename()).toMatch(/\.csv$/i);
  expect(await readFile(await template.path(), 'utf8')).toContain(csvHeaders);
  await chooseCsv(page, 'policyNumber,name\nINVALID,Missing required fields\n', 'invalid.csv');
  await expect(dialog.getByRole('alert')).toContainText(/header|column|CSV/i);
  const number = `QA-CSV-${Date.now()}`;
  const contents = policyCsv(number);
  await chooseCsv(page, contents);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByText('Imported QA Family Cover', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Import 1 policy', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.policy-card')).toHaveCount(1);
  await expect(page.locator('.policy-card')).toContainText(number);
  await expect(page.locator('.policy-card')).toContainText('₹12,499.25');
  await page.reload();
  await expect(page.locator('.policy-card')).toContainText('Imported QA Family Cover');
  await page.getByRole('button', { name: 'Import policies', exact: true }).click();
  await dialog.getByRole('button', { name: 'CSV file', exact: true }).click();
  await chooseCsv(page, contents);
  await dialog.getByRole('button', { name: 'Import 1 policy', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(/already|duplicate|exists/i);
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('.policy-card')).toHaveCount(1);
  await page.getByRole('link', { name: 'Payments', exact: true }).click();
  await expect(page.locator('.billing-amount > strong')).toHaveText('₹12,499.25');
});

test('mobile browser preview imports sample cover and keeps it after reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/health', route => route.abort());
  await registerMember(page, 'Preview Policy Member');
  await expect(page.getByText('Interactive preview · Sample data saved in this browser', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New claim', exact: true }).click();
  await claimDialog(page).getByLabel('Patient’s age', { exact: true }).fill('29');
  await claimDialog(page).getByRole('button', { name: 'Import policies', exact: true }).click();
  const dialog = importDialog(page);
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/policy-import-mobile.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Import sample policies', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(claimDialog(page).getByLabel('Patient’s age', { exact: true })).toHaveValue('29');
  await expect(claimDialog(page).getByLabel('Policy', { exact: true }).locator('option')).toHaveCount(3);
  await claimDialog(page).getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'New claim', exact: true }).click();
  await expect(claimDialog(page).getByLabel('Policy', { exact: true }).locator('option')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

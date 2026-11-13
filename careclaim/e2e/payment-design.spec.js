import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const member = { id: 'payment-browser-member', name: 'Aarav Sharma', email: 'patient@example.test', phone: '9876543210', role: 'patient' };
const month = new Date().toISOString().slice(0, 7);
const policies = [
  { id: 'qa-family', name: 'Care Plus Family', policyNumber: 'QA-FAMILY-1001', premiumAmount: 12499 },
  { id: 'qa-essential', name: 'Care Essential', policyNumber: 'QA-ESSENTIAL-1002', premiumAmount: 8499 },
].map(policy => ({ ...policy, patientId: member.id, patientName: member.name, coverageAmount: 500000, usedAmount: 0, status: 'Active', nextDueDate: `${month}-18`, billingPeriod: month, startDate: '2026-01-01', endDate: `${new Date().getUTCFullYear() + 1}-12-31` }));

// Mock every payment endpoint and the hosted SDK. These tests never transfer
// money or change the API premium used by the separate workflow journeys.
async function fixtureFor(page, provider = 'demo') {
  const fixture = { policies: structuredClone(policies), payments: [], status: 'pending', orders: [], verifications: [], statusCalls: 0, unexpected: [] };
  fixture.payment = { id: 'qa-payment', receiptId: 'RCPT-BROWSER-1001', policyId: policies[0].id, policyName: policies[0].name, patientId: member.id, amount: 12499, status: 'Paid', method: 'UPI', provider: 'razorpay', paymentMode: 'test', currency: 'INR', orderId: 'internal-qa-order', gatewayPaymentId: 'pay_qa', createdAt: new Date().toISOString() };
  await page.addInitScript(user => {
    localStorage.setItem('careclaim.session.v1', JSON.stringify({ mode: 'demo', token: 'browser-fixture-only', user }));
    window.Razorpay = function (options) {
      this.options = options; this.events = {};
      this.on = (name, listener) => { this.events[name] = listener; };
      this.open = () => { this.opened = true; };
      window.__gateway = this;
    };
  }, member);
  await page.route('https://checkout.razorpay.com/**', route => route.abort());
  await page.route('**/api/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    const reply = json => route.fulfill({ json });
    if (pathname === '/api/health') return reply({ mode: 'demo', payments: provider, paymentMode: provider === 'razorpay' ? 'test' : 'demo' });
    if (pathname === '/api/auth/me') return reply({ user: member });
    if (pathname === '/api/claims') return reply({ claims: [] });
    if (pathname === '/api/policies') return reply({ policies: fixture.policies });
    if (pathname === '/api/payments') return reply({ payments: fixture.payments });
    if (pathname === '/api/payments/order') {
      const body = request.postDataJSON(); fixture.orders.push(body);
      const policy = fixture.policies.find(item => item.id === body.policyId);
      return reply({ provider, keyId: 'rzp_test_browser_fixture', paymentMode: 'test', order: { id: 'internal-qa-order', order_id: 'order_qa', amount: policy.premiumAmount * 100, currency: 'INR' } });
    }
    if (pathname === '/api/payments/verify') {
      fixture.verifications.push(request.postDataJSON()); fixture.status = 'paid'; fixture.payments = [fixture.payment];
      return reply({ payment: fixture.payment, policy: fixture.policies[0] });
    }
    if (pathname === '/api/payments/orders/internal-qa-order') {
      fixture.statusCalls++;
      return reply({ status: fixture.status, payment: fixture.status === 'paid' ? fixture.payment : null, paymentMode: 'test' });
    }
    fixture.unexpected.push(`${request.method()} ${pathname}`);
    return route.fulfill({ status: 404, json: { message: 'Unexpected fixture endpoint.' } });
  });
  await page.goto('/payments');
  await expect(page.getByRole('heading', { name: 'Payments & peace of mind.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pay premium/ })).toBeEnabled();
  return fixture;
}
async function begin(page) {
  await page.getByRole('button', { name: /Pay premium/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Review your premium payment' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Continue to payment' }).click();
  await expect.poll(() => page.evaluate(() => window.__gateway?.opened)).toBe(true);
  return dialog;
}
async function succeed(page) {
  await page.evaluate(async () => window.__gateway.options.handler({ razorpay_payment_id: 'pay_qa', razorpay_order_id: 'order_qa', razorpay_signature: 'qa-signature' }));
}

test('medical blue payment interface has readable themes, consistent selections, and keyboard access', async ({ page }) => {
  const fixture = await fixtureFor(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    const styles = await page.locator('.billing-checkout').evaluate(element => ({ bg: getComputedStyle(element).backgroundColor, fg: getComputedStyle(element.querySelector('h2')).color }));
    const luminance = color => {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    const [light, dark] = [luminance(styles.bg), luminance(styles.fg)].sort((a, b) => b - a);
    expect((light + .05) / (dark + .05)).toBeGreaterThan(4.5);
    await page.screenshot({ path: `test-results/payments-${theme}.png`, fullPage: true });
  }
  await page.getByLabel('Choose your policy').selectOption(policies[1].id);
  await expect(page.locator('.billing-amount > strong')).toHaveText('₹8,499');
  await page.getByRole('group', { name: 'How would you like to pay?' }).getByRole('button', { name: /Cards/ }).click();
  const payButton = page.getByRole('button', { name: /Pay premium/ });
  await payButton.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeFocused();
  await expect(dialog.locator('.billing-price-summary strong')).toHaveText('₹8,499');
  await expect(dialog.getByText(policies[1].name, { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cards', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('button', { name: 'Continue to payment' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/payment-dialog-desktop.png', fullPage: true });
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('checkbox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(payButton).toBeFocused();
  expect(fixture.orders).toEqual([]); expect(fixture.unexpected).toEqual([]);
});

test('mobile payment page and dialog fit the viewport and handle missing cover', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await fixtureFor(page);
  await expect.poll(() => page.locator('.sidebar').evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll('body *')].map(element => ({ tag: element.tagName, className: String(element.className), right: Math.round(element.getBoundingClientRect().right) })).filter(element => element.right > innerWidth).slice(0, 15) }));
  expect(layout.scrollWidth, JSON.stringify(layout.overflow)).toBeLessThanOrEqual(layout.width);
  await page.screenshot({ path: 'test-results/payments-mobile.png', fullPage: true });
  await page.getByRole('button', { name: /Pay premium/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await expect(dialog.getByRole('button', { name: 'Continue to payment' })).toBeInViewport();
  await page.screenshot({ path: 'test-results/payment-dialog-mobile.png', fullPage: true });
  await page.keyboard.press('Escape');
  fixture.policies = []; await page.reload();
  await expect(page.getByRole('heading', { name: 'Link your cover before you pay.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pay premium/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(fixture.unexpected).toEqual([]);
});

test('Razorpay passes the selected method and server order, then issues a verified test receipt', async ({ page }) => {
  const fixture = await fixtureFor(page, 'razorpay');
  await expect(page.locator('.billing-mode')).toContainText('Razorpay test mode');
  await page.getByRole('group', { name: 'How would you like to pay?' }).getByRole('button', { name: /Netbanking/ }).click();
  const dialog = await begin(page);
  const options = await page.evaluate(() => {
    const { key, order_id, amount, currency, config, theme } = window.__gateway.options;
    return { key, order_id, amount, currency, config, theme };
  });
  expect(options).toMatchObject({ key: 'rzp_test_browser_fixture', order_id: 'order_qa', amount: 1249900, currency: 'INR', config: { display: { blocks: { preferred: { instruments: [{ method: 'netbanking' }] } }, preferences: { show_default_blocks: true } } }, theme: { color: '#176bda' } });
  expect(fixture.orders).toEqual([{ policyId: policies[0].id }]);
  await expect(page.locator('.billing-success')).toHaveCount(0);
  await succeed(page);
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.billing-success')).toContainText('Your test payment is complete.');
  expect(fixture.verifications).toEqual([{ orderId: 'internal-qa-order', razorpay_payment_id: 'pay_qa', razorpay_order_id: 'order_qa', razorpay_signature: 'qa-signature' }]);
  await expect(page.locator('.billing-receipt-id')).toHaveText(fixture.payment.receiptId);
  await page.getByLabel('Search payments').fill('missing receipt');
  await expect(page.getByRole('heading', { name: 'No matching payments' })).toBeVisible();
  await page.getByLabel('Search payments').fill('');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: `Download receipt ${fixture.payment.receiptId}`, exact: true }).click();
  const receipt = await downloadEvent;
  expect(receipt.suggestedFilename()).toBe(`${fixture.payment.receiptId}.txt`);
  const contents = await readFile(await receipt.path(), 'utf8');
  expect(contents).toContain('RAZORPAY TEST RECEIPT — no real money moved.');
  expect(contents).toContain('Transaction: pay_qa'); expect(fixture.unexpected).toEqual([]);
});

test('failed Razorpay attempt permits retry in the same checkout', async ({ page }) => {
  const fixture = await fixtureFor(page, 'razorpay'), dialog = await begin(page);
  await page.evaluate(() => window.__gateway.events['payment.failed']({ error: { description: 'The bank declined this attempt.' } }));
  await expect(dialog.getByRole('alert')).toContainText('The bank declined this attempt.');
  await expect(dialog.getByRole('button', { name: 'Confirming payment…' })).toBeDisabled();
  await page.keyboard.press('Tab');
  await expect(dialog).toBeFocused();
  await expect(page.locator('.billing-success')).toHaveCount(0); expect(fixture.verifications).toHaveLength(0);
  await succeed(page);
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.billing-success')).toContainText('Your test payment is complete.');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(fixture.verifications).toHaveLength(1); expect(fixture.orders).toHaveLength(1); expect(fixture.unexpected).toEqual([]);
});

test('dismissed checkout releases controls and refresh recovers a captured payment', async ({ page }) => {
  const fixture = await fixtureFor(page, 'razorpay'), dialog = await begin(page);
  await page.evaluate(() => window.__gateway.options.modal.ondismiss());
  await expect(dialog.getByRole('alert')).toContainText('Checkout closed. Refresh status');
  await expect(dialog.getByRole('button', { name: 'Continue to payment' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.billing-pending')).toContainText('A payment may be awaiting confirmation.');
  expect(fixture.verifications).toHaveLength(0);
  fixture.status = 'paid'; fixture.payments = [fixture.payment];
  await page.locator('.billing-pending').getByRole('button', { name: 'Refresh status' }).click();
  await expect(page.locator('.billing-success')).toContainText('Your test payment is complete.');
  await expect(page.locator('.billing-pending')).toHaveCount(0);
  expect(fixture.statusCalls).toBeGreaterThanOrEqual(2); expect(fixture.orders).toHaveLength(1);
  expect(fixture.verifications).toHaveLength(0);
  await expect.poll(() => page.evaluate(id => localStorage.getItem(`careclaim.payment-pending.${id}`), member.id)).toBeNull();
  expect(fixture.unexpected).toEqual([]);
});

test('returning to the page recovers a completed saved checkout', async ({ page }) => {
  const fixture = await fixtureFor(page, 'razorpay'); await begin(page);
  await expect.poll(() => page.evaluate(id => Boolean(localStorage.getItem(`careclaim.payment-pending.${id}`)), member.id)).toBe(true);
  fixture.status = 'paid'; fixture.payments = [fixture.payment]; await page.reload();
  await expect(page.locator('.billing-success')).toContainText('Your test payment is complete.');
  await expect(page.locator('.billing-pending')).toHaveCount(0);
  await expect(page.locator('.billing-receipt-id')).toHaveText(fixture.payment.receiptId);
  expect(fixture.orders).toHaveLength(1); expect(fixture.verifications).toHaveLength(0); expect(fixture.unexpected).toEqual([]);
});

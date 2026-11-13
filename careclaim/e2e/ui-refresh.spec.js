import { test, expect } from '@playwright/test';

async function loadedPhoto(locator) {
  await expect(locator).toBeVisible();
  await expect.poll(() => locator.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
}

test('medical sign-in shows its care photo, autoplay video, and usable blocked-audio controls', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    window.__allowWelcomeAudio = false;
    HTMLMediaElement.prototype.play = function (...args) {
      if (this.tagName === 'AUDIO' && !window.__allowWelcomeAudio) return Promise.reject(new DOMException('Autoplay requires user interaction.', 'NotAllowedError'));
      return originalPlay.apply(this, args);
    };
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await loadedPhoto(page.locator('.auth-media-photo'));
  const video = page.locator('.auth-welcome-video');
  await expect(video).toBeVisible();
  await expect(video).toHaveJSProperty('muted', true);
  await expect(video).toHaveJSProperty('loop', true);
  await expect(video).toHaveJSProperty('autoplay', true);
  await expect.poll(() => video.evaluate(element => element.readyState >= 2 && !element.paused)).toBe(true);
  const enableSound = page.getByRole('button', { name: 'Enable welcome audio', exact: true });
  await expect(enableSound).toBeVisible();
  await page.screenshot({ path: 'test-results/medical-signin-desktop.png', fullPage: true });
  await page.evaluate(() => { window.__allowWelcomeAudio = true; });
  await enableSound.click();
  const muteSound = page.getByRole('button', { name: 'Mute welcome audio', exact: true });
  await expect(muteSound).toBeVisible();
  await expect.poll(() => page.locator('.auth-media audio').evaluate(element => !element.paused && !element.muted && element.volume > 0)).toBe(true);
  await muteSound.click();
  await expect(enableSound).toBeVisible();
  await expect.poll(() => page.locator('.auth-media audio').evaluate(element => element.paused || element.muted || element.volume === 0)).toBe(true);
  await page.getByRole('button', { name: 'Pause welcome animation', exact: true }).click();
  await expect.poll(() => video.evaluate(element => element.paused)).toBe(true);
  await expect(page.getByRole('button', { name: 'Play welcome animation', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('saved dark preference and reduced motion keep welcome media still and quiet', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('careclaim-theme', 'dark');
    window.__welcomeAudioAttempts = 0;
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      if (this.tagName === 'AUDIO') window.__welcomeAudioAttempts++;
      return originalPlay.apply(this, args);
    };
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await loadedPhoto(page.locator('.auth-media-photo'));
  const video = page.locator('.auth-welcome-video');
  await expect(video).toHaveJSProperty('autoplay', false);
  await expect(video).toHaveJSProperty('paused', true);
  await expect(page.getByRole('button', { name: 'Play welcome animation', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enable welcome audio', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__welcomeAudioAttempts)).toBe(0);
  await page.screenshot({ path: 'test-results/medical-signin-dark-reduced-motion.png', fullPage: true });
});

test('mobile medical sign-in and overview keep their care imagery inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await loadedPhoto(page.locator('.auth-media-photo'));
  await expect(page.locator('.auth-welcome-video')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/medical-signin-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Member', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Good / })).toBeVisible();
  await loadedPhoto(page.locator('.dashboard-care-photo'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.locator('.auth-media')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/medical-overview-mobile.png', fullPage: true });
});

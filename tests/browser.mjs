import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Optional QA dependency: npm install --no-save playwright && npx playwright install chromium
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright').catch(async () => {
  const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  return import(pathToFileURL(`${globalRoot}/playwright/index.mjs`).href);
});
const browser = await chromium.launch({ headless: true });
const base = process.env.BASE_URL || 'http://localhost:5173/';
const subpath = process.env.SUBPATH_URL || (process.argv.includes('--subpath') ? process.argv[process.argv.indexOf('--subpath') + 1] : null);
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const action = name => page.locator(`[data-action="${name}"]`).first();
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.startsWith('znat-v1:')))));
const click = async name => { await action(name).click(); };
await mkdir('test-results', { recursive: true });

try {
  await page.goto(base);
  await page.waitForSelector('.mode-tile');
  await page.waitForFunction(() => document.querySelector('#offline-status')?.textContent.includes('Можно офлайн'));
  await page.screenshot({ path: 'test-results/home-iphone.png', fullPage: true });
  assert.equal(await page.locator('.mode-tile').count(), 4);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  console.log('✓ iPhone layout and complete offline bundle');

  await click('setup');
  await page.locator('#player-0').fill('Оля');
  await page.locator('#player-1').fill('Кирилл');
  await page.locator('#card-count').fill('10');
  await click('slot:5');
  await page.screenshot({ path: 'test-results/setup-iphone.png', fullPage: true });
  await click('start'); await click('begin');
  assert.equal((await state()).game.config.slot, 5);
  const original = (await state()).game.deck;
  await page.screenshot({ path: 'test-results/card-iphone.png', fullPage: true });
  await click('reveal');
  await page.screenshot({ path: 'test-results/answer-iphone.png', fullPage: true });
  await click('incorrect');
  assert.deepEqual((await state()).game.deck, [...original.slice(1), original[0]]);
  await click('begin'); await click('reveal'); await click('correct');
  assert.equal((await state()).game.players[1].score, 1);
  assert.equal((await state()).game.deck.length, 9);
  console.log('✓ Classic: numbered entries, wrong-card recycling, scores and handoff');

  await context.setOffline(true); await page.reload();
  await page.waitForSelector('.resume-banner'); await click('continue');
  assert.equal((await state()).game.players[1].score, 1);
  await click('begin'); await click('hint');
  await page.locator('#dictionary-search').fill('СНИЛС');
  await page.locator('.dictionary-item summary').click();
  assert.match(await page.locator('.dictionary-item').innerText(), /Страховой номер/);
  await page.screenshot({ path: 'test-results/offline-hint-iphone.png', fullPage: true });
  await click('close-modal'); await click('resume');
  await click('reveal'); await click('correct');
  assert.equal((await state()).game.deck.length, 8);
  console.log('✓ Offline cold reload, save recovery, search and full gameplay');

  for (let i = 0; i < 8; i++) { await click('begin'); await click('reveal'); await click('correct'); }
  assert.equal((await state()).game.phase, 'finished');
  assert.equal((await state()).game.awarded.length, 10);
  await page.screenshot({ path: 'test-results/results-iphone.png', fullPage: true });
  console.log('✓ Full 10-card party and results without network');

  await click('home'); await click('mode:first'); await click('setup'); await click('start'); await click('begin');
  await click('reveal'); await click('award:1');
  assert.equal((await state()).game.players[1].score, 1);
  assert.equal((await state()).game.phase, 'playing');
  await click('pause'); await click('end-request'); await click('end-confirm');
  console.log('✓ First-answer mode and in-app winner selection');

  await click('home'); await click('mode:random'); await click('setup'); await click('start'); await click('begin');
  await page.screenshot({ path: 'test-results/dice-iphone.png', fullPage: true });
  await click('roll');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.startsWith('znat-v1:')))).game.die !== null);
  const rolled = (await state()).game.die;
  assert.ok(rolled >= 1 && rolled <= 6);
  if (rolled === 6) { await click('skip-die'); assert.equal((await state()).game.deck.length, 10); }
  else { await click('reveal'); await click('correct'); assert.equal((await state()).game.players[0].score, 1); }
  await click('end-request'); await click('end-confirm');
  console.log('✓ Built-in die and random-mode play');

  await click('home'); await click('mode:timed'); await click('setup'); await click('start'); await click('begin');
  await page.waitForSelector('#timer');
  await click('skip'); assert.equal((await state()).game.deck.length, 10);
  await click('reveal'); await click('correct');
  assert.equal((await state()).game.phase, 'playing');
  await click('pause');
  assert.equal((await state()).game.phase, 'paused');
  const timeLeft = (await state()).game.remaining;
  await click('leave'); await page.reload(); await page.waitForSelector('.resume-banner');
  await click('continue');
  assert.equal((await state()).game.remaining, timeLeft);
  await click('resume'); assert.equal((await state()).game.phase, 'playing');
  await click('pause'); await click('end-request'); await click('end-confirm');
  console.log('✓ Timed play, skip, precise pause, reload and resume');

  await click('home'); await click('settings');
  await page.locator('#sound-setting').uncheck(); await page.locator('#motion-setting').uncheck();
  assert.equal((await state()).preferences.sound, false);
  assert.equal(await page.locator('html').evaluate(el => el.classList.contains('reduce-motion')), true);
  await click('install'); assert.match(await page.locator('.modal').innerText(), /На экран Домой/);
  await click('close-modal');
  await click('navigate:dictionary'); await page.locator('#dictionary-search').fill('ёжик');
  assert.equal(await page.locator('.empty-state').count(), 1);
  await page.locator('#dictionary-search').fill('');
  assert.equal(await page.locator('.dictionary-item').count(), 250);
  await click('navigate:rules'); assert.equal(await page.locator('.mode-rule').count(), 4);
  console.log('✓ Preferences, install guide, complete dictionary and rules offline');

  await click('navigate:home');
  for (const width of [320, 375, 430, 768, 1365]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}px`);
  }
  await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('✓ No horizontal overflow at 320–1365px; no JavaScript errors');

  // A GitHub project site lives under /repo/. Check this with a separate server below.
  if (subpath) {
    await context.setOffline(false);
    await page.goto(subpath);
    await page.waitForSelector('.mode-tile');
    await page.waitForFunction(() => document.querySelector('#offline-status')?.textContent.includes('Можно офлайн'));
    await context.setOffline(true); await page.reload(); await page.waitForSelector('.mode-tile');
    console.log('✓ GitHub Pages subdirectory, including offline cold reload');
  }
  console.log('All browser checks passed. Screenshots: test-results/');
} catch (error) {
  await page.screenshot({ path: 'test-results/failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }

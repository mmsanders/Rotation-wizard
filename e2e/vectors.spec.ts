import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/');
});

/** Read the number out of a tap-to-copy tile by its label. */
const value = async (page: Page, name: string) =>
  (await page.getByTitle(`Copy ${name}`).first().innerText()).split('\n').pop() ?? '';

const compareVectors = async (page: Page) => {
  await page.getByRole('tab', { name: 'Compare' }).click();
  await page.getByRole('group', { name: 'Compare' }).getByRole('button', { name: 'Vectors' }).click();
};

test('shows the seeded direction and point', async ({ page }) => {
  await page.getByRole('tab', { name: 'Vectors' }).click();
  await expect(page.getByRole('button', { name: /^Nose/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Target/ })).toBeVisible();
});

test('a direction and a point with the same components read differently', async ({ page }) => {
  await page.getByRole('tab', { name: 'Vectors' }).click();

  // Nose lives in Body, which is offset from Global — so the two kinds must disagree.
  await page.getByRole('button', { name: 'Direction', exact: true }).click();
  const asDirection = [await value(page, 'X'), await value(page, 'Y'), await value(page, 'Z')];

  await page.getByRole('button', { name: 'Point', exact: true }).click();
  const asPoint = [await value(page, 'X'), await value(page, 'Y'), await value(page, 'Z')];

  expect(asPoint).not.toEqual(asDirection);

  // The difference is exactly Body's origin, (1.8, 0.9, 0.9).
  expect(Number(asPoint[0]) - Number(asDirection[0])).toBeCloseTo(1.8, 3);
  expect(Number(asPoint[1]) - Number(asDirection[1])).toBeCloseTo(0.9, 3);
  expect(Number(asPoint[2]) - Number(asDirection[2])).toBeCloseTo(0.9, 3);
});

test('a direction keeps its magnitude when read in another frame', async ({ page }) => {
  await page.getByRole('tab', { name: 'Vectors' }).click();
  await page.getByRole('button', { name: 'Direction', exact: true }).click();

  const inGlobal = await value(page, '|v|');
  await page.getByLabel('Read this vector in').selectOption({ label: 'Body' });
  const inBody = await value(page, '|v|');

  expect(Number(inGlobal)).toBeCloseTo(Number(inBody), 3);
});

test('reads the angle between two vectors', async ({ page }) => {
  await compareVectors(page);

  await expect(page.getByRole('heading', { name: 'Nose to Target' })).toBeVisible();
  const angle = Number.parseFloat(await value(page, 'angle'));
  expect(angle).toBeGreaterThan(0);
  expect(angle).toBeLessThanOrEqual(180);
});

test('warns that the angle is frame-specific once a point is involved', async ({ page }) => {
  await compareVectors(page);
  // Target is a point, so the answer depends on the evaluation frame.
  await expect(page.getByText(/specific to/)).toBeVisible();
});

test('round-trips a scene through a shared link', async ({ page, context }) => {
  // Make this scene distinguishable from the default one.
  const yaw = page.getByLabel('yaw', { exact: true });
  await yaw.fill('123');
  await yaw.press('Enter');

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('tab', { name: 'Setup' }).click();
  await page.getByRole('button', { name: /Copy link to this scene/ }).click();
  await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();

  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain('#s=');

  // Open the link in a page with no stored scene at all.
  const fresh = await context.newPage();
  await fresh.addInitScript(() => window.localStorage.clear());
  await fresh.goto(link);

  await expect(fresh.getByText('Scene loaded from link.')).toBeVisible();
  await expect(fresh.getByLabel('yaw', { exact: true })).toHaveValue('123');

  // The hash is cleared so a refresh cannot silently re-import over later edits.
  expect(new URL(fresh.url()).hash).toBe('');

  // Undo restores whatever the import replaced.
  await fresh.getByRole('button', { name: 'Undo' }).click();
  await expect(fresh.getByLabel('yaw', { exact: true })).toHaveValue('35');
  await fresh.close();
});

test('a corrupt link leaves a usable app rather than a blank screen', async ({ page }) => {
  await page.goto('/#s=this-is-not-a-scene');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Global root', exact: true })).toBeVisible();
});

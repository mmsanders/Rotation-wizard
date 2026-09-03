import { expect, test } from '@playwright/test';

/** Start every test from a clean scene, so a stored setup can't skew assertions. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/');
});

test('boots with a rendered WebGL canvas', async ({ page }) => {
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  // A canvas element can exist while WebGL has silently failed, so check it has real size
  // and that three.js actually acquired a context.
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(200);
  expect(box?.height ?? 0).toBeGreaterThan(200);

  const hasContext = await canvas.evaluate(
    (el) => !!(el as HTMLCanvasElement).getContext('webgl2'),
  );
  expect(hasContext).toBe(true);
});

test('offers a control to restore the default camera view', async ({ page }) => {
  const resetView = page.getByRole('button', { name: 'Reset default view' });
  await expect(resetView).toBeVisible();

  // The control is an overlay above the WebGL canvas and remains usable after the user
  // has interacted with the scene.
  await page.locator('canvas').dragTo(page.locator('canvas'), {
    sourcePosition: { x: 120, y: 120 },
    targetPosition: { x: 210, y: 170 },
  });
  await resetView.click();
  await expect(resetView).toBeFocused();
});

test('shows the default scene and its readout', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Global root', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Body', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quaternion' }).first()).toBeVisible();
});

test('editing an angle updates the quaternion readout', async ({ page }) => {
  const yaw = page.getByLabel('yaw', { exact: true });
  await expect(yaw).toBeVisible();

  const readValue = async (name: string) =>
    (await page.getByTitle(`Copy ${name}`).first().innerText()).split('\n').pop() ?? '';

  const before = await readValue('w');
  await yaw.fill('90');
  await yaw.press('Enter');
  const after = await readValue('w');

  expect(after).not.toBe(before);
  // A 90 deg yaw about a single axis is the textbook cos(45 deg) = 0.7071.
  expect(Number(after)).toBeCloseTo(Math.SQRT1_2, 4);
});

test('defines a frame orientation with quaternion components', async ({ page }) => {
  await page.getByRole('button', { name: 'Quaternion', exact: true }).click();

  await expect(page.getByLabel('w', { exact: true })).toBeVisible();
  await expect(page.getByLabel('x', { exact: true })).toBeVisible();
  await expect(page.getByLabel('yaw', { exact: true })).toHaveCount(0);

  await page.getByLabel('z', { exact: true }).fill('1');
  await page.getByLabel('z', { exact: true }).press('Enter');

  const readValue = async (name: string) =>
    Number((await page.getByTitle(`Copy ${name}`).first().innerText()).split('\n').pop());
  expect(await readValue('z')).toBeCloseTo(1 / Math.sqrt(2), 5);
  expect(await readValue('w')).toBeCloseTo(1 / Math.sqrt(2), 5);

  await page.getByRole('button', { name: 'Euler sequence', exact: true }).click();
  await expect(page.getByLabel('yaw', { exact: true })).toBeVisible();
});

test('warns at gimbal lock instead of quietly printing an ambiguous triple', async ({ page }) => {
  const pitch = page.getByLabel('pitch', { exact: true });
  await pitch.fill('90');
  await pitch.press('Enter');
  await expect(page.getByText(/Near gimbal lock/)).toBeVisible();
});

test('compares two frames and swaps direction', async ({ page }) => {
  await page.getByRole('tab', { name: 'Compare' }).click();

  await expect(page.getByRole('heading', { name: 'Body relative to Global' })).toBeVisible();
  await page.getByRole('button', { name: 'Swap reference and target' }).click();
  await expect(page.getByRole('heading', { name: 'Global relative to Body' })).toBeVisible();
});

test('changing conventions re-reads the same scene without altering it', async ({ page }) => {
  const readEuler = async (name: string) =>
    (await page.getByTitle(`Copy ${name}`).first().innerText()).split('\n').pop() ?? '';

  const quatBefore = await readEuler('w');

  await page.getByRole('tab', { name: 'Setup' }).click();
  await page.getByRole('button', { name: 'XYZ', exact: true }).click();
  await page.getByRole('tab', { name: 'Frames' }).click();

  // The Euler labelling changes; the underlying rotation must not.
  await expect(page.getByText('intrinsic X-Y-Z').first()).toBeVisible();
  expect(await readEuler('w')).toBe(quatBefore);
});

test('adds and deletes a frame', async ({ page }) => {
  await page.getByRole('button', { name: /Add frame under/ }).click();
  await expect(page.getByRole('button', { name: 'Frame 2', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Delete Frame 2', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Frame 2', exact: true })).toHaveCount(0);
});

test('the global frame cannot be deleted', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Delete Global', exact: true })).toBeDisabled();
});

test('the panel tabs respond to taps', async ({ page }) => {
  // Regression guard: the tab bar used to sit inside the sheet's drag strip, where
  // pointer capture swallowed the tap and left the tabs dead on touch devices.
  await page.getByRole('tab', { name: 'Setup' }).click();
  await expect(page.getByRole('tab', { name: 'Setup' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('World up axis')).toBeVisible();

  await page.getByRole('tab', { name: 'Frames' }).click();
  await expect(page.getByRole('tab', { name: 'Frames' })).toHaveAttribute('aria-selected', 'true');
});

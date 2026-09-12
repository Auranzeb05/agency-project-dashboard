import { test, expect, type Page } from '@playwright/test';
async function login(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('Email address').fill(`${name}@fieldwork.test`);
  await page.getByLabel('Password', { exact: false }).fill(process.env.SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
  await expect(page.getByText('Live updates connected', { exact: true })).toBeVisible();
}
test('admin can manage clients and projects; dialogs preserve keyboard access', async ({
  page,
}) => {
  await login(page, 'admin');
  await expect(page.getByText('Online now', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/admin-overview.png', fullPage: true });
  if (process.env.CI)
    console.log(
      'UI_SCREEN_ADMIN=' + (await page.screenshot({ fullPage: true })).toString('base64'),
    );
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('button', { name: 'New client', exact: true }).click();
  await page.getByLabel('Client name').fill('Juniper QA');
  await page.getByLabel('Company', { exact: true }).fill('Juniper Studio');
  await page.getByLabel('Contact email').fill('qa@juniper.example');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('cell').filter({ hasText: 'Juniper QA' }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project name').fill('Juniper — Launch');
  await page.getByLabel('Client', { exact: true }).selectOption({ label: 'Juniper QA' });
  await page.getByLabel('Project brief').fill('A focused launch workspace.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Juniper — Launch' })).toBeVisible();
  await page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name: 'Juniper — Launch' }) })
    .click();
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.getByLabel('Task title').fill('Review release checklist');
  await page
    .getByLabel('Description', { exact: true })
    .fill('Verify the release checklist before handoff.');
  await page.getByLabel('Assign to').selectOption({ label: 'Ravi Kumar' });
  await page.getByLabel('Due date (UTC)').fill('2030-10-10');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('button', { name: /Review release checklist/ }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Open Review release checklist', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('PM and developer see their own work; filter URLs survive refresh', async ({ browser }) => {
  const pm = await browser.newPage(),
    dev = await browser.newPage();
  await login(pm, 'kabir');
  await expect(pm.getByRole('link', { name: 'Clients', exact: true })).toHaveCount(0);
  await pm.getByRole('link', { name: 'Projects', exact: true }).click();
  await expect(pm.getByRole('heading', { name: 'Orbit — Operations hub' })).toBeVisible();
  await expect(pm.getByRole('heading', { name: 'Atlas — Client portal' })).toHaveCount(0);
  await login(dev, 'ravi');
  await expect(dev.getByRole('button', { name: 'New project', exact: true })).toHaveCount(0);
  await dev.getByRole('link', { name: 'My tasks', exact: true }).click();
  await dev.getByLabel('Filter status').selectOption('TODO');
  await expect(dev).toHaveURL(/status=TODO/);
  await dev.reload();
  await expect(dev.getByLabel('Filter status')).toHaveValue('TODO');
  await dev.screenshot({ path: 'test-results/developer-tasks.png', fullPage: true });
  await pm.close();
  await dev.close();
});
test('task status and notifications update in a second browser without refresh', async ({
  browser,
}) => {
  const pm = await browser.newPage(),
    dev = await browser.newPage();
  await login(pm, 'nisha');
  await login(dev, 'ravi');
  await pm.goto('/projects/1');
  await dev.goto('/projects/1');
  const row = dev.locator('tbody tr').filter({ hasText: 'Build the project overview' });
  await expect(row).toBeVisible();
  const dropdown = row.getByRole('combobox');
  await dropdown.selectOption('IN_REVIEW');
  await expect(
    pm.locator('tbody tr').filter({ hasText: 'Build the project overview' }).getByRole('combobox'),
  ).toHaveValue('IN_REVIEW');
  await pm.getByRole('button', { name: /Notifications,/ }).click();
  await expect(
    pm.getByRole('button', { name: /Build the project overview.*ready for review/ }).first(),
  ).toBeVisible();
  await pm.close();
  await dev.close();
});
test('mobile layout keeps navigation, task details, and forms usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'admin');
  await page.screenshot({ path: 'test-results/mobile-overview.png', fullPage: true });
  if (process.env.CI)
    console.log(
      'UI_SCREEN_MOBILE=' + (await page.screenshot({ fullPage: true })).toString('base64'),
    );
  console.log(
    'LAYOUT_BOUNDS',
    await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      overflow: Array.from(document.querySelectorAll('body *'))
        .filter(
          (e) => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('.table-scroll'),
        )
        .map((e) => ({
          tag: e.tagName,
          classes: e.className,
          width: e.getBoundingClientRect().width,
          right: e.getBoundingClientRect().right,
        }))
        .slice(0, 30),
    })),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Projects', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await expect(page.getByLabel('Project name')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
});

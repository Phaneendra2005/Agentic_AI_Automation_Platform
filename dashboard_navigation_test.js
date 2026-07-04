const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const BASE = process.env.DASHBOARD_TEST_URL || 'http://localhost:3001';
const authState = JSON.stringify({
  state: {
    user: { id: 'test-user', name: 'Dashboard Tester', email: 'tester@example.com' },
    token: 'test-token',
    isAuthenticated: true,
  },
  version: 0,
});

const dashboardResponse = {
  success: true,
  totalWorkflows: 3,
  activeWorkflows: 2,
  totalExecutions: 4,
  completedExecutions: 3,
  failedExecutions: 1,
  cancelledExecutions: 0,
  runningExecutions: 0,
  pausedExecutions: 0,
  successRate: 75,
  recentExecutions: [],
  recentWorkflows: [
    {
      _id: 'workflow-1',
      name: 'Read Data from Google Sheets',
      status: 'active',
      updatedAt: '2026-06-27T10:00:00.000Z',
    },
  ],
  recentWorkflowActivity: [
    {
      _id: 'activity-1',
      event: 'execution:completed',
      workflowName: 'Read Data from Google Sheets',
      status: 'COMPLETED',
      timestamp: new Date().toISOString(),
    },
  ],
};

async function ensureTestServer() {
  try {
    const response = await fetch(`${BASE}/dashboard`);
    if (response.ok) return null;
  } catch {}

  const url = new URL(BASE);
  const child = spawn(
    process.execPath,
    [path.join(__dirname, 'client', 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', url.port],
    {
      cwd: path.join(__dirname, 'client'),
      stdio: 'ignore',
      windowsHide: true,
    }
  );

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      const response = await fetch(`${BASE}/dashboard`);
      if (response.ok) return child;
    } catch {}
  }

  child.kill();
  throw new Error(`Dashboard test server did not start at ${BASE}`);
}

async function prepareContext(browser, viewport, dashboardFails = false) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((storedAuth) => {
    localStorage.setItem('agentflow-auth', storedAuth);
  }, authState);
  await context.route('http://localhost:5000/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/workflows/dashboard') {
      return route.fulfill({
        status: dashboardFails ? 500 : 200,
        contentType: 'application/json',
        body: JSON.stringify(dashboardFails ? { success: false } : dashboardResponse),
      });
    }
    if (url.pathname === '/api/workflows') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, workflows: dashboardResponse.recentWorkflows }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, notifications: [] }),
    });
  });
  return context;
}

async function verifyNavigation(browser, viewport, screenshotPrefix) {
  const context = await prepareContext(browser, viewport);
  const page = await context.newPage();
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });

  await page.getByText('Total Executions', { exact: true }).waitFor();
  assert.strictEqual(await page.getByText('4', { exact: true }).count(), 1);
  assert.strictEqual(await page.getByText('75%', { exact: true }).count(), 1);
  assert.strictEqual(await page.getByText('Workflow completed', { exact: true }).count(), 1);
  await page.screenshot({
    path: path.join(__dirname, 'screenshots', `${screenshotPrefix}-dashboard.png`),
    fullPage: true,
  });

  const viewAll = page.getByRole('link', { name: 'View all', exact: true });
  assert.strictEqual(await viewAll.count(), 1);
  await viewAll.click();
  await page.waitForURL(`${BASE}/workflows`);

  await page.goBack();
  await page.waitForURL(`${BASE}/dashboard`);

  await page.getByRole('link', { name: 'View all', exact: true }).click();
  await page.waitForURL(`${BASE}/workflows`);
  await page.reload({ waitUntil: 'networkidle' });
  assert.strictEqual(page.url(), `${BASE}/workflows`);

  await page.screenshot({
    path: path.join(__dirname, 'screenshots', `${screenshotPrefix}-workflows.png`),
    fullPage: true,
  });
  await context.close();
}

(async () => {
  const testServer = await ensureTestServer();
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROME_PATH
      || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  await verifyNavigation(browser, { width: 1440, height: 900 }, 'dashboard-desktop');
  await verifyNavigation(browser, { width: 390, height: 844 }, 'dashboard-mobile');

  const errorContext = await prepareContext(browser, { width: 1280, height: 800 }, true);
  const errorPage = await errorContext.newPage();
  await errorPage.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  assert.strictEqual(
    await errorPage.getByText('Unable to load dashboard metrics.', { exact: true }).count(),
    1
  );
  assert.strictEqual(await errorPage.getByText('0%', { exact: true }).count(), 1);
  await errorContext.close();

  await browser.close();
  testServer?.kill();
  console.log('dashboard navigation tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

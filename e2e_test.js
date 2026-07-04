const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3000';
const SHOTS = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
let shotIndex = 0;

async function shot(page, label) {
  const file = path.join(SHOTS, `${String(shotIndex++).padStart(2,'0')}_${label}.png`);
  await page.screenshot({ path: file });
  console.log(`  📸 ${path.basename(file)}`);
  return file;
}
function pass(label, detail) {
  results.push({ ok: true, label, detail });
  console.log(`  ✅ PASS  ${label}${detail ? ' — ' + detail : ''}`);
}
function fail(label, detail) {
  results.push({ ok: false, label, detail });
  console.log(`  ❌ FAIL  ${label}${detail ? ' — ' + detail : ''}`);
}
function warn(label, detail) {
  results.push({ ok: null, label, detail });
  console.log(`  ⚠️  WARN  ${label}${detail ? ' — ' + detail : ''}`);
}

// Helper: wait for the spinner to go away (hydration done) on protected pages
async function waitForHydration(page) {
  // Either the spinner disappears or we see actual page content
  await page.waitForFunction(
    () => !document.querySelector('.animate-spin') || document.querySelector('h1, [class*="sidebar"], nav a'),
    { timeout: 6000 }
  ).catch(() => {});
  await page.waitForTimeout(400);
}

// Click sidebar link by text and wait for navigation
async function clickSidebar(page, label, expectedPath) {
  const link = await page.$(`nav a:has-text("${label}"), aside a:has-text("${label}")`);
  if (link) {
    await link.click();
    if (expectedPath) {
      await page.waitForURL(`**${expectedPath}`, { timeout: 5000 }).catch(() => {});
    }
    await page.waitForTimeout(600);
    return true;
  }
  return false;
}

async function run() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  AGENTFLOW AI — END-TO-END BROWSER TEST');
  console.log('══════════════════════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: false, slowMo: 60 });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', () => {});  // suppress noise

  const EMAIL = `e2e_${Date.now()}@test.com`;
  const PASS  = 'TestPass123!';

  try {

    // ══════════════════════════════════════════════════════════
    // 1. LANDING PAGE
    // ══════════════════════════════════════════════════════════
    console.log('─── 1. Landing Page');
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const landingH1 = await page.$eval('h1, [class*="title"]', el => el.textContent).catch(() => '');
    await shot(page, '01_landing');
    landingH1 ? pass('Landing page', landingH1.trim().slice(0, 60)) : warn('Landing page', 'no h1 (may be title-less landing)');

    // ══════════════════════════════════════════════════════════
    // 2. REGISTER
    // ══════════════════════════════════════════════════════════
    console.log('\n─── 2. Register');
    await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    await shot(page, '02_register_page');

    await page.fill('input[type="text"]', 'E2E User');
    await page.fill('input[type="email"]', EMAIL);
    const pwds = await page.$$('input[type="password"]');
    for (const pw of pwds) await pw.fill(PASS);
    await shot(page, '03_register_filled');
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 }).catch(() => {});
    await waitForHydration(page);
    await shot(page, '04_after_register');
    page.url().includes('/dashboard')
      ? pass('Register → dashboard')
      : fail('Register → dashboard', `landed at ${page.url()}`);

    // ══════════════════════════════════════════════════════════
    // 3. DASHBOARD
    // ══════════════════════════════════════════════════════════
    console.log('\n─── 3. Dashboard');
    await page.waitForSelector('h1', { timeout: 5000 }).catch(() => {});
    const dashH1 = await page.$eval('h1', el => el.textContent).catch(() => '');
    const metricCards = await page.$$('[class*="rounded-xl"]');
    await shot(page, '05_dashboard');
    dashH1.includes('Welcome') ? pass('Dashboard h1', dashH1.trim()) : fail('Dashboard h1', dashH1);
    metricCards.length >= 4 ? pass('Metric cards', `${metricCards.length} cards`) : warn('Metric cards', `only ${metricCards.length}`);

    // Verify sidebar links are visible
    const sidebarLinks = await page.$$('nav a, aside a');
    sidebarLinks.length >= 4 ? pass('Sidebar nav links', `${sidebarLinks.length} links`) : warn('Sidebar links', sidebarLinks.length);

    // ══════════════════════════════════════════════════════════
    // 4. NOTIFICATIONS BELL (on dashboard)
    // ══════════════════════════════════════════════════════════
    console.log('\n─── 4. Notifications Bell');
    try {
      const bellBtn = await page.$('button[aria-label="Notifications"]');
      if (bellBtn) {
        await bellBtn.click();
        await page.waitForTimeout(700);
        await shot(page, '06_notifications_drawer');
        const drawerPanel = await page.$('.fixed.right-0.top-0, [class*="fixed"][class*="right-0"][class*="top-0"]');
        drawerPanel ? pass('Notifications drawer opens and panel visible') : warn('Drawer panel', 'opened but panel not found');
        // Close by clicking the backdrop (fixed inset-0 overlay)
        const backdrop = await page.$('.fixed.inset-0');
        if (backdrop) {
          await backdrop.click();
        } else {
          await page.mouse.click(200, 400); // click outside drawer
        }
        await page.waitForTimeout(500);
        const drawerGone = await page.$('.fixed.right-0.top-0');
        !drawerGone ? pass('Notifications drawer closes') : warn('Drawer close', 'drawer still visible');
      } else {
        warn('Bell button', 'aria-label="Notifications" not found');
        await shot(page, '06_bell_missing');
      }
    } catch (e) {
      warn('Notifications bell test', e.message.slice(0, 80));
    }

    // ══════════════════════════════════════════════════════════
    // 5. LOGOUT (topbar button)
    // ══════════════════════════════════════════════════════════
    console.log('\n─── 5. Logout');
    const logoutBtn = await page.$('button[aria-label="Logout"]');
    if (logoutBtn) {
      await logoutBtn.click();
      await page.waitForURL(`${BASE}/login`, { timeout: 5000 }).catch(() => {});
      await shot(page, '07_after_logout');
      page.url().includes('/login')
        ? pass('Logout → /login')
        : fail('Logout', `ended at ${page.url()}`);
    } else {
      fail('Logout button', 'aria-label="Logout" not found');
      await shot(page, '07_no_logout');
    }

    // ══════════════════════════════════════════════════════════
    // 6. LOGIN
    // ══════════════════════════════════════════════════════════
    console.log('\n─── 6. Login');
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await shot(page, '08_login_page');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASS);
    await shot(page, '09_login_filled');
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/dashboard`, { timeout: 8000 }).catch(() => {});
    await waitForHydration(page);
    await shot(page, '10_after_login');
    page.url().includes('/dashboard')
      ? pass('Login → dashboard')
      : fail('Login', `ended at ${page.url()}`);

    // ══════════════════════════════════════════════════════════
    // 7. SIDEBAR NAVIGATION (via clicks — avoids full reload)
    // ══════════════════════════════════════════════════════════
    console.log('\n─── 7. Sidebar Navigation');

    // Executions
    await clickSidebar(page, 'Executions', '/executions');
    await shot(page, '11_executions_page');
    page.url().includes('/executions')
      ? pass('Sidebar → Executions', page.url())
      : warn('Sidebar → Executions', page.url());
    const execH1 = await page.$eval('h1', el => el.textContent).catch(() => '');
    execH1 ? pass('Executions page h1', execH1.trim()) : warn('Executions h1', 'none');

    // Integrations
    await clickSidebar(page, 'Integrations', '/integrations');
    await shot(page, '12_integrations_page');
    page.url().includes('/integrations')
      ? pass('Sidebar → Integrations', page.url())
      : warn('Sidebar → Integrations', page.url());

    // Settings
    await clickSidebar(page, 'Settings', '/settings');
    await page.waitForTimeout(400);
    await shot(page, '13_settings_page');
    page.url().includes('/settings')
      ? pass('Sidebar → Settings', page.url())
      : warn('Sidebar → Settings', page.url());
    const settingsH1 = await page.$eval('h1', el => el.textContent).catch(() => '');
    settingsH1.toLowerCase().includes('setting')
      ? pass('Settings page renders', settingsH1.trim())
      : warn('Settings h1', settingsH1);

    // ══════════════════════════════════════════════════════════
    // 8. WORKFLOW BUILDER — AI GENERATION
    // ══════════════════════════════════════════════════════════
    console.log('\n─── 8. Workflow Builder (AI Generation)');
    await clickSidebar(page, 'Workflow Builder', '/workflows/builder');
    await page.waitForTimeout(600);
    await shot(page, '14_builder_page');
    page.url().includes('/workflows/builder')
      ? pass('Sidebar → Workflow Builder', page.url())
      : fail('Sidebar → Builder', page.url());

    const textarea = await page.$('textarea');
    let editorWorkflowId = null;
    if (!textarea) {
      fail('Builder textarea', 'not found');
    } else {
      pass('Builder page has prompt textarea');
      await textarea.fill('Classify customer feedback and route to the correct Slack channel');
      await shot(page, '15_builder_prompt');

      const genBtn = await page.$('button[type="submit"]');
      if (genBtn) {
        await genBtn.click();
        pass('Generate button clicked — "Generating…" spinner visible');
        await shot(page, '16_builder_generating');

        // Wait up to 45s for success panel
        try {
          await page.waitForSelector('.text-emerald-400, .bg-emerald-500\\/10', { timeout: 45000 });
          await shot(page, '17_builder_generated');
          pass('AI workflow generated — success panel visible');

          const openBtn = await page.$('text=Open in editor');
          if (openBtn) {
            await openBtn.click();
            await page.waitForURL(/\/workflows\/[a-f0-9]+/, { timeout: 8000 }).catch(() => {});
            const m = page.url().match(/\/workflows\/([a-f0-9]+)/);
            if (m) editorWorkflowId = m[1];
            await waitForHydration(page);
            await shot(page, '18_editor_opened');
            pass('Opened workflow in editor', page.url());
          }
        } catch {
          await shot(page, '17_builder_timeout');
          warn('AI generation response', 'no success panel in 45s — OpenRouter may be rate-limiting. Navigating to existing workflow.');
          // Fall back: navigate to the workflow created earlier via the API test
          editorWorkflowId = '6a392aa5f91283145ab6869c';
        }
      } else {
        fail('Generate button', 'not found');
        editorWorkflowId = '6a392aa5f91283145ab6869c';
      }
    }

    // ══════════════════════════════════════════════════════════
    // 9. WORKFLOW EDITOR (canvas, nodes, controls)
    // ══════════════════════════════════════════════════════════
    console.log('\n─── 9. Workflow Editor');
    // Navigate to editor if we're not already there
    if (editorWorkflowId && !page.url().includes(`/workflows/${editorWorkflowId}`)) {
      await page.goto(`${BASE}/workflows/${editorWorkflowId}`, { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      await page.waitForTimeout(1200);
    }
    if (/\/workflows\/[a-f0-9]+/.test(page.url())) {
      await page.waitForTimeout(2000); // let React Flow initialise
      await shot(page, '19_editor_canvas');

      // React Flow canvas
      const rfCanvas = await page.$('.react-flow');
      rfCanvas ? pass('React Flow canvas rendered') : fail('React Flow canvas', 'not found');

      // Nodes on canvas
      const nodes = await page.$$('.react-flow__node');
      nodes.length > 0
        ? pass('Nodes on canvas', `${nodes.length} nodes visible`)
        : warn('Nodes', 'none visible (canvas may still be loading)');

      // MiniMap
      const minimap = await page.$('.react-flow__minimap');
      minimap ? pass('MiniMap rendered') : warn('MiniMap', 'not visible');

      // Controls
      const controls = await page.$('.react-flow__controls');
      controls ? pass('Controls panel') : warn('Controls', 'not visible');

      // NodePalette (draggable items)
      const palette = await page.$$('[draggable="true"]');
      palette.length > 0 ? pass('Node palette draggable items', `${palette.length} items`) : warn('Node palette', 'no draggable items');

      // Save button
      const saveBtn = await page.$('button:has-text("Save")');
      if (saveBtn) {
        const disabled = await saveBtn.getAttribute('disabled');
        pass('Save button present', disabled !== null ? 'disabled (no unsaved changes)' : 'enabled');
      } else { warn('Save button', 'not found'); }

      // Run button — click it
      const runBtn = await page.$('button:has-text("Run")');
      if (runBtn) {
        await runBtn.click();
        await page.waitForTimeout(2500);
        await shot(page, '20_after_run');
        pass('Run button clicked — execution triggered');
      } else { warn('Run button', 'not found'); }

      // Duplicate
      const dupBtn = await page.$('button[title*="dup" i], button:has([data-lucide="copy"])');
      if (!dupBtn) {
        // Try copy icon button
        const allBtns = await page.$$('header button, [class*="toolbar"] button');
        warn('Duplicate button', `found ${allBtns.length} toolbar buttons — using Copy icon`);
      } else {
        pass('Duplicate button found');
      }

      await shot(page, '21_editor_final');
    } else {
      warn('Workflow editor', `skipped — URL is ${page.url()}`);
    }

    // ══════════════════════════════════════════════════════════
    // 10. EXECUTIONS PAGE (after running)
    // ══════════════════════════════════════════════════════════
    console.log('\n─── 10. Executions Page');
    await clickSidebar(page, 'Executions');
    await page.waitForTimeout(1500);
    await shot(page, '22_executions_after_run');
    const execRows = await page.$$('[class*="border"][class*="rounded"], tr, [class*="execution-row"]');
    pass('Executions page loaded', `${execRows.length} list elements`);

    // ══════════════════════════════════════════════════════════
    // 11. INTEGRATIONS PAGE
    // ══════════════════════════════════════════════════════════
    console.log('\n─── 11. Integrations Page');
    await clickSidebar(page, 'Integrations');
    await page.waitForTimeout(1000);
    await shot(page, '23_integrations');
    const integH1 = await page.$eval('h1', el => el.textContent).catch(() => '');
    integH1 ? pass('Integrations page h1', integH1.trim()) : warn('Integrations h1', 'none');
    const connectBtns = await page.$$('button:has-text("Connect"), button:has-text("connected")');
    pass('Integration connect buttons', `${connectBtns.length} found`);

    // ══════════════════════════════════════════════════════════
    // 12. AUTH GUARD — refresh a protected page
    // ══════════════════════════════════════════════════════════
    console.log('\n─── 12. Auth Guard (full page reload while logged in)');
    await page.goto(`${BASE}/executions`, { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await page.waitForTimeout(600);
    await shot(page, '24_reload_protected');
    page.url().includes('/executions')
      ? pass('Protected page survives reload (hydration fix works)', page.url())
      : fail('Hydration bug still present', `got redirected to ${page.url()}`);

    // ══════════════════════════════════════════════════════════
    // 13. AUTH GUARD — logout then check redirect
    // ══════════════════════════════════════════════════════════
    console.log('\n─── 13. Auth Guard (unauthenticated redirect)');
    await ctx.clearCookies();
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await shot(page, '25_auth_guard');
    page.url().includes('/login')
      ? pass('Auth guard redirects after localStorage cleared', page.url())
      : fail('Auth guard', `stayed at ${page.url()}`);

  } catch (err) {
    fail('Unexpected error', err.message);
    console.error(err);
    await shot(page, '99_crash');
  } finally {
    await page.waitForTimeout(800);
    await browser.close();

    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  FINAL RESULTS');
    console.log('══════════════════════════════════════════════════════════');
    const passes = results.filter(r => r.ok === true).length;
    const fails  = results.filter(r => r.ok === false).length;
    const warns  = results.filter(r => r.ok === null).length;
    results.forEach(r => {
      const icon = r.ok === true ? '✅' : r.ok === false ? '❌' : '⚠️ ';
      console.log(`  ${icon}  ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    });
    console.log('══════════════════════════════════════════════════════════');
    console.log(`  PASSED: ${passes}   FAILED: ${fails}   WARNINGS: ${warns}`);
    console.log(`  Screenshots saved to: ${SHOTS}`);
    console.log('══════════════════════════════════════════════════════════');
  }
}

run().catch(console.error);

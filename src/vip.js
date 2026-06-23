const { chromium } = require('playwright');

async function launchBrowser(config) {
  return chromium.launch({
    headless: config.headless,
    slowMo: config.slowMoMs,
  });
}

async function login(page, config) {
  await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  if (page.url().includes('/u/login')) {
    await page.locator('input[name="username"]').fill(config.username);
    await page.locator('input[name="password"]').fill(config.password);
    const submit = page.locator('button[type="submit"],input[type="submit"]').first();
    if (await submit.count()) await submit.click();
    else await page.keyboard.press('Enter');
    await page.waitForTimeout(12000);
  }
}

async function goPatientList(page, config) {
  await page.goto(config.patientListUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(7000);
}

async function shadowText(page) {
  return page.evaluate(() => {
    const roots = Array.from(document.querySelectorAll('*'))
      .filter(el => el.shadowRoot)
      .map(el => el.shadowRoot);
    return roots.map(root => root.innerText || root.textContent || '').join('\n');
  }).catch(() => '');
}

async function findSearchInput(page) {
  const candidates = [
    page.locator('#patient-list input[type="search"]'),
    page.locator('#patient-list input[placeholder*="검색"]'),
    page.locator('#patient-list input[aria-label*="검색"]'),
    page.locator('#patient-list input'),
    page.locator('input[type="search"]'),
    page.locator('input[placeholder*="검색"]'),
    page.locator('input[aria-label*="검색"]'),
  ];
  for (const loc of candidates) {
    const count = await loc.count().catch(() => 0);
    for (let i = 0; i < Math.min(count, 12); i += 1) {
      const el = loc.nth(i);
      if (await el.isVisible().catch(() => false)) return el;
    }
  }
  return null;
}

async function clickExactTextByMouse(page, exactText) {
  const box = await page.evaluate((text) => {
    const roots = [document, ...Array.from(document.querySelectorAll('*')).filter(e => e.shadowRoot).map(e => e.shadowRoot)];
    for (const root of roots) {
      const els = Array.from(root.querySelectorAll('a,button,[role="button"],div,span,td'));
      const el = els.find(e => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim() === text && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0);
      if (el) {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }
    }
    return null;
  }, exactText).catch(() => null);
  if (!box) return false;
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  return true;
}

module.exports = { launchBrowser, login, goPatientList, shadowText, findSearchInput, clickExactTextByMouse };

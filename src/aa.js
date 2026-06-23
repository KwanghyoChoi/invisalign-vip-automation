const { launchBrowser, login, goPatientList, shadowText, findSearchInput, clickExactTextByMouse } = require('./vip');
const { normalizeSpaces, compactName } = require('./utils');

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function collectCandidateSummaries(page, options) {
  return page.evaluate(({ search, targetName, packageText }) => {
    const nameCompact = (targetName || search || '').replace(/\s+/g, '');
    const packageLower = (packageText || '').toLowerCase();
    const roots = [document, ...Array.from(document.querySelectorAll('*')).filter(e => e.shadowRoot).map(e => e.shadowRoot)];
    const out = [];
    for (const root of roots) {
      const nodes = Array.from(root.querySelectorAll('[data-testid="Card-patient"], tr, [role="row"], div'));
      for (const e of nodes) {
        const txt = (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim();
        const r = e.getBoundingClientRect();
        if (!txt || !r.width || !r.height || r.height < 20) continue;
        if (nameCompact && !txt.replace(/\s+/g, '').includes(nameCompact)) continue;
        if (packageLower && !txt.toLowerCase().includes(packageLower)) continue;
        if (!/Comprehensive|Invisalign|패키지|Package|Phase/i.test(txt)) continue;
        out.push({ text: txt.slice(0, 300), area: r.width * r.height, testid: e.getAttribute('data-testid') || '' });
      }
    }
    out.sort((a, b) => {
      const ap = a.testid === 'Card-patient' ? 0 : 1;
      const bp = b.testid === 'Card-patient' ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.area - b.area;
    });
    return out.slice(0, 8);
  }, options);
}

async function clickTreatmentMatch(page, options) {
  const box = await page.evaluate(({ search, targetName, packageText }) => {
    const nameCompact = (targetName || search || '').replace(/\s+/g, '');
    const packageLower = (packageText || '').toLowerCase();
    const roots = [document, ...Array.from(document.querySelectorAll('*')).filter(e => e.shadowRoot).map(e => e.shadowRoot)];
    const candidates = [];
    for (const root of roots) {
      const nodes = Array.from(root.querySelectorAll('[data-testid="Card-patient"], tr, [role="row"], div'));
      for (const e of nodes) {
        const txt = (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim();
        const txtCompact = txt.replace(/\s+/g, '');
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height || r.height < 20) continue;
        if (nameCompact && !txtCompact.includes(nameCompact)) continue;
        if (packageLower && !txt.toLowerCase().includes(packageLower)) continue;
        if (!/Comprehensive|Invisalign|패키지|Package|Phase/i.test(txt)) continue;
        candidates.push({ x: r.x, y: r.y, w: r.width, h: r.height, area: r.width * r.height, testid: e.getAttribute('data-testid') || '', text: txt.slice(0, 300) });
      }
    }
    candidates.sort((a, b) => {
      const ap = a.testid === 'Card-patient' ? 0 : 1;
      const bp = b.testid === 'Card-patient' ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.area - b.area;
    });
    return { count: candidates.length, hit: candidates[0] || null, previews: candidates.slice(0, 5).map(c => c.text) };
  }, options).catch(() => ({ count: 0, hit: null, previews: [] }));

  if (!box.hit) return box;
  await page.mouse.click(box.hit.x + Math.min(box.hit.w * 0.55, 520), box.hit.y + Math.min(box.hit.h / 2, 35));
  return box;
}

async function fillFirstTwoTextInputs(page, value) {
  let filled = 0;
  const inputs = page.locator('input');
  const count = await inputs.count().catch(() => 0);
  for (let i = 0; i < count; i += 1) {
    const el = inputs.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const type = (await el.getAttribute('type').catch(() => '')) || '';
    if (/hidden|radio|checkbox|search|password/i.test(type)) continue;
    const label = `${await el.getAttribute('placeholder').catch(() => '') || ''} ${await el.getAttribute('aria-label').catch(() => '') || ''} ${await el.getAttribute('name').catch(() => '') || ''}`;
    if (/검색|search|username|password/i.test(label)) continue;
    await el.fill(value);
    filled += 1;
    if (filled >= 2) return filled;
  }
  return filled;
}

async function startAdditionalAligners(config, options) {
  if (!options.search) throw new Error('Missing --search. Example: --search "지우" --name "김 지우" --package "Phase 2"');
  const dryRun = options.dryRun ?? config.aaDefaultDryRun;
  const browser = await launchBrowser(config);
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, locale: 'ko-KR' });
  try {
    await login(page, config);
    await goPatientList(page, config);
    const search = await findSearchInput(page);
    if (!search) throw new Error('Patient search input not found');
    await search.fill(options.search);
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(6000);

    const pageText = normalizeSpaces((await page.locator('body').innerText().catch(() => '')) + '\n' + (await shadowText(page)));
    const targetText = options.name || options.search;
    if (targetText && !compactName(pageText).includes(compactName(targetText))) {
      throw new Error('Target text not visible after search. Refine --search/--name.');
    }

    const candidates = await collectCandidateSummaries(page, { search: options.search, targetName: options.name || '', packageText: options.package || '' });
    if (dryRun) {
      return { dryRun: true, candidateCount: candidates.length, candidates: candidates.map(c => c.text) };
    }

    const clickResult = await clickTreatmentMatch(page, { search: options.search, targetName: options.name || '', packageText: options.package || '' });
    if (!clickResult.hit) throw new Error('Patient/treatment row click target not found. Use --name and/or --package to disambiguate.');
    await page.waitForTimeout(8000);

    if (!(await clickExactTextByMouse(page, '추가 교정장치(Additional Aligners)'))) {
      throw new Error('Additional Aligners link not found');
    }
    await page.waitForTimeout(8000);

    const formText = normalizeSpaces((await page.locator('body').innerText().catch(() => '')) + '\n' + (await shadowText(page)));
    const nums = [...formText.matchAll(/\(\s*1\s*[-–~]\s*(\d{1,3})\s*\)/g)].map(m => m[1]);
    const last = nums[0];
    if (!last) throw new Error('Aligner range not found');

    const filled = await fillFirstTwoTextInputs(page, last);
    if (filled < 2) throw new Error(`Expected two aligner inputs; filled ${filled}`);

    if (!(await clickExactTextByMouse(page, '다음'))) {
      const next = page.getByRole('button', { name: /다음|Next/i }).first();
      if (await next.count()) await next.click();
      else throw new Error('Next button not found');
    }
    await page.waitForTimeout(8000);
    const url = page.url();
    const formCreated = /formId=\d+/.test(url) && /formType=/.test(url);
    if (!formCreated) throw new Error('First Next clicked but form creation was not verified');
    return { dryRun: false, alignerLast: last, formCreated: true };
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { startAdditionalAligners, collectCandidateSummaries, fillFirstTwoTextInputs, escapeRegExp };

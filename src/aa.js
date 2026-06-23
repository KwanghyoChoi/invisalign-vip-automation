const { launchBrowser, login, goPatientList, shadowText, findSearchInput, clickExactTextByMouse } = require('./vip');
const { normalizeSpaces, compactName } = require('./utils');

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function collectCandidateSummaries(page, options) {
  const candidates = await page.evaluate(({ search, targetName, packageText }) => {
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
    return out;
  }, options);
  return normalizeCandidateList(candidates).slice(0, 8);
}

async function collectTreatmentClickCandidates(page, options) {
  return page.evaluate(({ search, targetName, packageText }) => {
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
    return candidates;
  }, options).catch(() => []);
}

function normalizeCandidateList(candidates) {
  const cardCandidates = candidates.filter(candidate => candidate.testid === 'Card-patient');
  const scoped = cardCandidates.length ? cardCandidates : candidates;
  const unique = [];
  const seen = new Set();
  for (const candidate of scoped) {
    const key = normalizeSpaces(candidate.text || '');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}

function assertSingleCandidate(candidates) {
  const unique = normalizeCandidateList(candidates);
  if (!unique.length) throw new Error('Patient/treatment row click target not found. Use --name and/or --package to disambiguate.');
  if (unique.length > 1) throw new Error(`Multiple matching patient/treatment candidates (${unique.length}). Refine --name and/or --package before using --confirm.`);
  return unique[0];
}

async function clickTreatmentCandidate(page, candidate) {
  await page.mouse.click(candidate.x + Math.min(candidate.w * 0.55, 520), candidate.y + Math.min(candidate.h / 2, 35));
}

function extractAlignerLastValues(formText) {
  const lines = normalizeSpaces(formText).split(/\n+/).map(line => line.trim()).filter(Boolean);
  const range = /\(\s*1\s*[-–~]\s*(\d{1,3})\s*\)/;
  const upper = lines.find(line => /상악|upper|maxillary/i.test(line) && range.test(line));
  const lower = lines.find(line => /하악|lower|mandibular/i.test(line) && range.test(line));
  if (upper && lower) return [upper.match(range)[1], lower.match(range)[1]];
  const nums = [...normalizeSpaces(formText).matchAll(/\(\s*1\s*[-–~]\s*(\d{1,3})\s*\)/g)].map(m => m[1]);
  if (nums.length >= 2) return nums.slice(0, 2);
  if (nums.length === 1) return [nums[0], nums[0]];
  return [];
}

function isAaFormCreated(url) {
  return /[?&]formId=\d+(?:&|$)/.test(url) && /[?&]formType=(?:A|ADDITIONAL_ALIGNERS[^&]*)(?:&|$)/.test(url);
}

function formatCandidatePreview(text, index, showPhi = false) {
  return showPhi ? text : `candidate-${index + 1}`;
}

function resolveStartDryRun(options) {
  return options.dryRun !== false;
}

function selectAlignerInputIndexes(descriptors) {
  const usable = descriptors.filter(input => {
    if (!input.visible) return false;
    if (/hidden|radio|checkbox|search|password/i.test(input.type || '')) return false;
    const text = `${input.label || ''} ${input.nearbyText || ''}`;
    const hasUpper = /상악|upper|maxillary/i.test(text);
    const hasLower = /하악|lower|mandibular/i.test(text);
    const isArchAligner = (hasUpper !== hasLower) && /얼라이너|aligner/i.test(text);
    if (!isArchAligner && /검색|search|username|password|제출\s*사유|reason/i.test(text)) return false;
    return /얼라이너|aligner/i.test(text);
  });
  const upper = usable.find(input => {
    const text = `${input.label || ''} ${input.nearbyText || ''}`;
    return /상악|upper|maxillary/i.test(text) && !/하악|lower|mandibular/i.test(text);
  });
  const lower = usable.find(input => {
    const text = `${input.label || ''} ${input.nearbyText || ''}`;
    return /하악|lower|mandibular/i.test(text) && !/상악|upper|maxillary/i.test(text);
  });
  if (upper && lower) return [upper.index, lower.index];
  return usable.slice(0, 2).map(input => input.index);
}

async function collectInputDescriptors(page) {
  const inputs = page.locator('input');
  const count = await inputs.count().catch(() => 0);
  const descriptors = [];
  for (let i = 0; i < count; i += 1) {
    const el = inputs.nth(i);
    const visible = await el.isVisible().catch(() => false);
    const type = (await el.getAttribute('type').catch(() => '')) || '';
    const attrs = `${await el.getAttribute('placeholder').catch(() => '') || ''} ${await el.getAttribute('aria-label').catch(() => '') || ''} ${await el.getAttribute('name').catch(() => '') || ''}`;
    const nearbyText = await el.evaluate(node => {
      const parts = [];
      let current = node;
      for (let depth = 0; current && depth < 4; depth += 1) {
        const text = (current.innerText || current.textContent || '').replace(/\s+/g, ' ').trim();
        if (text) parts.push(text);
        current = current.parentElement;
      }
      return parts.join(' ');
    }).catch(() => '');
    descriptors.push({ index: i, type, label: attrs, nearbyText, visible });
  }
  return descriptors;
}

async function fillAlignerInputs(page, value) {
  const values = Array.isArray(value) ? value : [value, value];
  const indexes = selectAlignerInputIndexes(await collectInputDescriptors(page));
  const inputs = page.locator('input');
  for (let i = 0; i < indexes.length && i < 2; i += 1) {
    await inputs.nth(indexes[i]).fill(values[Math.min(i, values.length - 1)]);
  }
  return Math.min(indexes.length, 2);
}

async function fillFirstTwoTextInputs(page, value) {
  const values = Array.isArray(value) ? value : [value, value];
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
    await el.fill(values[Math.min(filled, values.length - 1)]);
    filled += 1;
    if (filled >= 2) return filled;
  }
  return filled;
}

async function startAdditionalAligners(config, options) {
  if (!options.search) throw new Error('Missing --search. Example: --search "<given-name>" --name "<full-name>" --package "Phase 2"');
  const dryRun = resolveStartDryRun(options);
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

    const clickCandidates = await collectTreatmentClickCandidates(page, { search: options.search, targetName: options.name || '', packageText: options.package || '' });
    const clickTarget = assertSingleCandidate(clickCandidates);
    await clickTreatmentCandidate(page, clickTarget);
    await page.waitForTimeout(8000);

    if (!(await clickExactTextByMouse(page, '추가 교정장치(Additional Aligners)'))) {
      throw new Error('Additional Aligners link not found');
    }
    await page.waitForTimeout(8000);

    const formText = normalizeSpaces((await page.locator('body').innerText().catch(() => '')) + '\n' + (await shadowText(page)));
    const alignerLastValues = extractAlignerLastValues(formText);
    if (alignerLastValues.length < 2) throw new Error('Aligner range not found');

    const filled = await fillAlignerInputs(page, alignerLastValues);
    if (filled < 2) throw new Error(`Expected two aligner inputs; filled ${filled}`);

    if (!(await clickExactTextByMouse(page, '다음'))) {
      const next = page.getByRole('button', { name: /다음|Next/i }).first();
      if (await next.count()) await next.click();
      else throw new Error('Next button not found');
    }
    await page.waitForTimeout(8000);
    const url = page.url();
    const formCreated = isAaFormCreated(url);
    if (!formCreated) throw new Error('First Next clicked but form creation was not verified');
    return { dryRun: false, alignerLast: alignerLastValues.join('/'), formCreated: true };
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = {
  startAdditionalAligners,
  collectCandidateSummaries,
  collectTreatmentClickCandidates,
  assertSingleCandidate,
  extractAlignerLastValues,
  fillAlignerInputs,
  fillFirstTwoTextInputs,
  formatCandidatePreview,
  isAaFormCreated,
  normalizeCandidateList,
  resolveStartDryRun,
  selectAlignerInputIndexes,
  escapeRegExp,
};

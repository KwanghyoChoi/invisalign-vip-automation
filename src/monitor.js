const path = require('path');
const { launchBrowser, login } = require('./vip');
const { normalizeSpaces, readJson, writeJson, formatNow, signatureOf, idsFromSignature, redactPatient } = require('./utils');

async function isActionRequiredActive(page) {
  for (const frame of page.frames()) {
    try {
      const tab = frame.locator('#tab-action');
      if (await tab.count()) {
        const el = tab.first();
        const cls = (await el.getAttribute('class').catch(() => '')) || '';
        const ariaSelected = (await el.getAttribute('aria-selected').catch(() => '')) || '';
        if ((/\baction\b/.test(cls) && /\bactive\b/.test(cls)) || ariaSelected === 'true') return true;
      }
      const activeActionTag = frame.locator('[data-testid="Tag-tag-ACTION_REQUIRED"]');
      if (await activeActionTag.count()) {
        const label = normalizeSpaces(await activeActionTag.first().innerText().catch(() => ''));
        if (!label || /조치 요구됨|ACTION_REQUIRED/i.test(label)) return true;
      }
      const activeFilters = frame.locator('[data-testid="PLPage-activeFilters"], [data-testid="ActiveFiltersBar-root"]');
      if (await activeFilters.count()) {
        const label = normalizeSpaces(await activeFilters.first().innerText().catch(() => ''));
        if (/조치 요구됨|ACTION_REQUIRED/i.test(label)) return true;
      }
      const filterContainer = frame.locator('[data-testid="Filter-buttonContainer"]');
      if (await filterContainer.count()) {
        const label = normalizeSpaces(await filterContainer.first().innerText().catch(() => ''));
        if (/^\s*1\s*필터\b/.test(label) && /조치 요구됨|ACTION_REQUIRED/i.test(label)) return true;
      }
    } catch {
      // continue
    }
  }
  return false;
}

async function openActionRequiredFilter(page) {
  if (await isActionRequiredActive(page)) return;
  if (await page.locator('#tab-action').count()) {
    await page.locator('#tab-action').click();
    await page.waitForTimeout(3000);
    return;
  }
  if (await page.locator('[data-testid="Filter-buttonContainer"]').count()) {
    await page.locator('[data-testid="Filter-buttonContainer"] [data-testid="Button-button"]').click();
    await page.waitForTimeout(800);
    const actionOption = page.getByTestId('Filter-option-ACTION_REQUIRED');
    if (await actionOption.count()) {
      await actionOption.click();
      await page.waitForTimeout(3000);
    }
  }
}

async function readPatientCards(page) {
  const extract = async locator => locator.evaluateAll(cards => cards.map(card => {
    const text = (sel) => {
      const el = card.querySelector(sel);
      return (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();
    };
    const rawName = text('[data-testid="Patient-name"]');
    const idText = text('[data-testid="Patient-id"]');
    const idMatch = idText.match(/#(\d+)/);
    const statusParts = [
      text('[data-testid="Tracker-status"]'),
      text('[data-testid="TableColumns-treatment"]'),
      text('[data-testid="TableColumns-conditions"]'),
      text('[data-testid="TableColumns-notes"]'),
    ].filter(Boolean);
    return { name: rawName, id: idMatch ? idMatch[1] : '', status: Array.from(new Set(statusParts)).join(' / ') };
  }).filter(item => item.id || item.name));

  const directCards = page.locator('[data-testid="Card-patient"]');
  if (await directCards.count()) return extract(directCards);

  const shadowCards = await page.evaluate(() => {
    const host = Array.from(document.querySelectorAll('*')).find(el => el.shadowRoot && el.classList.contains('shadow-root-container'));
    if (!host || !host.shadowRoot) return [];
    return Array.from(host.shadowRoot.querySelectorAll('[data-testid="Card-patient"]')).map(card => {
      const text = (sel) => {
        const el = card.querySelector(sel);
        return (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();
      };
      const rawName = text('[data-testid="Patient-name"]');
      const idText = text('[data-testid="Patient-id"]');
      const idMatch = idText.match(/#(\d+)/);
      const statusParts = [text('[data-testid="Tracker-status"]'), text('[data-testid="TableColumns-treatment"]'), text('[data-testid="TableColumns-conditions"]'), text('[data-testid="TableColumns-notes"]')].filter(Boolean);
      return { name: rawName, id: idMatch ? idMatch[1] : '', status: Array.from(new Set(statusParts)).join(' / ') };
    }).filter(item => item.id || item.name);
  }).catch(() => []);
  if (shadowCards.length) return shadowCards;

  for (const frame of page.frames()) {
    try {
      const frameCards = await extract(frame.locator('[data-testid="Card-patient"]'));
      if (frameCards.length) return frameCards;
    } catch {
      // continue
    }
  }
  return [];
}

function parseClassicRows(rows) {
  const headerRow = rows.find(r => r.some(c => /환자|주문 상태|임상 상태|메모|사무소/.test(c)));
  const indexes = headerRow ? {
    patient: headerRow.findIndex(c => /환자/.test(c)),
    order: headerRow.findIndex(c => /주문 상태/.test(c)),
    memo: headerRow.findIndex(c => /메모/.test(c)),
    clinical: headerRow.findIndex(c => /임상 상태/.test(c)),
  } : {};
  const items = [];
  for (const row of rows) {
    if (!row || !row.length || row === headerRow) continue;
    const joined = row.join(' ');
    const patientCell = (indexes.patient >= 0 ? row[indexes.patient] : null) || row.find(cell => /#\d+/.test(cell) || /\(#\d+\)/.test(cell)) || '';
    const m = patientCell.match(/^(.+?)\s*\(#?(\d+)\)/s) || joined.match(/^(.+?)\s*#(\d+)/s);
    const idMatch = joined.match(/#(\d+)/) || patientCell.match(/#?(\d+)/);
    if (!idMatch) continue;
    const name = (m && m[1] ? m[1] : patientCell.replace(/#\d+.*$/, '').trim()).replace(/\s+/g, ' ').trim();
    const parts = [];
    for (const idx of [indexes.order, indexes.memo, indexes.clinical]) {
      if (typeof idx === 'number' && idx >= 0 && row[idx]) parts.push(normalizeSpaces(row[idx]));
    }
    items.push({ name, id: idMatch[1], status: parts.filter(Boolean).join(' / ') });
  }
  return items;
}

async function readClassicTable(page) {
  for (const frame of page.frames()) {
    try {
      const table = await frame.locator('table').evaluateAll(tables => {
        const cleaned = tables.map((tbl, index) => ({ index, rows: Array.from(tbl.querySelectorAll('tr')).map(tr => Array.from(tr.querySelectorAll('th,td')).map(c => (c.innerText || '').trim())) }));
        return cleaned.find(t => t.rows.some(r => r.includes('주문 상태') && r.includes('환자')) && t.rows.some(r => r.length > 1)) || cleaned.find(t => t.rows.some(r => r.length > 1)) || null;
      });
      if (table && table.rows && table.rows.length) return table.rows;
    } catch {
      // continue
    }
  }
  return null;
}

async function isEmptyActionRequiredResult(page) {
  for (const selector of ['[data-testid="EmptySearch-emptyText"]', '[data-testid="EmptySearch-container"]', '[data-testid="PLPage-body"]', '[data-testid="PatientList-root"]']) {
    const locator = page.locator(selector);
    if (await locator.count().catch(() => 0)) {
      const text = normalizeSpaces(await locator.first().innerText().catch(() => ''));
      if (/일치하는 환자를 찾을 수 없습니다|검색 또는 필터를 수정|No matching patients|No patients/i.test(text)) return true;
    }
  }
  return false;
}

function buildReport(items, state, previousSignature, config) {
  const previousIds = idsFromSignature(previousSignature);
  const reportItems = config.actionRequiredRedactPatients ? items.map(redactPatient) : items;
  const completed = items.filter(i => /처방전 완료/.test(i.status || '')).length;
  const review = items.filter(i => /(치료 계획 검토|클린체크 치료 계획 검토|ClinCheck 계획 검토|ClinCheck 치료 계획 검토)/i.test(i.status || '')).length;
  const added = reportItems.filter((item, index) => !previousIds.has(items[index].id));
  const lines = [];
  lines.push('[Invisalign VIP action-required]');
  lines.push(`- total: ${items.length}`);
  lines.push(`- prescription_completed: ${completed}`);
  lines.push(`- treatment_plan_review: ${review}`);
  lines.push(`- newly_added: ${added.length}${added.length ? ` — ${added.map(i => `${i.name} (#${i.id})`).join(', ')}` : ''}`);
  lines.push('');
  reportItems.forEach((item, index) => {
    const original = items[index];
    const meta = state.patients[original.id] || {};
    lines.push(`- ${item.name} (#${item.id})`);
    lines.push(`  status: ${item.status || ''}`);
    lines.push(`  first_seen: ${(meta.first_seen || '').slice(5)}`);
    lines.push('');
  });
  return lines.join('\n').trimEnd();
}

async function monitorActionRequired(config) {
  const statePath = path.join(config.stateDir, 'vip-action-required-tracker.json');
  const state = readJson(statePath, { patients: {}, last_reported_signature: '', last_run_at: null });
  const previousSignature = state.last_reported_signature || '';
  const browser = await launchBrowser(config);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, locale: 'ko-KR' });
  try {
    await login(page, config);
    await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(7000);
    await openActionRequiredFilter(page);
    if (!(await isActionRequiredActive(page))) throw new Error('Action-required filter is not active after navigation');

    let items = (await readPatientCards(page)).filter(item => item && item.id);
    if (!items.length) {
      const rows = await readClassicTable(page);
      if (rows) items = parseClassicRows(rows).filter(Boolean);
    }
    if (!items.length && !(await isEmptyActionRequiredResult(page))) throw new Error('No patients parsed from current UI');

    const currentSignature = signatureOf(items);
    const runAt = formatNow(config.timezone);
    state.last_run_at = runAt;
    const presentIds = new Set(items.map(item => item.id));
    for (const [id, patient] of Object.entries(state.patients || {})) {
      if (!presentIds.has(id)) state.patients[id] = { ...patient, present: false, last_absent_at: runAt };
    }
    for (const item of items) {
      const existing = state.patients[item.id];
      state.patients[item.id] = { ...(existing || {}), name: item.name, first_seen: existing?.first_seen || runAt, last_status: item.status, present: true, last_seen: runAt };
    }
    const changed = currentSignature !== previousSignature;
    state.last_reported_signature = currentSignature;
    writeJson(statePath, state);
    if (!items.length && !config.actionRequiredNotifyEmpty) return '';
    if (!changed) return '';
    return buildReport(items, state, previousSignature, config);
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { monitorActionRequired, parseClassicRows, buildReport, isActionRequiredActive };

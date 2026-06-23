const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSpaces, signatureOf, idsFromSignature, parseArgs, shellQuote } = require('../src/utils');
const { bool, int, makeConfig } = require('../src/config');
const { parseClassicRows, buildReport } = require('../src/monitor');
const { resolveAaDryRun } = require('../src/cli');
const {
  assertSingleCandidate,
  extractAlignerLastValues,
  formatCandidatePreview,
  isAaFormCreated,
  normalizeCandidateList,
  resolveStartDryRun,
  selectAlignerInputIndexes,
} = require('../src/aa');

test('normalizeSpaces collapses spaces and trims', () => {
  assert.equal(normalizeSpaces(' a\u00a0 b  \n\n c '), 'a b\nc');
});

test('signature and ids are stable', () => {
  const sig = signatureOf([{ id: '2', status: 'B' }, { id: '1', status: 'A' }]);
  assert.equal(sig, '1|A||2|B');
  assert.deepEqual([...idsFromSignature(sig)].sort(), ['1', '2']);
});

test('parseArgs supports flags and values', () => {
  assert.deepEqual(parseArgs(['--search', 'given', '--name=Sample Patient', '--confirm', 'extra']), {
    search: 'given',
    name: 'Sample Patient',
    confirm: true,
    _: ['extra'],
  });
});

test('bool and int parse env-like values', () => {
  assert.equal(bool('true'), true);
  assert.equal(bool('0'), false);
  assert.equal(bool('', true), true);
  assert.equal(int('42', 0), 42);
  assert.equal(int('x', 7), 7);
});

test('makeConfig lets process env override .env values', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vip-config-'));
  const envPath = path.join(dir, '.env');
  fs.writeFileSync(envPath, 'ACTION_REQUIRED_REDACT_PATIENTS=false\nHEADLESS=false\n');
  const config = makeConfig(envPath, {
    ACTION_REQUIRED_REDACT_PATIENTS: 'true',
    HEADLESS: 'true',
  });
  assert.equal(config.actionRequiredRedactPatients, true);
  assert.equal(config.headless, true);
});

test('aa:start stays dry-run unless --confirm is present', () => {
  assert.equal(resolveAaDryRun({}), true);
  assert.equal(resolveAaDryRun({ confirm: true }), false);
});

test('startAdditionalAligners defaults to dry-run for direct API calls', () => {
  assert.equal(resolveStartDryRun({}), true);
  assert.equal(resolveStartDryRun({ dryRun: true }), true);
  assert.equal(resolveStartDryRun({ dryRun: false }), false);
});

test('parseClassicRows extracts patient rows without fixed office data', () => {
  const rows = [
    ['환자', '치료', '임상 상태', '메모', '주문 상태'],
    ['Sample Patient (#123)', 'Comprehensive', 'ClinCheck 계획 검토', '', '조치 요구됨'],
  ];
  const out = parseClassicRows(rows);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, '123');
  assert.equal(out[0].name, 'Sample Patient');
  assert.match(out[0].status, /조치 요구됨|ClinCheck/);
});

test('parseClassicRows keeps status from legacy rows when headers are missing', () => {
  const rows = [
    ['Sample Patient (#123)', 'Comprehensive', 'ClinCheck 계획 검토', '조치 요구됨'],
  ];
  const out = parseClassicRows(rows);
  assert.equal(out.length, 1);
  assert.match(out[0].status, /Comprehensive/);
  assert.match(out[0].status, /ClinCheck/);
  assert.match(out[0].status, /조치 요구됨/);
});

test('buildReport redacts patients when configured', () => {
  const items = [{ id: '123', name: 'Real Name', status: '조치 요구됨' }];
  const state = { patients: { 123: { first_seen: '2026-01-02 03:04' } } };
  const report = buildReport(items, state, '', { actionRequiredRedactPatients: true });
  assert.match(report, /patient-1/);
  assert.doesNotMatch(report, /Real Name/);
  assert.doesNotMatch(report, /#123\)/);
});

test('extractAlignerLastValues returns separate upper and lower range ends', () => {
  const formText = [
    '상악 얼라이너 번호 (1-34)',
    '하악 얼라이너 번호 (1-24)',
  ].join('\n');
  assert.deepEqual(extractAlignerLastValues(formText), ['34', '24']);
});

test('isAaFormCreated requires AA formType', () => {
  assert.equal(isAaFormCreated('https://vip.invisalign.com/foo?formId=123&formType=A'), true);
  assert.equal(isAaFormCreated('https://vip.invisalign.com/additionalAligners.action?formId=123&formType=ADDITIONAL_ALIGNERS_INT_2_0'), true);
  assert.equal(isAaFormCreated('https://vip.invisalign.com/foo?formId=123&formType=ADDITION'), false);
});

test('assertSingleCandidate rejects ambiguous AA targets before clicking', () => {
  assert.throws(
    () => assertSingleCandidate([{ text: 'A' }, { text: 'B' }]),
    /Multiple matching patient\/treatment candidates/,
  );
  assert.throws(
    () => assertSingleCandidate([]),
    /Patient\/treatment row click target not found/,
  );
  assert.deepEqual(assertSingleCandidate([{ text: 'A' }]), { text: 'A' });
});

test('assertSingleCandidate prefers one patient card over nested matching containers', () => {
  const card = { testid: 'Card-patient', text: 'Sample Patient Comprehensive', area: 200 };
  const nested = { testid: '', text: 'Sample Patient Comprehensive', area: 1200 };
  assert.equal(assertSingleCandidate([nested, card]), card);
});

test('normalizeCandidateList de-duplicates nested dry-run candidates', () => {
  const card = { testid: 'Card-patient', text: 'Sample Patient Comprehensive', area: 200 };
  const nested = { testid: '', text: 'Sample Patient Comprehensive', area: 1200 };
  assert.deepEqual(normalizeCandidateList([nested, card]), [card]);
});

test('assertSingleCandidate rejects multiple patient cards', () => {
  assert.throws(
    () => assertSingleCandidate([
      { testid: 'Card-patient', text: 'Patient A Comprehensive', area: 200 },
      { testid: 'Card-patient', text: 'Patient B Comprehensive', area: 210 },
    ]),
    /Multiple matching patient\/treatment candidates/,
  );
});

test('selectAlignerInputIndexes targets upper and lower aligner inputs', () => {
  const descriptors = [
    { index: 0, type: 'text', label: '', nearbyText: '제출 사유 기타', visible: true },
    { index: 1, type: 'text', label: '', nearbyText: '상악 얼라이너 번호 (1-34)', visible: true },
    { index: 2, type: 'text', label: '', nearbyText: '하악 얼라이너 번호 (1-24)', visible: true },
  ];
  assert.deepEqual(selectAlignerInputIndexes(descriptors), [1, 2]);
});

test('selectAlignerInputIndexes keeps aligner fields when parent text includes reason text', () => {
  const descriptors = [
    { index: 1, type: 'text', label: '', nearbyText: '제출 사유 기타 상악 얼라이너 번호 (1-34)', visible: true },
    { index: 2, type: 'text', label: '', nearbyText: '제출 사유 기타 하악 얼라이너 번호 (1-24)', visible: true },
  ];
  assert.deepEqual(selectAlignerInputIndexes(descriptors), [1, 2]);
});

test('selectAlignerInputIndexes rejects reason input even if broad text includes aligner labels', () => {
  const descriptors = [
    { index: 0, type: 'text', label: '', nearbyText: '제출 사유 기타 상악 얼라이너 번호 (1-34) 하악 얼라이너 번호 (1-24)', visible: true },
    { index: 1, type: 'text', label: '', nearbyText: '상악 얼라이너 번호 (1-34)', visible: true },
    { index: 2, type: 'text', label: '', nearbyText: '하악 얼라이너 번호 (1-24)', visible: true },
  ];
  assert.deepEqual(selectAlignerInputIndexes(descriptors), [1, 2]);
});

test('formatCandidatePreview redacts PHI by default', () => {
  const line = formatCandidatePreview('Dummy Patient #00000 Comprehensive 치료 계획 검토', 0, false);
  assert.equal(line, 'candidate-1');
  const visible = formatCandidatePreview('Dummy Patient #00000 Comprehensive 치료 계획 검토', 0, true);
  assert.match(visible, /Dummy Patient/);
  assert.match(visible, /#00000/);
});

test('shellQuote quotes paths with spaces', () => {
  assert.equal(shellQuote('/tmp/a b'), "'/tmp/a b'");
});

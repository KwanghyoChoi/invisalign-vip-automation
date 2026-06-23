const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSpaces, signatureOf, idsFromSignature, parseArgs, shellQuote } = require('../src/utils');
const { bool, int } = require('../src/config');
const { parseClassicRows, buildReport } = require('../src/monitor');

test('normalizeSpaces collapses spaces and trims', () => {
  assert.equal(normalizeSpaces(' a\u00a0 b  \n\n c '), 'a b\nc');
});

test('signature and ids are stable', () => {
  const sig = signatureOf([{ id: '2', status: 'B' }, { id: '1', status: 'A' }]);
  assert.equal(sig, '1|A||2|B');
  assert.deepEqual([...idsFromSignature(sig)].sort(), ['1', '2']);
});

test('parseArgs supports flags and values', () => {
  assert.deepEqual(parseArgs(['--search', '지우', '--name=김 지우', '--confirm', 'extra']), {
    search: '지우',
    name: '김 지우',
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

test('buildReport redacts patients when configured', () => {
  const items = [{ id: '123', name: 'Real Name', status: '조치 요구됨' }];
  const state = { patients: { 123: { first_seen: '2026-01-02 03:04' } } };
  const report = buildReport(items, state, '', { actionRequiredRedactPatients: true });
  assert.match(report, /patient-1/);
  assert.doesNotMatch(report, /Real Name/);
  assert.doesNotMatch(report, /#123\)/);
});

test('shellQuote quotes paths with spaces', () => {
  assert.equal(shellQuote('/tmp/a b'), "'/tmp/a b'");
});

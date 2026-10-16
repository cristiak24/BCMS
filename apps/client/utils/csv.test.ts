import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from './csv';

test('a cell that would run as a formula stays text', () => {
  assert.equal(csvCell('=HYPERLINK("http://evil.test","Click")'), `"'=HYPERLINK(""http://evil.test"",""Click"")"`);
  assert.equal(csvCell('+40 cmd'), "'+40 cmd");
  assert.equal(csvCell('-2+3+cmd|"/C calc"!A0'), `"'-2+3+cmd|""/C calc""!A0"`);
  assert.equal(csvCell('@SUM(A1:A2)'), "'@SUM(A1:A2)");
  assert.equal(csvCell('\t=1+1'), "'\t=1+1");
  assert.equal(csvCell('\r=1+1'), `"'\r=1+1"`);
});

test('ordinary values and plain numbers are unchanged', () => {
  assert.equal(csvCell('Matei Pop'), 'Matei Pop');
  assert.equal(csvCell(-150), '-150');
  assert.equal(csvCell('-150'), '-150');
  assert.equal(csvCell('+40.5'), '+40.5');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell('a; b', ';'), '"a; b"');
  assert.equal(csvCell('Ion "Nelu"'), '"Ion ""Nelu"""');
});

test('a whole file keeps the separator and neutralises every cell', () => {
  assert.equal(toCsv([['Nume', 'Suma'], ['=1+1', 150]], ';', '\r\n'), "Nume;Suma\r\n'=1+1;150");
});

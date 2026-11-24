
/**
 * TimeSeries Lab
 * csv.test.js
 *
 * CSV解析モジュールの自動テスト
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseCSV } from '../js/csv.js';


/**
 * テスト1
 * 複数列・数値列・時刻列の取得
 */
test('multiple columns and numeric/time hints', () => {

  const d = parseCSV(
    'time_s,A,B\n0,1,2\n1,3,4'
  );

  assert.deepEqual(
    d.numericColumns,
    ['time_s', 'A', 'B']
  );

  assert.deepEqual(
    d.timeCandidates,
    ['time_s']
  );

  assert.deepEqual(
    d.columns[1].values,
    [1, 3]
  );
});


/**
 * テスト2
 * BOM・CRLF・空白行・欠損値への対応
 */
test('BOM, CRLF, blank lines and missing cells', () => {

  const d = parseCSV(
    '\uFEFFtime,A,B\r\n0,,0\r\n\r\n1,2,3\r\n'
  );

  assert.equal(d.rowCount, 2);

  assert.deepEqual(
    d.columns[1].values,
    [null, 2]
  );

  assert.equal(
    d.columns[1].missingCount,
    1
  );

  assert.deepEqual(
    d.columns[2].values,
    [0, 3]
  );
});


/**
 * テスト3
 * 引用符・エスケープ・複数行文字列
 */
test('quotes, escaped quotes and multiline text', () => {

  const d = parseCSV(
    'time,"A,B",note\n0,2,"a""b\r\nc"'
  );

  assert.deepEqual(
    d.headers,
    ['time', 'A,B', 'note']
  );

  assert.equal(
    d.columns[2].values[0],
    'a"b\r\nc'
  );
});


/**
 * テスト4
 * タブ・セミコロン区切りの自動判定
 */
test('tab and semicolon auto-detection', () => {

  for (const delimiter of ['\t', ';']) {

    const d = parseCSV(
      `time${delimiter}x\n0${delimiter}1`
    );

    assert.equal(
      d.delimiter,
      delimiter
    );

    assert.equal(
      d.columns[1].values[0],
      1
    );
  }
});


/**
 * テスト5
 * 数値列・文字列・混合列・空列の分類
 */
test('numeric formats, text, mixed and empty columns', () => {

  const d = parseCSV(
    'x,y,z,w\n-1e-3,01,hello,\n+.5,abc,world,'
  );

  assert.deepEqual(
    d.columns.map(column => column.type),
    ['number', 'mixed', 'text', 'empty']
  );

  assert.deepEqual(
    d.columns[0].values,
    [-0.001, 0.5]
  );

  assert.deepEqual(
    d.columns[1].values,
    ['01', 'abc']
  );
});


/**
 * テスト6
 * 不正な数値を勝手に変換しない
 */
test('nonfinite and nondecimal literals are not silently converted', () => {

  const d = parseCSV(
    'x\nInfinity\n0xFF\n1e999\nNaN'
  );

  assert.equal(
    d.columns[0].type,
    'text'
  );
});


/**
 * テスト7
 * 不正なCSV構文の検出
 */
test('invalid headers and malformed rows fail', () => {

  const invalidSamples = [

    // 空ファイル
    '',

    // 重複した列名
    'a,a\n1,2',

    // 空の列名
    'a,\n1,2',

    // 列数不足
    'a,b\n1',

    // 列数超過
    'a,b\n1,2,3',

    // 引用符が閉じていない
    'a,b\n1,"2',

    // 閉じ引用符の後に不正な文字
    'a,b\n1,"2"x',

    // 引用符の位置が不正
    'a,b\n1,a"b'
  ];

  for (const sample of invalidSamples) {

    assert.throws(
      () => parseCSV(sample)
    );
  }
});


/**
 * テスト8
 * 区切り文字が曖昧な場合の処理
 */
test('ambiguous delimiter requires manual selection', () => {

  assert.throws(

    () => parseCSV(
      'a,b;c\n1,2;3'
    ),

    /曖昧/
  );

  const d = parseCSV(
    'a,b;c\n1,2;3',
    { delimiter: ',' }
  );

  assert.deepEqual(
    d.headers,
    ['a', 'b;c']
  );
});


/**
 * テスト9
 * 引用符付きの空セルを保持する
 */
test('explicitly quoted missing single cell is retained', () => {

  const d = parseCSV(
    'x\n""\n2'
  );

  assert.deepEqual(
    d.columns[0].values,
    [null, 2]
  );
});


/**
 * テスト10
 * 任意の列数への対応
 *
 * 36列のCSVデータを生成して検証する。
 */
test('arbitrary number of columns', () => {

  const headers = Array.from(
    { length: 36 },
    (_, i) => `c${i}`
  );

  const values = headers.map(
    (_, i) => i
  );

  const csvText =
    headers.join(',') +
    '\n' +
    values.join(',');

  const d = parseCSV(csvText);

  assert.equal(
    d.columns.length,
    36
  );

  assert.equal(
    d.columns[35].values[0],
    35
  );
});


/**
 * テスト11
 * 既存の人工サンプルデータを解析する
 */
test('existing synthetic sample', () => {

  const text = readFileSync(

    new URL(
      '../samples/environment.csv',
      import.meta.url
    ),

    'utf8'
  );

  const d = parseCSV(text);

  assert.equal(
    d.numericColumns.length,
    4
  );

  assert.ok(
    d.rowCount > 0
  );
});

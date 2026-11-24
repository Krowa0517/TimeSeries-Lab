
import { test } from 'node:test';

import assert from 'node:assert/strict';

import {

  summarize,

  compareErrors,

  rangeIndices

} from '../js/statistics.js';


// 浮動小数点数を比較するための補助関数
const near = (actual, expected) => {

  assert.ok(
    Math.abs(actual - expected) < 1e-10
  );
};


// テスト1
// 基本統計量と四分位数
test('basic statistics and linear quantiles', () => {

  const values = Object.freeze(
    [4, 1, 3, 2]
  );

  const s = summarize(values);

  assert.equal(s.count, 4);

  assert.equal(s.mean, 2.5);

  assert.equal(s.median, 2.5);

  assert.equal(s.min, 1);

  assert.equal(s.max, 4);

  assert.equal(s.range, 3);

  near(s.variance, 1.25);

  near(s.stdDev, Math.sqrt(1.25));

  assert.equal(s.q1, 1.75);

  assert.equal(s.q3, 3.25);
});


// テスト2
// 欠損値と0を区別する
test('missing values and zero are distinct', () => {

  const s = summarize(
    [0, null, 2, null]
  );

  assert.equal(s.validCount, 2);

  assert.equal(s.missingCount, 2);

  assert.equal(s.missingRate, 0.5);

  assert.equal(s.mean, 1);
});


// テスト3
// 空配列と全欠損データ
test('empty and all missing columns', () => {

  assert.equal(
    summarize([]).missingRate,
    null
  );

  const s = summarize([null, null]);

  assert.equal(s.missingRate, 1);

  assert.equal(s.mean, null);

  assert.equal(s.stdDev, null);
});


// テスト4
// 単一データと定数データ
test('single sample and constant values', () => {

  assert.equal(
    summarize([8]).variance,
    0
  );

  assert.equal(
    summarize([5, 5, 5]).stdDev,
    0
  );
});


// テスト5
// 欠損値を含む誤差分析
test('paired errors exclude missing pairs', () => {

  const e = compareErrors(

    [2, 4, null, 8],

    [1, 6, 3, null]
  );

  assert.equal(e.validCount, 2);

  assert.equal(e.excludedCount, 2);

  near(e.meanError, -0.5);

  near(e.mae, 1.5);

  near(e.mse, 2.5);

  near(e.rmse, Math.sqrt(2.5));
});


// テスト6
// 一定の基準値との誤差分析
test('constant reference and no valid pairs', () => {

  const e = compareErrors(

    [1, 3, null],

    2
  );

  assert.equal(e.meanError, 0);

  assert.equal(e.mae, 1);

  assert.equal(e.rmse, 1);

  assert.equal(

    compareErrors([null], 2).mae,

    null
  );
});


// テスト7
// 不等間隔の時刻における範囲検索
test('inclusive range on irregular timestamps', () => {

  const x = [

    0,

    0.01,

    0.025,

    0.04
  ];


  assert.deepEqual(

    rangeIndices(x, 0.01, 0.025),

    [1, 3]
  );


  assert.deepEqual(

    rangeIndices(x, 0.011, 0.024),

    [2, 2]
  );


  assert.deepEqual(

    rangeIndices(x, 1, 2),

    [4, 4]
  );
});


// テスト8
// 不正なデータを拒否する
test('invalid values and ranges rejected', () => {

  assert.throws(
    () => summarize([NaN])
  );

  assert.throws(
    () => summarize([1, '2'])
  );

  assert.throws(
    () => compareErrors([1, 2], [1])
  );

  assert.throws(
    () => compareErrors([1], Infinity)
  );

  assert.throws(
    () => rangeIndices([0, 1], 1, 0)
  );

  assert.throws(
    () => summarize([

      Number.MAX_VALUE,

      -Number.MAX_VALUE

    ])
  );
});

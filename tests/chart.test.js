
import { test } from 'node:test';

import assert from 'node:assert/strict';

import {

  lowerBound,

  nearestIndex,

  normalizeValues

} from '../js/chart.js';


// テスト1
// 二分探索が正常に動作するか
test('binary search on irregular timestamps', () => {

  assert.equal(

    lowerBound(
      [0, 0.01, 0.025],
      0.02
    ),

    2
  );
});


// テスト2
// 最も近い測定時刻を取得できるか
test('nearest sample search', () => {

  assert.equal(

    nearestIndex(
      [0, 0.01, 0.025],
      0.02
    ),

    2
  );


  // 同距離の場合は前の測定点を選ぶ
  assert.equal(

    nearestIndex(
      [0, 2],
      1
    ),

    0
  );


  // 空配列への対応
  assert.equal(

    nearestIndex([], 1),

    -1
  );
});


// テスト3
// 欠損値を保持したまま正規化できるか
test('Min-Max normalization preserves missing values', () => {

  assert.deepEqual(

    normalizeValues(
      [10, null, 20, 30]
    ),

    [0, null, 0.5, 1]
  );
});


// テスト4
// 例外的なデータの正規化
test('constant, missing and extreme values', () => {

  // すべて同じ値
  assert.deepEqual(

    normalizeValues(
      [5, 5, null]
    ),

    [0, 0, null]
  );


  // すべて欠損値
  assert.deepEqual(

    normalizeValues(
      [null, null]
    ),

    [null, null]
  );


  // 極端に大きな数値
  assert.deepEqual(

    normalizeValues([

      -Number.MAX_VALUE,

      0,

      Number.MAX_VALUE

    ]),

    [0, 0.5, 1]
  );
});

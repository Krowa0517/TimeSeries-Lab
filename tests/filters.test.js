
import { test } from 'node:test';

import assert from 'node:assert/strict';

import {

  movingAverage,

  medianFilter,

  exponentialMovingAverage,

  applyFilter

} from '../js/filters.js';


// テスト1
// 後方移動平均
test('trailing SMA', () => {

  assert.deepEqual(

    movingAverage(
      [1, 2, 3, 4, 5],
      3
    ),

    [null, null, 2, 3, 4]
  );
});


// テスト2
// 中央移動平均
test('centered SMA', () => {

  assert.deepEqual(

    movingAverage(
      [1, 2, 3, 4, 5],
      3,
      'center'
    ),

    [null, 2, 3, 4, null]
  );
});


// テスト3
// 中央値フィルタによる外れ値除去
test('median rejects spike', () => {

  assert.deepEqual(

    medianFilter(
      [1, 2, 100, 3, 4],
      3,
      'center'
    ),

    [null, 2, 3, 4, null]
  );
});


// テスト4
// 偶数の窓幅による中央値
test('even trailing median', () => {

  assert.deepEqual(

    medianFilter(
      [1, 4, 2],
      2
    ),

    [null, 2.5, 3]
  );
});


// テスト5
// 欠損値を含む窓
test('windows containing null are missing', () => {

  for (
    const filter of [
      movingAverage,
      medianFilter
    ]
  ) {

    assert.deepEqual(

      filter(
        [1, 2, null, 4, 5, 6],
        3
      ),

      [null, null, null, null, null, 5]
    );
  }
});


// テスト6
// EMAの計算と欠損値でのリセット
test('EMA resets at missing values', () => {

  assert.deepEqual(

    exponentialMovingAverage(
      [2, 6, null, 10, 14],
      0.5
    ),

    [2, 4, null, 10, 12]
  );
});


// テスト7
// 窓幅1またはα=1の場合
test('identity filters preserve zero and null', () => {

  const values =
    Object.freeze([0, null, -2]);


  for (
    const filter of [

      movingAverage,

      medianFilter,

      exponentialMovingAverage
    ]
  ) {

    assert.deepEqual(

      filter(values, 1),

      values
    );
  }
});


// テスト8
// 空配列と窓幅より短いデータ
test('empty and short arrays', () => {

  assert.deepEqual(

    movingAverage([], 3),

    []
  );


  assert.deepEqual(

    medianFilter([1, 2], 3),

    [null, null]
  );


  assert.deepEqual(

    exponentialMovingAverage([], 0.5),

    []
  );
});


// テスト9
// 不正な設定値やデータの検出
test('invalid parameters and data', () => {

  assert.throws(

    () => movingAverage([1], 0)
  );


  assert.throws(

    () => movingAverage([1], 2, 'center')
  );


  assert.throws(

    () => medianFilter([1], 1, 'forward')
  );


  assert.throws(

    () => exponentialMovingAverage([1], 0)
  );


  assert.throws(

    () => exponentialMovingAverage([1], 1.1)
  );


  assert.throws(

    () => movingAverage([NaN], 1)
  );


  assert.throws(

    () => medianFilter([undefined], 1)
  );


  assert.throws(

    () => movingAverage([

      Number.MAX_VALUE,

      Number.MAX_VALUE

    ], 2)
  );
});


// テスト10
// 共通インターフェースと元データの保持
test('dispatcher and original data protection', () => {

  const values =
    Object.freeze([1, 3, 5]);


  assert.deepEqual(

    applyFilter(values, {

      method: 'ema',

      alpha: 0.5
    }),

    [1, 2, 3.5]
  );


  assert.deepEqual(

    applyFilter(values, {

      method: 'median',

      size: 3
    }),

    [null, null, 3]
  );


  assert.deepEqual(

    applyFilter(values, {

      method: 'sma',

      size: 2
    }),

    [null, 2, 4]
  );


  assert.throws(

    () => applyFilter(values, {

      method: 'unknown'
    })
  );


  assert.deepEqual(

    values,

    [1, 3, 5]
  );
});

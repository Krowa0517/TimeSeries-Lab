import { test } from "node:test";

import assert from "node:assert/strict";

import {
  difference,
  derivative,
  absoluteValues,
  constantOperation,
  columnOperation,
  vectorMagnitude,
  minMaxNormalize,
  zScore,
} from "../js/transforms.js";

// 浮動小数点数の比較
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10);

// テスト1：Nサンプル差分
test("N-sample difference", () => {
  assert.deepEqual(
    difference(Object.freeze([1, 3, 6, 10]), 2),

    [null, null, 5, 7],
  );

  assert.deepEqual(
    difference([1, 2], 3),

    [null, null],
  );
});

// テスト2：不等間隔の時間微分
test("derivative with irregular times", () => {
  assert.deepEqual(
    derivative(
      [0, 2, 8, 14],

      [0, 1, 4, 7],

      2,
    ),

    [null, null, 2, 2],
  );
});

// テスト3：欠損区間
test("missing intervals", () => {
  assert.deepEqual(
    difference([1, null, 3, 5, 7], 2),

    [null, null, null, null, 4],
  );

  assert.deepEqual(
    derivative(
      [1, null, 3],

      [0, 1, 2],

      2,
    ),

    [null, null, null],
  );
});

// テスト4：絶対値・定数演算
test("absolute and constant operations", () => {
  assert.deepEqual(
    absoluteValues([-2, 0, null]),

    [2, 0, null],
  );

  assert.deepEqual(
    constantOperation([1, null, 3], "add", 2),

    [3, null, 5],
  );

  assert.deepEqual(
    constantOperation([1, 3], "subtract", 2),

    [-1, 1],
  );

  assert.deepEqual(
    constantOperation([1, 3], "multiply", 2),

    [2, 6],
  );

  assert.deepEqual(
    constantOperation([2, 6], "divide", 2),

    [1, 3],
  );
});

// テスト5：項目間演算・0除算
test("column operations and zero division", () => {
  const a = [4, 6, null];

  const b = [2, 0, 1];

  assert.deepEqual(
    columnOperation(a, b, "add"),

    [6, 6, null],
  );

  assert.deepEqual(
    columnOperation(a, b, "subtract"),

    [2, 6, null],
  );

  assert.deepEqual(
    columnOperation(a, b, "multiply"),

    [8, 0, null],
  );

  assert.deepEqual(
    columnOperation(a, b, "divide"),

    [2, null, null],
  );
});

// テスト6：ベクトルの大きさ
test("vector magnitude", () => {
  const result = vectorMagnitude([
    [3, null, 0],

    [4, 2, 0],

    [12, 1, 0],
  ]);

  near(result[0], 13);

  assert.deepEqual(
    result.slice(1),

    [null, 0],
  );
});

// テスト7：Min-Max正規化
test("Min-Max normalization", () => {
  assert.deepEqual(
    minMaxNormalize([10, null, 20, 30]),

    [0, null, 0.5, 1],
  );

  assert.deepEqual(
    minMaxNormalize([-Number.MAX_VALUE, 0, Number.MAX_VALUE]),

    [0, 0.5, 1],
  );
});

// テスト8：Z-score標準化
test("Z-score population variance", () => {
  const z = zScore([1, 2, 3, null]);

  near(z[0], -Math.sqrt(1.5));

  near(z[1], 0);

  near(z[2], Math.sqrt(1.5));

  assert.equal(z[3], null);
});

// テスト9：定数・空配列
test("constant and empty inputs", () => {
  for (const fn of [minMaxNormalize, zScore]) {
    assert.deepEqual(
      fn([5, 5, null]),

      [0, 0, null],
    );

    assert.deepEqual(
      fn([null]),

      [null],
    );

    assert.deepEqual(
      fn([]),

      [],
    );
  }
});

// テスト10：不正な設定値
test("invalid parameters", () => {
  assert.throws(() => difference([1], 0));

  assert.throws(() => derivative([1, 2], [0, 0]));

  assert.throws(() => derivative([1, 2], [0]));

  assert.throws(() => constantOperation([1], "divide", 0));

  assert.throws(() => columnOperation([1], [1, 2], "add"));

  assert.throws(() => vectorMagnitude([[1]]));

  assert.throws(() => absoluteValues([NaN]));

  assert.throws(() =>
    constantOperation(
      [Number.MAX_VALUE],

      "multiply",

      2,
    ),
  );
});

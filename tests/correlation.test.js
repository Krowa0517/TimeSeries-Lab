import { test } from "node:test";

import assert from "node:assert/strict";

import {
  pairedValues,
  correlation,
  correlationMatrix,
} from "../js/correlation.js";

// 浮動小数点数の比較
const near = (a, b) => {
  assert.ok(Number.isFinite(a));

  assert.ok(Math.abs(a - b) < 1e-10);
};

// テスト1：正・負のPearson相関
test("positive and negative Pearson", () => {
  near(correlation([1, 2, 3], [2, 4, 6]).r, 1);

  near(correlation([1, 2, 3], [6, 4, 2]).r, -1);
});

// テスト2：相関係数0
test("zero correlation is not missing", () => {
  near(correlation([-2, -1, 0, 1, 2], [4, 1, 0, 1, 4]).r, 0);
});

// テスト3：欠損値の組単位除外
test("paired missing values", () => {
  const a = [1, null, 3, 4];

  const b = [2, 8, null, 8];

  assert.deepEqual(pairedValues(a, b), {
    x: [1, 4],
    y: [2, 8],
    count: 4,
    validCount: 2,
  });

  const result = correlation(a, b);

  near(result.r, 1);

  assert.equal(result.excludedCount, 2);
});

// テスト4：算出不能な相関係数
test("undefined correlation", () => {
  for (const method of ["pearson", "spearman"]) {
    assert.equal(correlation([1, 1, 1], [1, 2, 3], method).r, null);

    assert.equal(correlation([null, 1], [1, 2], method).r, null);

    assert.equal(correlation([], [], method).r, null);
  }
});

// テスト5：非線形の単調関係
test("Spearman nonlinear monotonic", () => {
  near(correlation([1, 2, 3, 4], [1, 4, 9, 16], "spearman").r, 1);

  assert.ok(correlation([1, 2, 3, 4], [1, 4, 9, 16]).r < 0.99);
});

// テスト6：同順位と欠損値への対応
test("Spearman ties and pairwise ranking", () => {
  near(correlation([1, 1, 2], [1, 2, 3], "spearman").r, Math.sqrt(3) / 2);

  near(correlation([1, null, 2, 3], [2, 1, 4, 6], "spearman").r, 1);
});

// テスト7：相関行列の対称性
test("symmetric matrix and constant diagonal", () => {
  const { names, matrix } = correlationMatrix([
    { name: "A", values: [1, 2, 3] },

    { name: "B", values: [3, 2, 1] },

    { name: "C", values: [5, 5, 5] },
  ]);

  assert.deepEqual(names, ["A", "B", "C"]);

  near(matrix[0][0].r, 1);

  near(matrix[0][1].r, -1);

  assert.deepEqual(matrix[0][1], matrix[1][0]);

  assert.equal(matrix[2][2].r, null);
});

// テスト8：極端な数値と元データの保護
test("large values and input protection", () => {
  const a = Object.freeze([-Number.MAX_VALUE, 0, Number.MAX_VALUE]);

  near(correlation(a, [-1, 0, 1]).r, 1);

  assert.deepEqual(a, [-Number.MAX_VALUE, 0, Number.MAX_VALUE]);
});

// テスト9：不正な入力値
test("invalid input", () => {
  assert.throws(() => correlation([1], [1, 2]));

  assert.throws(() => correlation([NaN], [1]));

  assert.throws(() => correlation([1], [1], "unknown"));

  assert.throws(() => correlationMatrix([]));
});

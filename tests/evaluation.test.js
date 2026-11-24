import { test } from "node:test";

import assert from "node:assert/strict";

import {
  measure,
  compareOnCommonRows,
  scorePeaks,
  evaluateAccuracy,
  benchmarkCase,
} from "../js/evaluation.js";

// テスト1：ウォームアップと複数回計測
test("warm-up and repeated timing", () => {
  let calls = 0;

  const r = measure(() => {
    calls++;
  }, 4);

  assert.equal(calls, 5);

  assert.equal(r.timesMs.length, 4);

  assert.ok(r.minMs <= r.medianMs && r.medianMs <= r.maxMs);
});

// テスト2：共通区間による公平な比較
test("fair comparison uses identical valid rows", () => {
  const r = compareOnCommonRows(
    [1, 2, 3, 4],

    {
      Raw: [1, 3, 2, 4],

      Filter: [null, 2, 3, null],
    },
  );

  assert.equal(r[0].validCount, 2);

  assert.equal(r[0].mae, 1);

  assert.equal(r[1].mae, 0);
});

// テスト3：共通の有効値が存在しない場合
test("empty common rows", () => {
  const r = compareOnCommonRows(
    [1],

    { A: [null] },
  );

  assert.equal(r[0].mae, null);
});

// テスト4：ピークの重複対応防止
test("peak matching does not reuse detections", () => {
  const r = scorePeaks(
    [1, 2, 3],

    [1.01, 1.02, 3],

    0.05,
  );

  assert.deepEqual(
    [r.tp, r.fp, r.fn],

    [2, 1, 1],
  );

  assert.equal(r.f1, 2 / 3);
});

// テスト5：ピークが存在しない場合
test("empty peak sets", () => {
  assert.equal(scorePeaks([], []).f1, null);

  assert.equal(scorePeaks([1], []).recall, 0);

  assert.equal(scorePeaks([], [1]).f1, 0);
});

// テスト6：再現性と理論値との一致
test("accuracy is reproducible and ideal cases are correct", () => {
  const r = evaluateAccuracy();

  assert.deepEqual(r, evaluateAccuracy());

  assert.ok(r.filters.every((f) => f.validCount === 497));

  assert.ok(r.differentiation.rmse < 1e-10);

  assert.equal(r.peaks.f1, 1);

  assert.ok(Math.abs(r.correlation.pearson + 1) < 1e-10);

  assert.ok(Math.abs(r.correlation.spearman - 1) < 1e-10);
});

// テスト7：ベンチマークの結果
test("small benchmark returns finite timing records", () => {
  const r = benchmarkCase(30, 2, 2);

  assert.equal(r.length, 8);

  assert.ok(
    r.every((v) => Number.isFinite(v.medianMs) && v.timesMs.length === 2),
  );
});

// テスト8：不正な入力値
test("invalid limits rejected", () => {
  assert.throws(() => measure(() => {}, 0));

  assert.throws(() => benchmarkCase(100000, 40));

  assert.throws(() => scorePeaks([1], [1], -1));

  assert.throws(() => compareOnCommonRows([1], { A: [] }));
});

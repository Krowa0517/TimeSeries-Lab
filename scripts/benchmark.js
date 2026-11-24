import { mkdir, writeFile } from "node:fs/promises";

import os from "node:os";

import { evaluateAccuracy, benchmarkCase } from "../js/evaluation.js";

import { toCSV } from "../js/export.js";

/* ========================================
   評価条件
======================================== */

const cases = [
  [1000, 4],

  [10000, 4],

  [100000, 4],

  [1000, 36],

  [10000, 36],
];

/* ========================================
   精度評価
======================================== */

const accuracy = evaluateAccuracy();

/* ========================================
   処理性能の評価
======================================== */

const timings = [];

for (const [rows, columns] of cases) {
  console.log(`Measuring ${rows} rows / ${columns} signals ...`);

  timings.push(...benchmarkCase(rows, columns, 5));
}

/* ========================================
   実行環境と結果の記録
======================================== */

const report = {
  measuredAt: new Date().toISOString(),

  environment: {
    node: process.version,

    platform: process.platform,

    arch: process.arch,

    cpu: os.cpus()[0]?.model ?? "unknown",

    logicalCpus: os.cpus().length,
  },

  accuracy,

  timings,
};

/* ========================================
   ファイル出力
======================================== */

const dir = new URL("../reports/", import.meta.url);

await mkdir(dir, { recursive: true });

// JSON形式
await writeFile(
  new URL("evaluation.json", dir),

  JSON.stringify(report, null, 2),
);

// CSV形式
await writeFile(
  new URL("benchmark.csv", dir),

  toCSV(
    [
      "rows",
      "signals",
      "operation",
      "repeats",
      "median_ms",
      "min_ms",
      "max_ms",
    ],

    timings.map((t) => [
      t.rows,

      t.columns,

      t.operation,

      t.repeats,

      t.medianMs,

      t.minMs,

      t.maxMs,
    ]),
  ),
);

/* ========================================
   ターミナルへの結果表示
======================================== */

console.table(
  accuracy.filters.map((f) => ({
    method: f.method,

    n: f.validCount,

    MAE: f.mae,

    RMSE: f.rmse,
  })),
);

console.table(
  timings.map((t) => ({
    rows: t.rows,

    signals: t.columns,

    operation: t.operation,

    median_ms: +t.medianMs.toFixed(3),
  })),
);

console.log("Saved reports/evaluation.json and reports/benchmark.csv");

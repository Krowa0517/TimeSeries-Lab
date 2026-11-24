import { parseCSV } from "./csv.js";

import { summarize, compareErrors } from "./statistics.js";

import {
  movingAverage,
  medianFilter,
  exponentialMovingAverage,
} from "./filters.js";

import { derivative } from "./transforms.js";

import { detectPeaks } from "./peaks.js";

import { correlation, correlationMatrix } from "./correlation.js";

import { generateDataset } from "./generator.js";

/* ========================================
   処理時間の測定
======================================== */

export function measure(task, repeats = 5) {
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 20) {
    throw new RangeError("計測回数は1～20回にしてください。");
  }

  // ウォームアップ（計測対象外）
  task();

  const times = [];

  for (let i = 0; i < repeats; i++) {
    const start = performance.now();

    task();

    times.push(performance.now() - start);
  }

  const sorted = [...times].sort((a, b) => a - b);

  const middle = Math.floor(repeats / 2);

  return {
    medianMs:
      repeats % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,

    minMs: sorted[0],

    maxMs: sorted.at(-1),

    timesMs: times,
  };
}

/* ========================================
   共通の有効サンプルによる誤差比較
======================================== */

export function compareOnCommonRows(reference, methods) {
  const entries = Object.entries(methods);

  if (
    !entries.length ||
    entries.some(([, v]) => v.length !== reference.length)
  ) {
    throw new Error("比較データの行数が不正です。");
  }

  const valid = [];

  // すべての手法で有効な行だけを抽出する
  for (let i = 0; i < reference.length; i++) {
    if (
      Number.isFinite(reference[i]) &&
      entries.every(([, v]) => Number.isFinite(v[i]))
    ) {
      valid.push(i);
    }
  }

  const ref = valid.map((i) => reference[i]);

  return entries.map(([method, values]) => ({
    method,

    ...compareErrors(
      valid.map((i) => values[i]),
      ref,
    ),

    originalCount: reference.length,
  }));
}

/* ========================================
   ピーク検出精度の評価
======================================== */

export function scorePeaks(expected, detected, tolerance = 0.05) {
  if (
    !Number.isFinite(tolerance) ||
    tolerance < 0 ||
    ![...expected, ...detected].every(Number.isFinite)
  ) {
    throw new Error("ピーク時刻または許容誤差が不正です。");
  }

  // 時刻順に並べ替える
  const a = [...expected].sort((x, y) => x - y);

  const b = [...detected].sort((x, y) => x - y);

  let i = 0;
  let j = 0;

  let tp = 0;

  let errorSum = 0;

  // 正解と検出結果を1対1で対応付ける
  while (i < a.length && j < b.length) {
    const error = b[j] - a[i];

    if (Math.abs(error) <= tolerance) {
      tp++;

      errorSum += Math.abs(error);

      i++;
      j++;
    } else if (error < 0) {
      j++;
    } else {
      i++;
    }
  }

  const fp = b.length - tp;

  const fn = a.length - tp;

  return {
    tp,

    fp,

    fn,

    precision: b.length ? tp / b.length : null,

    recall: a.length ? tp / a.length : null,

    f1: 2 * tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : null,

    timeMAE: tp ? errorSum / tp : null,
  };
}

/* ========================================
   人工データによる精度評価
======================================== */

export function evaluateAccuracy(seed = 12345) {
  // ノイズを含む正弦波を生成する
  const { csv } = generateDataset({
    duration: 5,

    rate: 100,

    seed,

    noiseKind: "gaussian",

    missingRate: 0,

    signals: [
      {
        name: "signal",
        frequency: 1,
        noise: 0.3,
      },
    ],
  });

  const parsed = parseCSV(csv, { delimiter: "," });

  const get = (name) => parsed.columns.find((c) => c.name === name).values;

  const measured = get("signal");

  const reference = get("signal_ref");

  // フィルタ処理前後を共通区間で比較する
  const filters = compareOnCommonRows(reference, {
    Raw: measured,

    SMA5: movingAverage(measured, 5, "center"),

    Median5: medianFilter(measured, 5, "center"),

    EMA025: exponentialMovingAverage(measured, 0.25),
  });

  // 時間微分の精度評価
  // 不等間隔の y = 2t + 1 の変化率は理論上2
  const t = [0, 0.01, 0.04, 0.07, 0.1];

  const velocity = derivative(
    t.map((x) => 2 * x + 1),

    t,

    2,
  );

  const differentiation = compareErrors(velocity, 2);

  // ピーク検出の精度評価
  // 1秒・2秒・3秒にピークを配置する
  const x = Array.from({ length: 401 }, (_, i) => i / 100);

  const y = x.map((t) =>
    [1, 2, 3].reduce(
      (s, p) => s + 3 * Math.exp(-0.5 * ((t - p) / 0.05) ** 2),

      0,
    ),
  );

  const found = detectPeaks(y, x, {
    direction: "positive",

    threshold: 1,

    minProminence: 1,

    minDistance: 0.5,

    distanceUnit: "axis",
  });

  const peaks = scorePeaks(
    [1, 2, 3],

    found.map((p) => p.x),

    0.05,
  );

  // 相関係数の精度評価
  const a = [1, 2, 3, 4, 5];

  const pearson = correlation(
    a,
    a.map((v) => -2 * v),
  ).r;

  const spearman = correlation(
    a,
    a.map((v) => v ** 2),
    "spearman",
  ).r;

  return {
    seed,

    filters,

    differentiation,

    peaks,

    correlation: {
      pearson,

      expectedPearson: -1,

      spearman,

      expectedSpearman: 1,
    },
  };
}

/* ========================================
   処理性能のベンチマーク
======================================== */

export function benchmarkCase(rows, columns, repeats = 5) {
  // データサイズの制限
  if (
    !Number.isInteger(rows) ||
    rows < 3 ||
    rows > 100000 ||
    !Number.isInteger(columns) ||
    columns < 2 ||
    columns > 40 ||
    rows * (columns + 1) > 500000
  ) {
    throw new Error("最大10万行・40信号・50万セルです。");
  }

  // 横軸を生成する
  const x = Array.from(
    { length: rows },

    (_, i) => i / 100,
  );

  // ベンチマーク用の複数列データを生成
  const signals = Array.from(
    { length: columns },

    (_, j) => ({
      name: `signal_${j + 1}`,

      values: x.map(
        (t, i) =>
          Math.sin(2 * Math.PI * (1 + j / 10) * t) +
          0.15 * Math.sin(i * 2.3 + j),
      ),
    }),
  );

  // CSV形式のデータも生成する
  const csv = ["time_s," + signals.map((c) => c.name).join(",")];

  for (let i = 0; i < rows; i++) {
    csv.push([x[i], ...signals.map((c) => c.values[i])].join(","));
  }

  const text = csv.join("\r\n");

  const y = signals[0].values;

  // 計測対象の処理を定義する
  const tasks = [
    ["CSV parse", () => parseCSV(text, { delimiter: "," })],

    ["Statistics (1 column)", () => summarize(y)],

    ["SMA (5)", () => movingAverage(y, 5, "center")],

    ["Median (5)", () => medianFilter(y, 5, "center")],

    ["EMA (0.25)", () => exponentialMovingAverage(y, 0.25)],

    ["Derivative (lag 3)", () => derivative(y, x, 3)],

    ["Pearson matrix", () => correlationMatrix(signals, "pearson")],
  ];

  // 突出度探索は処理負荷が大きくなる場合があるため
  // ピーク検出は10000行以下で計測する
  if (rows <= 10000) {
    tasks.push([
      "Peak detection",

      () =>
        detectPeaks(y, x, {
          threshold: 0.5,

          minProminence: 0.2,

          minDistance: 20,
        }),
    ]);
  }

  // 各処理を計測して結果を返す
  return tasks.map(([operation, task]) => ({
    rows,

    columns,

    operation,

    repeats,

    ...measure(task, repeats),
  }));
}

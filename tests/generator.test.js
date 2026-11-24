import { test } from "node:test";

import assert from "node:assert/strict";

import { generateDataset } from "../js/generator.js";

import { parseCSV } from "../js/csv.js";

// テスト用データの生成
const gen = (options) =>
  generateDataset({
    duration: 1,

    rate: 10,

    signals: [{ name: "A" }],

    ...options,
  });

// 生成したCSVを既存のCSV解析器で読み込む
const parse = (options) => parseCSV(gen(options).csv);

// 指定された列の値を取得
const col = (d, name) => d.columns.find((c) => c.name === name).values;

// 浮動小数点数の比較
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10);

// テスト1：行数・横軸
test("row count and time axis", () => {
  const g = gen();

  assert.equal(g.rowCount, 11);

  assert.deepEqual(g.headers, ["time_s", "A", "A_ref"]);

  assert.deepEqual(
    col(parse(), "time_s"),

    Array.from({ length: 11 }, (_, i) => i / 10),
  );
});

// テスト2：乱数シードによる再現性
test("seed reproducibility", () => {
  const options = {
    jitter: 0.3,

    missingRate: 0.2,

    signals: [{ name: "A", noise: 0.2 }],
  };

  assert.equal(
    gen(options).csv,

    gen(options).csv,
  );

  assert.notEqual(
    gen(options).csv,

    gen({ ...options, seed: 2 }).csv,
  );
});

// テスト3：不等間隔サンプリング
test("jitter preserves increasing time and bounds", () => {
  const x = col(parse({ jitter: 0.9 }), "time_s");

  assert.equal(x[0], 0);

  assert.equal(x.at(-1), 1);

  for (let i = 1; i < x.length; i++) {
    assert.ok(x[i] - x[i - 1] >= 0.01 - 1e-12);

    assert.ok(x[i] - x[i - 1] <= 0.19 + 1e-12);
  }
});

// テスト4：正弦波と基準データ
test("sine and clean reference", () => {
  const d = parse({ rate: 4 });

  const a = col(d, "A");

  [0, 1, 0, -1, 0].forEach((v, i) => near(a[i], v));

  assert.deepEqual(a, col(d, "A_ref"));
});

// テスト5：単発ピークと複数信号
test("pulse and multiple signals", () => {
  const d = parse({
    signals: [
      {
        name: "pulse",
        type: "pulse",
        amplitude: 3,
        center: 0.5,
        width: 0.1,
      },

      {
        name: "trend",
        type: "trend",
        amplitude: 2,
        offset: 1,
      },
    ],
  });

  near(col(d, "pulse")[5], 3);

  near(col(d, "trend").at(-1), 3);

  assert.equal(d.headers.length, 5);
});

// テスト6：その他の波形
test("square triangle periodic peaks and walk", () => {
  const d = parse({
    rate: 4,

    signals: [
      { name: "sq", type: "square" },

      { name: "tri", type: "triangle" },

      { name: "p", type: "peaks" },

      { name: "w", type: "walk" },
    ],
  });

  assert.deepEqual(
    col(d, "sq"),

    [1, 1, -1, -1, 1],
  );

  assert.deepEqual(
    col(d, "tri"),

    [-1, 0, 1, 0, -1],
  );

  near(col(d, "p")[0], 1);

  near(col(d, "p")[4], 1);

  assert.equal(col(d, "w")[0], 0);
});

// テスト7：欠損データと基準データ
test("missing measured data but reference preserved", () => {
  const d = parse({ missingRate: 1 });

  assert.ok(col(d, "A").every((v) => v === null));

  assert.ok(col(d, "A_ref").every(Number.isFinite));
});

// テスト8：一様ノイズと基準データの省略
test("uniform noise bounds and optional references", () => {
  const d = parse({
    noiseKind: "uniform",

    signals: [
      {
        name: "A",
        amplitude: 0,
        noise: 2,
      },
    ],

    includeReference: false,
  });

  assert.deepEqual(
    d.headers,

    ["time_s", "A"],
  );

  assert.ok(col(d, "A").every((v) => Math.abs(v) <= 2 * Math.sqrt(3)));
});

// テスト9：特殊文字を含む列名
test("quoted column names round-trip", () => {
  assert.deepEqual(
    parse({
      signals: [{ name: 'センサー,"A"' }],
    }).headers,

    ["time_s", 'センサー,"A"', 'センサー,"A"_ref'],
  );
});

// テスト10：不正な設定値と生成量の制限
test("invalid settings and size limit", () => {
  assert.throws(() => gen({ seed: 1.5 }));

  assert.throws(() => gen({ rate: 0 }));

  assert.throws(() => gen({ jitter: 1 }));

  assert.throws(() => gen({ duration: 3600, rate: 10000 }));

  assert.throws(() =>
    gen({
      signals: [{ name: "time_s" }],
    }),
  );

  assert.throws(() =>
    gen({
      signals: [{ name: "A" }, { name: "A_ref" }],
    }),
  );

  assert.throws(() =>
    gen({
      signals: [{ name: "A", frequency: 6 }],
    }),
  );
});

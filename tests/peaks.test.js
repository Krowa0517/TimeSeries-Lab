import { test } from "node:test";

import assert from "node:assert/strict";

import { detectPeaks, peakIntervals } from "../js/peaks.js";

// サンプル番号を横軸として検出する補助関数
const detect = (v, options = {}) =>
  detectPeaks(
    v,

    v.map((_, i) => i),

    options,
  );

// 検出位置だけを取得する
const indices = (peaks) => peaks.map((p) => p.index);

// テスト1
// 正方向ピークと閾値
test("positive peaks and inclusive threshold", () => {
  assert.deepEqual(
    indices(
      detect(
        [0, 3, 0, 2, 0],

        { threshold: 2 },
      ),
    ),

    [1, 3],
  );
});

// テスト2
// 負方向・両方向のピーク検出
test("negative and both directions", () => {
  const v = [0, 3, 0, -4, 0];

  assert.deepEqual(
    indices(
      detect(v, {
        direction: "negative",

        threshold: 3,
      }),
    ),

    [3],
  );

  assert.deepEqual(
    indices(
      detect(v, {
        direction: "both",
      }),
    ),

    [1, 3],
  );
});

// テスト3
// 平坦なピークと端点
test("plateau center rounded down and boundary excluded", () => {
  assert.deepEqual(
    indices(detect([8, 0, 4, 4, 0, 6])),

    [2],
  );

  assert.deepEqual(
    detect([4, 4, 4]),

    [],
  );
});

// テスト4
// Prominenceの計算
test("prominence relative to higher base", () => {
  const p = detect([0, 5, 4, 6, 0]);

  assert.deepEqual(
    p.map((v) => v.prominence),

    [1, 6],
  );

  assert.deepEqual(
    indices(
      detect(
        [0, 5, 4, 6, 0],

        { minProminence: 2 },
      ),
    ),

    [3],
  );
});

// テスト5
// 最小ピーク間隔と同じ高さの処理
test("minimum sample separation and ties", () => {
  assert.deepEqual(
    indices(
      detect(
        [0, 2, 0, 3, 0],

        { minDistance: 3 },
      ),
    ),

    [3],
  );

  assert.deepEqual(
    indices(
      detect(
        [0, 2, 0, 2, 0],

        { minDistance: 3 },
      ),
    ),

    [1],
  );

  assert.deepEqual(
    indices(
      detect(
        [0, 2, 0, 2, 0],

        { minDistance: 2 },
      ),
    ),

    [1, 3],
  );
});

// テスト6
// 不等間隔サンプリング
test("irregular axis separation", () => {
  const v = [0, 2, 0, 3, 0];

  const x = [0, 0.1, 0.2, 0.3, 1];

  assert.deepEqual(
    indices(
      detectPeaks(v, x, {
        distanceUnit: "axis",

        minDistance: 0.25,
      }),
    ),

    [3],
  );
});

// テスト7
// 欠損区間とピーク間隔
test("missing values split segments and intervals", () => {
  const p = detect([0, 2, 0, null, 0, 3, 0, 2, 0]);

  assert.deepEqual(
    indices(p),

    [1, 5, 7],
  );

  assert.deepEqual(
    peakIntervals(p, "positive"),

    [2],
  );

  assert.deepEqual(
    detect([0, 4, null, 0]),

    [],
  );
});

// テスト8
// 検出範囲と元のサンプル番号
test("range boundaries and original indices", () => {
  assert.deepEqual(
    indices(
      detect(
        [0, 2, 0, 3, 0],

        {
          start: 1,

          end: 5,
        },
      ),
    ),

    [3],
  );

  assert.deepEqual(
    detect([], {}),

    [],
  );
});

// テスト9
// 正負それぞれの最小間隔
test("direction-specific distance", () => {
  assert.deepEqual(
    indices(
      detect(
        [0, 3, -3, 0],

        {
          direction: "both",

          minDistance: 10,
        },
      ),
    ),

    [1, 2],
  );
});

// テスト10
// 不正な設定値と元データの保護
test("invalid parameters and input protection", () => {
  assert.throws(() =>
    detect([0, 2, 0], {
      minDistance: -1,
    }),
  );

  assert.throws(() =>
    detect([0, 2, 0], {
      threshold: NaN,
    }),
  );

  assert.throws(() =>
    detectPeaks(
      [0, 2, 0],

      [0, 1, 1],
    ),
  );

  assert.throws(() => detect([0, undefined, 0]));

  assert.deepEqual(
    indices(detect(Object.freeze([0, 2, 0]))),

    [1],
  );
});

/**
 * TimeSeries Lab
 * generator.js
 *
 * 人工時系列データ生成モジュール
 */

export const WAVEFORMS = [
  ["sine", "正弦波"],
  ["square", "矩形波"],
  ["triangle", "三角波"],
  ["pulse", "単発ピーク"],
  ["peaks", "周期ピーク"],
  ["trend", "直線トレンド"],
  ["walk", "ランダムウォーク"],
];

/* ========================================
   疑似乱数生成
======================================== */

// 32bit線形合同法
// 同じシードから同じ乱数列を生成する
function randomSource(seed) {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;

    return state / 4294967296;
  };
}

/* ========================================
   共通処理
======================================== */

// 設定値の検証
function check(value, min, max, label) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${label}は${min}～${max}にしてください。`);
  }
}

// ノイズを生成する
function noiseSample(random, kind) {
  // 標準偏差1の一様分布
  if (kind === "uniform") {
    return Math.sqrt(3) * (2 * random() - 1);
  }

  // Box-Muller法による標準正規分布
  return (
    Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())
  );
}

// CSVヘッダーのエスケープ処理
function quoteHeader(name) {
  return /[,"\r\n\t;]/.test(name)
    ? '"' + name.replaceAll('"', '""') + '"'
    : name;
}

/* ========================================
   データ生成
======================================== */

export function generateDataset({
  duration = 5,
  rate = 100,
  jitter = 0,
  missingRate = 0,
  seed = 12345,
  noiseKind = "gaussian",
  includeReference = true,
  signals = [],
} = {}) {
  /* ======================================
     設定値の検証
  ====================================== */

  check(duration, 0.001, 3600, "測定時間");

  check(rate, 0.1, 10000, "サンプリング周波数");

  check(jitter, 0, 0.9, "時刻のばらつき");

  check(missingRate, 0, 1, "欠損率");

  check(seed, 0, 4294967295, "シード");

  if (!Number.isInteger(seed)) {
    throw new Error("シードは整数にしてください。");
  }

  if (!["uniform", "gaussian"].includes(noiseKind)) {
    throw new Error("未対応のノイズです。");
  }

  if (!Array.isArray(signals) || signals.length < 1 || signals.length > 12) {
    throw new Error("信号数は1～12にしてください。");
  }

  // 時刻0のデータも生成する
  const steps = Math.floor(duration * rate + 1e-9);

  const rowCount = steps + 1;

  const columnCount = 1 + signals.length * (includeReference ? 2 : 1);

  // 大規模データによるブラウザの停止を防ぐ
  if (rowCount < 2 || rowCount > 100000 || rowCount * columnCount > 500000) {
    throw new Error("2～100000行、総セル数50万以下にしてください。");
  }

  /* ======================================
     ヘッダーと各信号の設定
  ====================================== */

  const headers = ["time_s"];

  const used = new Set(headers);

  // 重複する列名を拒否する
  function addHeader(name) {
    if (used.has(name)) {
      throw new Error(`列名が重複しています：${name}`);
    }

    used.add(name);
    headers.push(name);
  }

  const configs = signals.map((s) => {
    const c = {
      type: "sine",
      amplitude: 1,
      frequency: 1,
      offset: 0,
      phase: 0,
      center: 2,
      width: 0.05,
      noise: 0,
      ...s,
    };

    if (typeof c.name !== "string" || !c.name.trim() || /[\r\n]/.test(c.name)) {
      throw new Error("有効な列名を指定してください。");
    }

    c.name = c.name.trim();

    if (!WAVEFORMS.some(([key]) => key === c.type)) {
      throw new Error("未対応の波形です。");
    }

    check(c.amplitude, -1e9, 1e9, "振幅・傾き");

    check(c.offset, -1e9, 1e9, "オフセット");

    check(c.noise, 0, 1e9, "ノイズ強度");

    // 周期性のある波形の設定値を検証
    if (["sine", "square", "triangle", "peaks"].includes(c.type)) {
      check(c.frequency, 0.000001, rate / 2, "周波数");

      check(c.phase, -1, 1, "位相");
    }

    // ピーク幅を検証
    if (["pulse", "peaks"].includes(c.type)) {
      check(c.width, 0.000001, 3600, "ピーク幅σ");
    }

    // 単発ピークの発生時刻を検証
    if (c.type === "pulse") {
      check(c.center, 0, steps / rate, "ピーク時刻");
    }

    addHeader(c.name);

    if (includeReference) {
      addHeader(c.name + "_ref");
    }

    return c;
  });

  /* ======================================
     時刻データの生成
  ====================================== */

  const random = randomSource(seed);

  // 時刻のずれは各点で
  // ±jitter / (2 * rate)
  // 開始時刻と終了時刻は固定する
  const times = Array.from(
    { length: rowCount },

    (_, i) =>
      i === 0 || i === steps
        ? i / rate
        : (i + jitter * (random() - 0.5)) / rate,
  );

  // ランダムウォークの状態
  const walks = configs.map(() => 0);

  // CSVのヘッダー行
  const lines = [headers.map(quoteHeader).join(",")];

  /* ======================================
     ノイズ付加前の波形を生成
  ====================================== */

  function cleanValue(c, t, i, j) {
    const cycle = c.frequency * t + c.phase;

    const frac = cycle - Math.floor(cycle);

    let shape;

    switch (c.type) {
      // 正弦波
      case "sine":
        shape = Math.sin(2 * Math.PI * cycle);

        break;

      // 矩形波
      case "square":
        shape = frac < 0.5 ? 1 : -1;

        break;

      // 三角波
      case "triangle":
        shape = 1 - 4 * Math.abs(frac - 0.5);

        break;

      // 単発ピーク
      case "pulse":
        shape = Math.exp(-0.5 * ((t - c.center) / c.width) ** 2);

        break;

      // 周期ピーク
      case "peaks": {
        const d = (cycle - Math.round(cycle)) / c.frequency;

        shape = Math.exp(-0.5 * (d / c.width) ** 2);

        break;
      }

      // 直線トレンド
      case "trend":
        shape = t;

        break;

      // ランダムウォーク
      case "walk":
        if (i > 0) {
          walks[j] += 2 * random() - 1;
        }

        shape = walks[j];

        break;
    }

    return c.offset + c.amplitude * shape;
  }

  /* ======================================
     各サンプルの生成
  ====================================== */

  for (let i = 0; i < rowCount; i++) {
    const row = [times[i]];

    for (let j = 0; j < configs.length; j++) {
      const c = configs[j];

      // ノイズのない基準値
      const reference = cleanValue(c, times[i], i, j);

      // ノイズを加えた測定値
      const measured = reference + c.noise * noiseSample(random, noiseKind);

      if (!Number.isFinite(reference) || !Number.isFinite(measured)) {
        throw new RangeError("生成値が数値の範囲を超えました。");
      }

      // 指定された確率で欠損値を生成する
      row.push(random() < missingRate ? "" : measured);

      // 基準データにはノイズ・欠損を付加しない
      if (includeReference) {
        row.push(reference);
      }
    }

    lines.push(row.join(","));
  }

  /* ======================================
     生成結果を返す
  ====================================== */

  return {
    csv: lines.join("\r\n") + "\r\n",

    rowCount,

    headers,

    measuredNames: configs.map((c) => c.name),

    duration: steps / rate,
  };
}

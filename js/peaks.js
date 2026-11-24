/**
 * TimeSeries Lab
 * peaks.js
 *
 * 時系列データのピーク検出
 */

/* ========================================
   ピーク検出
======================================== */

export function detectPeaks(
  values,
  x,
  {
    direction = "positive",
    threshold = 0,
    minProminence = 0,
    minDistance = 1,
    distanceUnit = "sample",
    start = 0,
    end = values.length,
  } = {},
) {
  // 入力データの検証
  if (
    !Array.isArray(values) ||
    !Array.isArray(x) ||
    values.length !== x.length
  ) {
    throw new Error("横軸とデータの行数が一致しません。");
  }

  // 検出方向と間隔の単位を検証
  if (
    !["positive", "negative", "both"].includes(direction) ||
    !["sample", "axis"].includes(distanceUnit)
  ) {
    throw new Error("検出方向または間隔の単位が不正です。");
  }

  // 検出条件の検証
  if (
    ![threshold, minProminence, minDistance].every(Number.isFinite) ||
    minProminence < 0 ||
    minDistance < 0 ||
    (distanceUnit === "sample" && !Number.isSafeInteger(minDistance))
  ) {
    throw new Error("検出条件が不正です。");
  }

  // 分析範囲の検証
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end > values.length
  ) {
    throw new Error("分析範囲が不正です。");
  }

  // 横軸と数値データの検証
  for (let i = 0; i < x.length; i++) {
    if (!Number.isFinite(x[i]) || (i > 0 && x[i] <= x[i - 1])) {
      throw new Error("横軸は有限の数値かつ厳密な昇順にしてください。");
    }

    if (values[i] !== null && !Number.isFinite(values[i])) {
      throw new Error("有限の数値またはnullを指定してください。");
    }
  }

  // 検出方向を設定する
  const signs =
    direction === "both" ? [1, -1] : [direction === "positive" ? 1 : -1];

  const result = [];

  // 正方向・負方向を独立して処理する
  for (const sign of signs) {
    const candidates = [];

    let cursor = start;

    /* ====================================
       欠損値による区間分割
    ==================================== */

    while (cursor < end) {
      if (values[cursor] === null) {
        cursor++;
        continue;
      }

      // 連続した有効データの開始位置
      const left = cursor;

      while (cursor < end && values[cursor] !== null) {
        cursor++;
      }

      // 連続した有効データの終了位置
      const right = cursor - 1;

      let i = left + 1;

      /* ==================================
         局所最大値・最小値の探索
      ================================== */

      while (i < right) {
        const height = sign * values[i];

        // 左隣より大きくない場合
        if (height <= sign * values[i - 1]) {
          i++;

          continue;
        }

        // 平坦なピークを探索する
        let j = i;

        while (j < right && values[j + 1] === values[i]) {
          j++;
        }

        // 右隣より大きく、
        // 閾値以上の場合はピーク候補とする
        if (j < right && height > sign * values[j + 1] && height >= threshold) {
          // 平坦なピークの中央を取得する
          const index = i + Math.floor((j - i) / 2);

          /* ==============================
             Prominence（突出度）
          ============================== */

          let leftBase = height;

          let rightBase = height;

          // 左方向の基準値を探索する
          for (let k = i - 1; k >= left; k--) {
            const h = sign * values[k];

            // より高いピークに達したら終了
            if (h > height) break;

            leftBase = Math.min(leftBase, h);
          }

          // 右方向の基準値を探索する
          for (let k = j + 1; k <= right; k++) {
            const h = sign * values[k];

            if (h > height) break;

            rightBase = Math.min(rightBase, h);
          }

          // 左右の基準値のうち
          // 高い方を使用する
          const prominence = height - Math.max(leftBase, rightBase);

          if (!Number.isFinite(prominence)) {
            throw new RangeError("突出度が数値の範囲を超えました。");
          }

          // 突出度の条件を満たすか確認する
          if (prominence >= minProminence) {
            candidates.push({
              index,

              x: x[index],

              value: values[index],

              direction: sign === 1 ? "positive" : "negative",

              prominence,

              segment: left,
            });
          }
        }

        i = j + 1;
      }
    }

    /* ====================================
       最小ピーク間隔による重複排除
    ==================================== */

    // 振幅の大きい候補を優先する
    // 同じ高さの場合は前の候補を優先
    const order = candidates
      .map((_, i) => i)
      .sort(
        (a, b) =>
          sign * candidates[b].value - sign * candidates[a].value || a - b,
      );

    // 除外されたピークを管理する
    const blocked = new Uint8Array(candidates.length);

    // 間隔の単位を取得する
    const coordinate = (p) => (distanceUnit === "sample" ? p.index : p.x);

    for (const k of order) {
      if (blocked[k]) continue;

      const p = candidates[k];

      result.push(p);

      // 左右にある近接ピークを除外する
      for (const step of [-1, 1]) {
        for (let j = k + step; j >= 0 && j < candidates.length; j += step) {
          const distance = Math.abs(coordinate(candidates[j]) - coordinate(p));

          if (distance >= minDistance) {
            break;
          }

          blocked[j] = 1;
        }
      }
    }
  }

  // 検出結果をサンプル順に並べる
  return result.sort((a, b) => a.index - b.index);
}

/* ========================================
   ピーク間隔の計算
======================================== */

// 同じ方向・同じ連続区間にある
// 隣接ピーク間の横軸上の距離を計算する
export function peakIntervals(peaks, direction) {
  const intervals = [];

  let previous = null;

  for (const p of peaks) {
    if (p.direction !== direction) {
      continue;
    }

    // 欠損区間をまたいだ間隔は計算しない
    if (previous && previous.segment === p.segment) {
      const dt = p.x - previous.x;

      if (!Number.isFinite(dt)) {
        throw new RangeError("ピーク間隔が数値の範囲を超えました。");
      }

      intervals.push(dt);
    }

    previous = p;
  }

  return intervals;
}

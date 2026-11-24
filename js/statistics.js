
/**
 * TimeSeries Lab
 * statistics.js
 *
 * 基本統計量・誤差分析モジュール
 */


/* ========================================
   共通処理
======================================== */

// null は欠損値。
// それ以外は有限の数値のみ受け付ける。
function validateValue(value) {

  if (
    value !== null &&
    !Number.isFinite(value)
  ) {

    throw new TypeError(
      '有限の数値または null が必要です。'
    );
  }
}


// 計算結果が数値の表現範囲内か確認する
function finiteResult(value) {

  if (!Number.isFinite(value)) {

    throw new RangeError(
      '数値の範囲を超えました。'
    );
  }

  return value;
}



/* ========================================
   分位数の計算
======================================== */

// 線形補間による分位数（R7方式）
// sorted は昇順に並べ替え済みの配列
function quantile(sorted, p) {

  const h = (sorted.length - 1) * p;

  const i = Math.floor(h);

  const f = h - i;

  return f === 0

    ? sorted[i]

    : (1 - f) * sorted[i]
      + f * sorted[i + 1];
}



/* ========================================
   基本統計量
======================================== */

/**
 * 数値配列から基本統計量を算出する。
 *
 * @param {Array} values
 * 有限の数値またはnullを含む配列
 *
 * @returns {Object}
 * 基本統計量
 */
export function summarize(values) {

  const valid = [];

  let mean = 0;

  let m2 = 0;


  for (const value of values) {

    validateValue(value);

    // 欠損値を除外する
    if (value === null) continue;

    valid.push(value);


    // Welford法：
    // 平均と偏差平方和を逐次更新する
    const delta = value - mean;

    mean = finiteResult(
      mean + delta / valid.length
    );

    m2 = finiteResult(
      m2 + delta * (value - mean)
    );
  }


  const count = values.length;

  const validCount = valid.length;

  const missingCount =
    count - validCount;


  // 初期結果
  const result = {

    count,

    validCount,

    missingCount,

    missingRate: count
      ? missingCount / count
      : null,

    mean: null,

    median: null,

    min: null,

    max: null,

    range: null,

    variance: null,

    stdDev: null,

    q1: null,

    q3: null
  };


  // 有効なデータがない場合
  if (!validCount) return result;


  // コピーした有効値だけを並べ替える
  // 元のデータは変更しない
  valid.sort((a, b) => a - b);


  const min = valid[0];

  const max = valid[validCount - 1];


  // 母分散を算出する
  // 丸め誤差による負の値を防止する
  const variance = Math.max(
    0,
    m2 / validCount
  );


  return {

    ...result,

    mean,

    median: quantile(valid, 0.5),

    min,

    max,

    range: finiteResult(max - min),

    variance,

    stdDev: Math.sqrt(variance),

    q1: quantile(valid, 0.25),

    q3: quantile(valid, 0.75)
  };
}



/* ========================================
   誤差分析
======================================== */

/**
 * 測定値と基準値を比較して誤差を算出する。
 *
 * @param {Array} measured
 * 測定データ
 *
 * @param {Array|number} reference
 * 同じ行数の基準データ、または一定の基準値
 */
export function compareErrors(
  measured,
  reference
) {

  const paired = Array.isArray(reference);


  // 配列同士を比較する場合は行数を確認する
  if (
    paired &&
    measured.length !== reference.length
  ) {

    throw new Error(
      '測定値と基準値の行数が一致しません。'
    );
  }


  // 定数の場合は有限の数値か確認する
  if (
    !paired &&
    !Number.isFinite(reference)
  ) {

    throw new TypeError(
      '基準値には有限の数値を指定してください。'
    );
  }


  let n = 0;

  let meanError = 0;

  let mae = 0;

  let mse = 0;


  for (
    let i = 0;
    i < measured.length;
    i++
  ) {

    const a = measured[i];

    const b = paired
      ? reference[i]
      : reference;


    validateValue(a);

    validateValue(b);


    // 片方でも欠損している場合は
    // そのデータの組を除外する
    if (a === null || b === null) {
      continue;
    }


    // 誤差 = 測定値 - 基準値
    const e = finiteResult(a - b);

    const squared = finiteResult(e * e);

    n++;


    // 平均誤差
    meanError = finiteResult(
      meanError + (e - meanError) / n
    );


    // 平均絶対誤差
    mae += (Math.abs(e) - mae) / n;


    // 平均二乗誤差
    mse += (squared - mse) / n;
  }


  return {

    count: measured.length,

    validCount: n,

    excludedCount:
      measured.length - n,

    meanError: n
      ? meanError
      : null,

    mae: n
      ? mae
      : null,

    mse: n
      ? mse
      : null,

    rmse: n
      ? Math.sqrt(mse)
      : null
  };
}



/* ========================================
   分析範囲の検索
======================================== */

/**
 * 昇順の横軸から指定範囲に含まれる行を探す。
 *
 * minとmaxは分析範囲に含める。
 *
 * 戻り値はslice(start, end)に
 * そのまま渡せる形式とする。
 */
export function rangeIndices(
  x,
  min,
  max
) {

  if (

    !Number.isFinite(min) ||

    !Number.isFinite(max) ||

    min > max

  ) {

    throw new RangeError(
      '分析範囲が不正です。'
    );
  }


  // 二分探索による境界位置の検索
  function bound(target, upper) {

    let lo = 0;

    let hi = x.length;


    while (lo < hi) {

      const mid =
        lo + Math.floor((hi - lo) / 2);


      if (

        x[mid] < target ||

        (upper && x[mid] === target)

      ) {

        lo = mid + 1;

      } else {

        hi = mid;
      }
    }

    return lo;
  }


  return [

    bound(min, false),

    bound(max, true)
  ];
}

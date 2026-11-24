
/**
 * TimeSeries Lab
 * filters.js
 *
 * 時系列データの平滑化・ノイズ除去
 */


/* ========================================
   共通処理
======================================== */

// 入力データを検証する
function validateValues(values) {

  if (!Array.isArray(values)) {

    throw new TypeError(
      '配列を指定してください。'
    );
  }

  for (const v of values) {

    if (v !== null && !Number.isFinite(v)) {

      throw new TypeError(
        '有限の数値またはnullを指定してください。'
      );
    }
  }
}


// 窓幅と処理方向を検証する
function validateWindow(size, direction) {

  if (!Number.isSafeInteger(size) || size < 1) {

    throw new RangeError(
      '窓幅は1以上の整数にしてください。'
    );
  }

  if (!['center', 'trailing'].includes(direction)) {

    throw new Error(
      '未対応の処理方向です。'
    );
  }

  // 中央フィルタの場合は奇数の窓幅が必要
  if (direction === 'center' && size % 2 === 0) {

    throw new Error(
      '中央フィルタの窓幅は奇数にしてください。'
    );
  }
}


// 計算結果が有限の数値か確認する
function finite(value) {

  if (!Number.isFinite(value)) {

    throw new RangeError(
      '計算結果が数値の表現範囲を超えました。'
    );
  }

  return value;
}


// 加工結果を格納する位置を求める
function outputIndex(end, size, direction) {

  return direction === 'center'

    ? end - Math.floor(size / 2)

    : end;
}



/* ========================================
   単純移動平均（SMA）
======================================== */

/**
 * @param {Array} values 元データ
 * @param {number} size 窓幅
 * @param {string} direction 処理方向
 */
export function movingAverage(
  values,
  size,
  direction = 'trailing'
) {

  validateValues(values);

  validateWindow(size, direction);


  // 元データと同じ長さの配列を生成する
  const result =
    Array(values.length).fill(null);


  // データ数より窓幅が大きい場合
  if (size > values.length) {

    return result;
  }


  // 現在の窓内の合計値
  let sum = 0;

  // 現在の窓内の欠損値数
  let missing = 0;


  for (let i = 0; i < values.length; i++) {

    // 窓から外れたデータを除去する
    if (i >= size) {

      const old = values[i - size];

      if (old === null) {

        missing--;

      } else {

        sum = finite(sum - old);
      }
    }


    // 新しいデータを窓に追加する
    const value = values[i];

    if (value === null) {

      missing++;

    } else {

      sum = finite(sum + value);
    }


    // 窓幅が満たされ、欠損値がない場合
    if (i >= size - 1 && missing === 0) {

      const index =
        outputIndex(i, size, direction);

      result[index] = sum / size;
    }
  }

  return result;
}



/* ========================================
   中央値フィルタ（Median Filter）
======================================== */

/**
 * @param {Array} values 元データ
 * @param {number} size 窓幅
 * @param {string} direction 処理方向
 */
export function medianFilter(
  values,
  size,
  direction = 'trailing'
) {

  validateValues(values);

  validateWindow(size, direction);


  const result =
    Array(values.length).fill(null);


  for (
    let end = size - 1;
    end < values.length;
    end++
  ) {

    // 対象となる窓を取得する
    const window = values.slice(

      end - size + 1,

      end + 1
    );


    // 欠損値を含む窓は計算しない
    if (window.includes(null)) {

      continue;
    }


    // 昇順に並べ替える
    window.sort(
      (a, b) => a - b
    );


    const mid =
      Math.floor(size / 2);


    // 中央値を取得する
    const median = size % 2 === 1

      ? window[mid]

      : window[mid - 1] / 2
        + window[mid] / 2;


    const index =
      outputIndex(end, size, direction);


    result[index] = median;
  }

  return result;
}



/* ========================================
   指数移動平均（EMA）
======================================== */

/**
 * @param {Array} values 元データ
 * @param {number} alpha 平滑化係数
 */
export function exponentialMovingAverage(
  values,
  alpha
) {

  validateValues(values);


  // 平滑化係数を検証する
  if (

    !Number.isFinite(alpha) ||

    alpha <= 0 ||

    alpha > 1

  ) {

    throw new RangeError(
      'αは0より大きく1以下にしてください。'
    );
  }


  // 直前の平滑化結果
  let previous = null;


  return values.map(value => {

    // 欠損値が出現した場合は状態をリセットする
    if (value === null) {

      previous = null;

      return null;
    }


    // 最初の有効値を初期値とする
    previous = previous === null

      ? value

      : finite(

          alpha * value +

          (1 - alpha) * previous
        );


    return previous;
  });
}



/* ========================================
   フィルタ処理の共通インターフェース
======================================== */

/**
 * 指定されたフィルタを適用する。
 */
export function applyFilter(
  values,
  {
    method = 'sma',
    size = 5,
    direction = 'trailing',
    alpha = 0.25
  } = {}
) {

  switch (method) {

    case 'sma':

      return movingAverage(
        values,
        size,
        direction
      );


    case 'median':

      return medianFilter(
        values,
        size,
        direction
      );


    case 'ema':

      return exponentialMovingAverage(
        values,
        alpha
      );


    default:

      throw new Error(
        '未対応のフィルタです。'
      );
  }
}

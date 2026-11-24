
/**
 * TimeSeries Lab
 * transforms.js
 *
 * 時系列データの変換・数値演算
 */


/* ========================================
   共通処理
======================================== */

// 入力データを検証する
function validate(values) {

  if (!Array.isArray(values)) {
    throw new TypeError('配列を指定してください。');
  }

  for (const v of values) {

    if (v !== null && !Number.isFinite(v)) {

      throw new TypeError(
        '有限の数値またはnullを指定してください。'
      );
    }
  }
}


// 計算結果の検証
function finite(v) {

  if (!Number.isFinite(v)) {

    throw new RangeError(
      '計算結果が数値の表現範囲を超えました。'
    );
  }

  return v;
}


// 差分サンプル数の検証
function validateLag(lag) {

  if (!Number.isSafeInteger(lag) || lag < 1) {

    throw new RangeError(
      '差分サンプル数は1以上の整数にしてください。'
    );
  }
}



/* ========================================
   差分処理の共通アルゴリズム
======================================== */

function lagTransform(values, lag, calculate) {

  validate(values);

  validateLag(lag);


  // 元データと同じ長さの配列を生成する
  const result =
    Array(values.length).fill(null);


  // 差分区間内の欠損値数
  let missing = 0;


  for (let i = 0; i < values.length; i++) {

    // 新しい欠損値を数える
    if (values[i] === null) {
      missing++;
    }


    // 差分区間から外れた欠損値を除く
    if (
      i > lag &&
      values[i - lag - 1] === null
    ) {
      missing--;
    }


    // 必要なデータが揃っている場合のみ計算する
    if (i >= lag && missing === 0) {

      result[i] = finite(
        calculate(
          values[i],
          values[i - lag],
          i
        )
      );
    }
  }

  return result;
}



/* ========================================
   Nサンプル差分
======================================== */

export function difference(values, lag = 1) {

  return lagTransform(
    values,
    lag,
    (a, b) => a - b
  );
}



/* ========================================
   時間微分
======================================== */

export function derivative(
  values,
  times,
  lag = 1
) {

  validate(values);


  // 時刻と測定値の行数を確認する
  if (
    !Array.isArray(times) ||
    times.length !== values.length
  ) {

    throw new Error(
      '時刻と測定値の行数が一致しません。'
    );
  }


  // 時刻が厳密な昇順であることを確認する
  for (let i = 0; i < times.length; i++) {

    if (

      !Number.isFinite(times[i]) ||

      (i > 0 && times[i] <= times[i - 1])

    ) {

      throw new Error(
        '時刻は有限の数値かつ厳密な昇順にしてください。'
      );
    }
  }


  // 実際の測定間隔を使用する
  return lagTransform(
    values,
    lag,
    (a, b, i) => {

      const dt = finite(
        times[i] - times[i - lag]
      );

      return finite(a - b) / dt;
    }
  );
}



/* ========================================
   絶対値
======================================== */

export function absoluteValues(values) {

  validate(values);

  return values.map(
    v => v === null
      ? null
      : Math.abs(v)
  );
}



/* ========================================
   四則演算
======================================== */

function arithmetic(a, b, operator) {

  // どちらかが欠損している場合
  if (a === null || b === null) {
    return null;
  }


  switch (operator) {

    case 'add':
      return finite(a + b);

    case 'subtract':
      return finite(a - b);

    case 'multiply':
      return finite(a * b);

    case 'divide':
      return b === 0
        ? null
        : finite(a / b);

    default:
      throw new Error('未対応の演算です。');
  }
}


// 演算子を検証する
function validateOperator(operator) {

  if (
    ![
      'add',
      'subtract',
      'multiply',
      'divide'
    ].includes(operator)
  ) {

    throw new Error('未対応の演算です。');
  }
}



/* ========================================
   定数との演算
======================================== */

export function constantOperation(
  values,
  operator,
  constant
) {

  validate(values);

  validateOperator(operator);


  if (!Number.isFinite(constant)) {

    throw new TypeError(
      '有限の定数を指定してください。'
    );
  }


  // 定数0による除算を禁止する
  if (operator === 'divide' && constant === 0) {

    throw new RangeError(
      '0で除算することはできません。'
    );
  }


  return values.map(
    v => arithmetic(
      v,
      constant,
      operator
    )
  );
}



/* ========================================
   データ列同士の演算
======================================== */

export function columnOperation(
  a,
  b,
  operator
) {

  validate(a);

  validate(b);

  validateOperator(operator);


  if (a.length !== b.length) {

    throw new Error(
      'データ数が一致しません。'
    );
  }


  return a.map(
    (v, i) => arithmetic(
      v,
      b[i],
      operator
    )
  );
}



/* ========================================
   ベクトルの大きさ
======================================== */

export function vectorMagnitude(columns) {

  if (
    !Array.isArray(columns) ||
    columns.length < 2
  ) {

    throw new Error(
      '2列以上を指定してください。'
    );
  }


  for (const c of columns) {
    validate(c);
  }


  const n = columns[0].length;


  // すべての列の行数が一致することを確認
  if (columns.some(c => c.length !== n)) {

    throw new Error(
      'データ数が一致しません。'
    );
  }


  return Array.from(
    { length: n },

    (_, i) => {

      let magnitude = 0;


      for (const c of columns) {

        // いずれかの成分が欠損している場合
        if (c[i] === null) {
          return null;
        }

        magnitude = Math.hypot(
          magnitude,
          c[i]
        );
      }


      return finite(magnitude);
    }
  );
}



/* ========================================
   Min-Max正規化
======================================== */

export function minMaxNormalize(values) {

  validate(values);


  let min = Infinity;

  let max = -Infinity;


  // 最小値・最大値の探索
  for (const v of values) {

    if (v === null) continue;

    min = Math.min(min, v);

    max = Math.max(max, v);
  }


  const width = max - min;


  // 極端に大きな数値への対策
  const scale =
    Math.max(
      Math.abs(min),
      Math.abs(max)
    ) || 1;


  return values.map(v => {

    if (v === null) {
      return null;
    }


    // 定数データは0として扱う
    if (min === max) {
      return 0;
    }


    return Number.isFinite(width)

      ? (v - min) / width

      : (v / scale - min / scale)
        / (max / scale - min / scale);
  });
}



/* ========================================
   Z-score標準化
======================================== */

export function zScore(values) {

  validate(values);


  // 数値のオーバーフロー対策として
  // 最大絶対値を取得する
  let scale = 0;


  for (const v of values) {

    if (v !== null) {

      scale = Math.max(
        scale,
        Math.abs(v)
      );
    }
  }


  // すべて0または欠損値の場合
  if (scale === 0) {

    return values.map(
      v => v === null ? null : 0
    );
  }


  let n = 0;

  let mean = 0;

  let m2 = 0;


  // Welford法で平均・偏差平方和を計算
  for (const v of values) {

    if (v === null) continue;


    const x = v / scale;

    n++;


    const delta = x - mean;

    mean += delta / n;

    m2 += delta * (x - mean);
  }


  // 母標準偏差
  const sd = Math.sqrt(
    Math.max(0, m2 / n)
  );


  return values.map(v => {

    if (v === null) {
      return null;
    }


    // 標準偏差が0の場合
    if (sd === 0) {
      return 0;
    }


    return finite(
      (v / scale - mean) / sd
    );
  });
}

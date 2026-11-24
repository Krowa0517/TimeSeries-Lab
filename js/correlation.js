// 有限の数値または null のみを許可する
function validate(values) {
  if (!Array.isArray(values)) {
    throw new TypeError("配列を指定してください。");
  }

  for (const v of values) {
    if (v !== null && !Number.isFinite(v)) {
      throw new TypeError("有限の数値またはnullを指定してください。");
    }
  }
}

// 欠損値を行単位で除外する
export function pairedValues(a, b) {
  validate(a);
  validate(b);

  if (a.length !== b.length) {
    throw new Error("データ数が一致しません。");
  }

  const x = [],
    y = [];

  for (let i = 0; i < a.length; i++) {
    if (a[i] === null || b[i] === null) {
      continue;
    }

    x.push(a[i]);
    y.push(b[i]);
  }

  return {
    x,
    y,
    count: a.length,
    validCount: x.length,
  };
}

// 有効なデータだけを受け取りPearson相関を計算
function pearsonCore(x, y) {
  if (x.length < 2) return null;

  let sx = 0,
    sy = 0;

  // オーバーフローを抑えるためのスケール
  for (let i = 0; i < x.length; i++) {
    sx = Math.max(sx, Math.abs(x[i]));
    sy = Math.max(sy, Math.abs(y[i]));
  }

  if (sx === 0 || sy === 0) return null;

  let mx = 0,
    my = 0;
  let xx = 0,
    yy = 0,
    xy = 0;

  // 平均・偏差平方和・偏差積和を逐次更新
  for (let i = 0; i < x.length; i++) {
    const a = x[i] / sx;
    const b = y[i] / sy;

    const dx = a - mx;
    const dy = b - my;

    mx += dx / (i + 1);
    my += dy / (i + 1);

    xx += dx * (a - mx);
    yy += dy * (b - my);
    xy += dx * (b - my);
  }

  // 分散が0の場合、相関係数は定義できない
  if (xx <= 0 || yy <= 0) return null;

  const r = xy / Math.sqrt(xx) / Math.sqrt(yy);

  // 浮動小数点数の丸め誤差への対策
  return Number.isFinite(r) ? Math.max(-1, Math.min(1, r)) : null;
}

// 同順位には平均順位を付ける
function ranks(values) {
  // 元データのインデックスを値の昇順で並べる
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);

  const result = Array(values.length);

  for (let i = 0; i < order.length; ) {
    let j = i + 1;

    // 同じ値が続く範囲を探索する
    while (j < order.length && values[order[j]] === values[order[i]]) {
      j++;
    }

    // 同じ値には平均順位を割り当てる
    const rank = (i + 1 + j) / 2;

    for (let k = i; k < j; k++) {
      result[order[k]] = rank;
    }

    i = j;
  }

  return result;
}

// 相関係数を算出する共通インターフェース
export function correlation(a, b, method = "pearson") {
  if (!["pearson", "spearman"].includes(method)) {
    throw new Error("未対応の相関分析です。");
  }

  const { x, y, count, validCount } = pairedValues(a, b);

  const r =
    method === "spearman" ? pearsonCore(ranks(x), ranks(y)) : pearsonCore(x, y);

  return {
    r,
    count,
    validCount,
    excludedCount: count - validCount,
  };
}

// 行列の対称性を利用して上三角だけを計算する
export function correlationMatrix(columns, method = "pearson") {
  if (!Array.isArray(columns) || columns.length < 2) {
    throw new Error("2列以上を指定してください。");
  }

  const matrix = Array.from({ length: columns.length }, () =>
    Array(columns.length),
  );

  for (let i = 0; i < columns.length; i++) {
    for (let j = i; j < columns.length; j++) {
      const result = correlation(columns[i].values, columns[j].values, method);

      matrix[i][j] = result;
      matrix[j][i] = result;
    }
  }

  return {
    names: columns.map((c) => c.name),
    matrix,
  };
}

/**
 * TimeSeries Lab
 * export.js
 *
 * CSV・PNGファイルの生成と保存
 */

// CSVの1セルをエンコードする
function encodeCell(value, safeText) {
  if (value === null) return "";

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("有限の数値が必要です。");
    }

    return String(value);
  }

  if (typeof value !== "string") {
    throw new TypeError("数値・文字列・nullのみ出力できます。");
  }

  // 表計算ソフトでの数式解釈を抑止する
  if (safeText && /^(?:[\s\uFEFF]*[=+\-@＝＋－＠]|[\t\r\n])/.test(value)) {
    value = "'" + value;
  }

  // 引用符をエスケープする
  return '"' + value.replaceAll('"', '""') + '"';
}

/* ========================================
   CSV生成
======================================== */

export function toCSV(headers, rows, { bom = true, safeText = true } = {}) {
  if (
    !Array.isArray(headers) ||
    !headers.length ||
    !headers.every((h) => typeof h === "string" && h.trim())
  ) {
    throw new Error("有効なヘッダーが必要です。");
  }

  if (new Set(headers).size !== headers.length) {
    throw new Error("ヘッダーが重複しています。");
  }

  const encoded = headers.map((h) => encodeCell(h, safeText));

  if (new Set(encoded).size !== encoded.length) {
    throw new Error("安全化後のヘッダーが重複しています。");
  }

  const lines = [encoded.join(",")];

  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== headers.length) {
      throw new Error("列数が一致しません。");
    }

    lines.push(row.map((v) => encodeCell(v, safeText)).join(","));
  }

  return (bom ? "\uFEFF" : "") + lines.join("\r\n") + "\r\n";
}

/* ========================================
   データセットの出力
======================================== */

export function datasetRows(dataset, names, start = 0, end = dataset.rowCount) {
  // 出力範囲の検証
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end > dataset.rowCount
  ) {
    throw new RangeError("出力範囲が不正です。");
  }

  if (!Array.isArray(names) || new Set(names).size !== names.length) {
    throw new Error("出力列が不正です。");
  }

  // 対象のデータ列を取得する
  const columns = names.map((name) => {
    const c = dataset.columns.find((c) => c.name === name);

    if (!c) {
      throw new Error(`列が存在しません：${name}`);
    }

    return c;
  });

  // 現在使用している横軸も出力する
  const base = `axis_${dataset.axis.unit}`;

  let axisName = base;
  let suffix = 2;

  // 横軸名の重複を防止する
  while (names.includes(axisName)) {
    axisName = `${base}_${suffix++}`;
  }

  return {
    headers: [axisName, ...names],

    rows: Array.from({ length: end - start }, (_, k) => {
      const i = start + k;

      return [dataset.axis.values[i], ...columns.map((c) => c.values[i])];
    }),
  };
}

/* ========================================
   ファイル名の生成
======================================== */

export function outputFilename(name, suffix, extension) {
  const base =
    String(name)
      .replace(/\.(csv|tsv|txt)$/i, "")

      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")

      .trim()

      .replace(/[. ]+$/g, "") || "dataset";

  return `${base.slice(0, 100)}_${suffix}.${extension}`;
}

/* ========================================
   ブラウザからファイルを保存
======================================== */

export function downloadBlob(blob, filename) {
  // Blobから一時的なURLを生成する
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.append(link);

  try {
    link.click();
  } finally {
    link.remove();

    // 使用済みのURLを解放する
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}

/* ========================================
   グラフのPNG出力
======================================== */

export function chartPNG(panels) {
  if (!panels.length) {
    throw new Error("出力するグラフがありません。");
  }

  const width = 1200;

  // 各グラフの出力サイズを計算する
  const layout = panels.map(({ canvas, group }) => {
    if (!canvas.width || !canvas.height) {
      throw new Error("グラフを描画してから保存してください。");
    }

    return {
      canvas,

      group,

      h: Math.max(1, Math.round((canvas.height * width) / canvas.width)),

      legendHeight: group.length * 24 + 12,
    };
  });

  const height = layout.reduce((sum, p) => sum + p.h + p.legendHeight + 16, 0);

  // 過大な画像の生成を防止する
  if (height > 8192 || width * height > 16000000) {
    throw new Error("画像が大きすぎます。表示項目を減らしてください。");
  }

  // 出力専用のCanvasを生成する
  const out = document.createElement("canvas");

  out.width = width;
  out.height = height;

  const ctx = out.getContext("2d");

  // 背景を描画する
  ctx.fillStyle = "#111821";
  ctx.fillRect(0, 0, width, height);

  ctx.font = "16px system-ui, sans-serif";

  let y = 0;

  for (const p of layout) {
    // 凡例を描画する
    for (const [i, s] of p.group.entries()) {
      ctx.fillStyle = s.color;

      ctx.fillRect(16, y + 12 + i * 24, 24, 3);

      ctx.fillStyle = "#e7edf5";

      ctx.fillText(s.name, 52, y + 20 + i * 24, width - 68);
    }

    // 既存のグラフを転写する
    ctx.drawImage(p.canvas, 0, y + p.legendHeight, width, p.h);

    y += p.h + p.legendHeight + 16;
  }

  // CanvasをPNG形式に変換する
  return new Promise((resolve, reject) => {
    out.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("PNG生成に失敗しました。")),

      "image/png",
    );
  });
}

import { detectPeaks, peakIntervals } from "./peaks.js";

import {
  difference,
  derivative,
  absoluteValues,
  constantOperation,
  columnOperation,
  vectorMagnitude,
  minMaxNormalize,
  zScore,
} from "./transforms.js";

import { applyFilter } from "./filters.js";

import { DatasetManager } from "./dataset.js";

import { TimeSeriesChart } from "./chart.js";

import { summarize, compareErrors, rangeIndices } from "./statistics.js";

/* ========================================
   アプリケーションの状態管理
======================================== */

// データセット管理オブジェクト
const manager = new DatasetManager();

// データセットごとの表示項目を管理
const selections = new Map();

// 現在選択されているデータセットID
let activeId = null;

// ファイル読み込み中かどうか
let busy = false;

// HTML要素を取得する補助関数
const $ = (id) => document.getElementById(id);
// グラフ描画オブジェクト
const chart = new TimeSeriesChart($("chart-area"));
// 統計量の再計算タイマー
let statisticsTimer = null;

// グラフの表示範囲が変化した場合
chart.onViewChange = scheduleStatistics;

// プレビューする最大行数
const previewLimit = 12;

// ピーク検出時のデータセット・横軸・選択項目
let peakContext = null;

// 項目別の閾値入力欄
const peakThresholdInputs = new Map();

/* ========================================
   共通処理
======================================== */

// 状態やエラーメッセージを表示する
function status(message, error = false) {
  $("status").textContent = message;

  $("status").classList.toggle("error", error);
}

// 現在のデータセットを取得する
function current() {
  return activeId === null ? null : manager.getDataset(activeId);
}

// select要素の選択肢を生成する
function option(value, label) {
  const el = document.createElement("option");

  el.value = value;

  el.textContent = label;

  return el;
}

// 数値列だけを取得する
function numericColumns(dataset) {
  return dataset.columns.filter((c) => c.type === "number");
}

// 新しいデータセットを登録する
function register(name, text, delimiter = "auto") {
  const dataset = manager.addCSV(name, text, { delimiter });

  const columns = numericColumns(dataset);

  // 時刻列の候補を初期表示から除外する
  const candidates = columns.filter(
    (c) => !dataset.timeCandidates.includes(c.name),
  );

  // 初期状態では最大3項目を選択する
  const initialColumns = candidates.length ? candidates : columns;

  selections.set(
    dataset.id,

    new Set(initialColumns.slice(0, 3).map((c) => c.name)),
  );

  activeId = dataset.id;
}

// 読み込み中の操作を制御する
function setBusy(value) {
  busy = value;

  $("file-input").disabled = value;

  $("sample-button").disabled = value;

  $("encoding").disabled = value;

  $("delimiter").disabled = value;
}

/* ========================================
   横軸設定
======================================== */

function updateAxisInputs(preferred = $("axis-column").value) {
  const dataset = current();

  const kind = $("axis-kind").value;

  // 横軸の形式に応じて選択可能な列を変更する
  const columns =
    !dataset || kind === "index"
      ? []
      : kind === "numeric"
        ? numericColumns(dataset)
        : dataset.columns.filter(
            (c) => c.type === "text" || c.type === "mixed",
          );

  // 横軸候補を更新する
  $("axis-column").replaceChildren(
    ...columns.map((c) => option(c.name, c.name)),
  );

  // 既存の選択、または時刻列の候補を優先する
  const choice =
    columns.find((c) => c.name === preferred) ||
    columns.find((c) => dataset.timeCandidates.includes(c.name));

  if (choice) {
    $("axis-column").value = choice.name;
  }

  // 入力可能な項目を制御する
  $("axis-column").disabled = kind === "index" || !columns.length;

  $("axis-unit").disabled = kind !== "numeric";

  $("apply-axis").disabled = !dataset || (kind !== "index" && !columns.length);
}

/* ========================================
   表示項目の生成
======================================== */

function renderColumns(dataset) {
  const list = $("column-list");

  list.replaceChildren();

  const selected = dataset ? selections.get(dataset.id) : new Set();

  const columns = dataset ? numericColumns(dataset) : [];

  $("select-all").disabled = $("select-none").disabled = !columns.length;

  // 数値列が存在しない場合
  if (!columns.length) {
    list.textContent = "数値列がありません。";
  }

  // 数値列ごとにチェックボックスを生成する
  for (const column of columns) {
    const label = document.createElement("label");

    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";

    checkbox.checked = selected.has(column.name);

    // チェック状態の変更を検出する
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selected.add(column.name);
      } else {
        selected.delete(column.name);
      }

      renderSelection();
    });

    label.append(
      checkbox,

      document.createTextNode(column.name),
    );

    // 加工データの場合は識別ラベルを表示する
    if (column.derived) {
      const tag = document.createElement("span");

      tag.className = "derived-tag";

      tag.textContent = "加工";

      tag.title = column.operation ?? "";

      label.append(tag);
    }

    list.append(label);
  }

  renderSelection();
}

/* ========================================
   統計分析
======================================== */

// 統計量を表示用の文字列に変換する
function formatStatistic(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return Number(value.toPrecision(7)).toString();
}

// テーブルに結果を追加する
function appendAnalysisRow(body, values) {
  const row = body.insertRow();

  for (const value of values) {
    const cell = row.insertCell();

    cell.textContent = String(value);
  }
}

// 分析範囲を取得する
function getAnalysisRange(dataset) {
  // 全区間の場合
  if ($("stats-scope").value === "all") {
    return [0, dataset.rowCount];
  }

  // グラフの表示区間の場合
  return rangeIndices(
    dataset.axis.values,

    chart.view[0],

    chart.view[1],
  );
}

// データセット変更時に
// 誤差分析の選択肢を更新する
function refreshStatisticsControls() {
  const dataset = current();

  const columns = dataset ? numericColumns(dataset) : [];

  const measured = $("error-measured");

  const reference = $("reference-column");

  // 以前の選択状態を取得する
  const previousMeasured = measured.value;

  const previousReference = reference.value;

  // 選択可能な項目を生成する
  measured.replaceChildren(...columns.map((c) => option(c.name, c.name)));

  reference.replaceChildren(...columns.map((c) => option(c.name, c.name)));

  // 元の選択項目が存在すれば維持する
  if (columns.some((c) => c.name === previousMeasured)) {
    measured.value = previousMeasured;
  } else if (dataset) {
    const first = columns.find(
      (c) =>
        c.name !== dataset.axis.column &&
        !dataset.timeCandidates.includes(c.name),
    );

    if (first) {
      measured.value = first.name;
    }
  }

  if (columns.some((c) => c.name === previousReference)) {
    reference.value = previousReference;
  } else {
    const other = columns.find((c) => c.name !== measured.value);

    if (other) {
      reference.value = other.name;
    }
  }

  $("error-settings").disabled = !columns.length;
}

// 誤差分析の結果を表示する
function renderErrorAnalysis(dataset, start, end) {
  const body = $("error-table").tBodies[0];

  body.replaceChildren();

  const info = $("error-info");

  const mode = $("reference-mode").value;

  // 基準値の形式に応じて入力欄を切り替える
  $("reference-value-field").hidden = mode !== "constant";

  $("reference-column-field").hidden = mode !== "column";

  if (!dataset || !numericColumns(dataset).length) {
    info.textContent = "分析可能な数値列がありません。";

    return;
  }

  try {
    const measuredName = $("error-measured").value;

    const measured = manager
      .getColumn(
        dataset.id,

        measuredName,
      )
      .values.slice(start, end);

    let reference;

    let referenceLabel;

    // 一定の基準値を使用する場合
    if (mode === "constant") {
      const input = $("reference-value");

      if (input.value.trim() === "") {
        info.textContent = "基準値を入力してください。";

        return;
      }

      reference = input.valueAsNumber;

      if (!Number.isFinite(reference)) {
        throw new Error("有効な基準値を入力してください。");
      }

      referenceLabel = String(reference);

      // 別のデータ列を基準とする場合
    } else {
      referenceLabel = $("reference-column").value;

      reference = manager
        .getColumn(
          dataset.id,

          referenceLabel,
        )
        .values.slice(start, end);
    }

    // 誤差を計算する
    const result = compareErrors(
      measured,

      reference,
    );

    appendAnalysisRow(body, [
      result.validCount,

      result.excludedCount,

      formatStatistic(result.meanError),

      formatStatistic(result.mae),

      formatStatistic(result.mse),

      formatStatistic(result.rmse),
    ]);

    info.textContent =
      `${measuredName} − ${referenceLabel}` +
      ` / ${result.count} サンプル` +
      (result.validCount === 0 ? "（有効なデータの組がありません）" : "");
  } catch (error) {
    info.textContent = error.message;
  }
}

// 基本統計量と誤差分析を更新する
function renderStatistics() {
  // 予約されていた処理を解除する
  clearTimeout(statisticsTimer);

  statisticsTimer = null;

  const body = $("stats-table").tBodies[0];

  body.replaceChildren();

  $("error-table").tBodies[0].replaceChildren();

  const dataset = current();

  if (!dataset) {
    $("stats-info").textContent = "データ未読み込み";

    renderErrorAnalysis(null, 0, 0);

    return;
  }

  const selected = selections.get(dataset.id);

  // 表示区間の分析には
  // グラフが存在する必要がある
  if ($("stats-scope").value === "visible" && selected.size === 0) {
    $("stats-info").textContent = "グラフの表示項目を選択してください。";

    $("error-info").textContent = "分析範囲を設定してください。";

    return;
  }

  const [start, end] = getAnalysisRange(dataset);

  // 分析対象のサンプル数
  $("stats-info").textContent =
    `${end - start} / ` + `${dataset.rowCount} サンプル`;

  const warnings = [];

  // 選択された項目を順番に分析する
  for (const name of selected) {
    try {
      const values = manager
        .getColumn(
          dataset.id,

          name,
        )
        .values.slice(start, end);

      const s = summarize(values);

      appendAnalysisRow(body, [
        name,

        s.count,

        s.validCount,

        s.missingCount,

        s.missingRate === null ? "—" : (s.missingRate * 100).toFixed(2) + "%",

        formatStatistic(s.mean),

        formatStatistic(s.median),

        formatStatistic(s.min),

        formatStatistic(s.max),

        formatStatistic(s.range),

        formatStatistic(s.variance),

        formatStatistic(s.stdDev),

        formatStatistic(s.q1),

        formatStatistic(s.q3),
      ]);
    } catch (error) {
      warnings.push(`${name}: ${error.message}`);
    }
  }

  if (warnings.length) {
    $("stats-info").textContent += " / " + warnings.join("、");
  }

  // 誤差分析にも同じ分析範囲を適用する
  renderErrorAnalysis(
    dataset,

    start,

    end,
  );
}

// グラフ操作時の統計再計算を予約する
function scheduleStatistics() {
  // 全区間分析の場合は
  // グラフを移動しても再計算しない
  if ($("stats-scope").value !== "visible") {
    return;
  }

  clearTimeout(statisticsTimer);

  // グラフ操作が落ち着いてから再計算する
  statisticsTimer = setTimeout(
    renderStatistics,

    120,
  );
}

/* ========================================
   フィルタ処理
======================================== */

// フィルタの種類に応じて入力欄を切り替える
function updateFilterInputs() {
  const method = $("filter-method").value;

  const isEMA = method === "ema";

  $("filter-size-field").hidden = isEMA;

  $("filter-direction-field").hidden = isEMA;

  $("filter-alpha-field").hidden = !isEMA;
}

// フィルタ操作画面を更新する
function refreshFilterControls() {
  const dataset = current();

  const selected = dataset ? selections.get(dataset.id) : new Set();

  const derived = dataset ? dataset.columns.filter((c) => c.derived) : [];

  $("filter-settings").disabled = !dataset;

  $("apply-filter").disabled = selected.size === 0;

  // 加工データの選択肢を更新する
  const select = $("derived-select");

  const previous = select.value;

  select.replaceChildren(...derived.map((c) => option(c.name, c.name)));

  // 以前の選択状態を可能な限り維持する
  if (derived.some((c) => c.name === previous)) {
    select.value = previous;
  }

  if (!derived.length) {
    select.append(option("", "加工データなし"));
  }

  select.disabled = !derived.length;

  $("remove-derived").disabled = !derived.length;

  $("filter-info").textContent = dataset
    ? `${selected.size} 項目選択中 / ` + `加工データ ${derived.length} 列`
    : "データを読み込んでください。";

  updateFilterInputs();
}

// 重複しない加工データの列名を生成する
function uniqueDerivedName(base, usedNames) {
  let name = base;

  let index = 2;

  while (usedNames.has(name)) {
    name = `${base}_${index}`;

    index++;
  }

  usedNames.add(name);

  return name;
}

// 選択されている項目にフィルタを適用する
function applySelectedFilters() {
  const dataset = current();

  if (!dataset) return;

  const selected = selections.get(dataset.id);

  if (!selected.size) {
    status("加工する項目を選択してください。", true);

    return;
  }

  try {
    // フィルタの設定を取得する
    const method = $("filter-method").value;

    const size = $("filter-size").valueAsNumber;

    const direction = $("filter-direction").value;

    const alpha = $("filter-alpha").valueAsNumber;

    // 窓幅を確認する
    if (method !== "ema" && size > dataset.rowCount) {
      throw new Error("窓幅がデータ数を超えています。");
    }

    // 既存の列名を取得する
    const usedNames = new Set(dataset.columns.map((c) => c.name));

    // 加工前の選択項目をコピーする
    const sourceNames = [...selected];

    // すべての計算を先に実施する
    // 計算エラーによる途中登録を防止する
    const pending = [];

    for (const sourceName of sourceNames) {
      const column = manager.getColumn(
        dataset.id,

        sourceName,
      );

      // フィルタを適用する
      const values = applyFilter(
        column.values,

        {
          method,

          size,

          direction,

          alpha,
        },
      );

      // 加工内容が分かる列名を生成する
      const suffix =
        method === "ema"
          ? `EMA_${alpha}`
          : `${method.toUpperCase()}_${size}_${direction}`;

      const name = uniqueDerivedName(
        `${sourceName}_${suffix}`,

        usedNames,
      );

      // 加工処理の情報を保存する
      const operation =
        method === "ema"
          ? `EMA(alpha=${alpha})`
          : `${method.toUpperCase()}` +
            `(size=${size}, direction=${direction})`;

      pending.push({
        name,

        values,

        sourceName,

        operation,
      });
    }

    // 計算が完了してから加工データを登録する
    for (const result of pending) {
      manager.addDerivedColumn(
        dataset.id,

        result.name,

        result.values,

        {
          sourceColumns: [result.sourceName],

          operation: result.operation,
        },
      );

      // 加工結果をグラフの表示項目に追加する
      selected.add(result.name);
    }

    // 画面を更新する
    render();

    // 有効値が存在しない加工結果を確認する
    const emptyResults = pending.filter((r) =>
      r.values.every((v) => v === null),
    );

    status(
      `${pending.length} 項目にフィルタを適用しました。` +
        (emptyResults.length
          ? `\n${emptyResults.length} 列は` + "有効な計算結果がありません。"
          : ""),

      emptyResults.length > 0,
    );
  } catch (error) {
    status(error.message, true);
  }
}

// 加工データを削除する
function removeSelectedDerived() {
  const dataset = current();

  if (!dataset) return;

  const name = $("derived-select").value;

  if (!name) return;

  try {
    manager.removeDerivedColumn(
      dataset.id,

      name,
    );

    // 表示項目からも削除する
    selections.get(dataset.id).delete(name);

    render();

    status(`加工データ「${name}」を削除しました。`);
  } catch (error) {
    status(error.message, true);
  }
}

/* ========================================
   データ変換・演算
======================================== */

// 処理の種類に応じて入力欄を切り替える
function updateTransformInputs() {
  const method = $("transform-method").value;

  $("transform-lag-field").hidden = !["difference", "derivative"].includes(
    method,
  );

  $("transform-operator-field").hidden = !["constant", "binary"].includes(
    method,
  );

  $("transform-constant-field").hidden = method !== "constant";

  $("transform-a-field").hidden = method !== "binary";

  $("transform-b-field").hidden = method !== "binary";
}

// データ変換用の操作画面を更新する
function refreshTransformControls() {
  const dataset = current();

  const columns = dataset ? numericColumns(dataset) : [];

  const selected = dataset ? selections.get(dataset.id) : new Set();

  const method = $("transform-method").value;

  // 項目間演算の選択肢を更新する
  for (const id of ["transform-a", "transform-b"]) {
    const select = $(id);

    const previous = select.value;

    select.replaceChildren(...columns.map((c) => option(c.name, c.name)));

    // 以前の選択状態を可能な限り維持
    if (columns.some((c) => c.name === previous)) {
      select.value = previous;
    } else {
      // 時刻列よりも測定項目を優先する
      const preferred = columns.filter(
        (c) =>
          c.name !== dataset?.axis.column &&
          !dataset?.timeCandidates.includes(c.name),
      );

      const candidates = preferred.length ? preferred : columns;

      const choice =
        id === "transform-b"
          ? (candidates.find((c) => c.name !== $("transform-a").value) ??
            candidates[0])
          : candidates[0];

      if (choice) {
        select.value = choice.name;
      }
    }
  }

  // 操作可能か判定する
  const canApply =
    method === "binary"
      ? columns.length >= 2
      : method === "magnitude"
        ? selected.size >= 2
        : selected.size > 0;

  $("transform-settings").disabled = !dataset || !columns.length;

  $("apply-transform").disabled = !canApply;

  const info = $("transform-info");

  if (!dataset) {
    info.textContent = "データを読み込んでください。";
  } else if (method === "binary") {
    info.textContent = "演算する2つのデータ列を指定してください。";
  } else if (method === "magnitude") {
    info.textContent =
      `${selected.size} 項目選択中。` + "2項目以上を選択してください。";
  } else if (method === "derivative" && dataset.axis.unit !== "s") {
    info.textContent = "時間微分には秒単位の横軸が必要です。";

    $("apply-transform").disabled = true;
  } else {
    info.textContent = `${selected.size} 項目に変換処理を適用できます。`;
  }

  updateTransformInputs();
}

// データ変換を実行する
function applySelectedTransforms() {
  const dataset = current();

  if (!dataset) return;

  const selected = selections.get(dataset.id);

  try {
    // 設定値の取得
    const method = $("transform-method").value;

    const lag = $("transform-lag").valueAsNumber;

    const operator = $("transform-operator").value;

    const constant = $("transform-constant").valueAsNumber;

    // 差分サンプル数の検証
    if (["difference", "derivative"].includes(method)) {
      if (!Number.isSafeInteger(lag) || lag < 1 || lag >= dataset.rowCount) {
        throw new Error(
          "差分サンプル数は1以上かつ" + "データ数未満にしてください。",
        );
      }
    }

    // 時間微分の場合は時刻単位を確認
    if (method === "derivative" && dataset.axis.unit !== "s") {
      throw new Error("横軸を秒単位の時刻データに設定してください。");
    }

    // 既存の列名を取得する
    const usedNames = new Set(dataset.columns.map((c) => c.name));

    // 加工結果の一時保存領域
    const pending = [];

    // 加工結果を登録予定リストに追加
    function prepare(base, values, sources, operation) {
      pending.push({
        name: uniqueDerivedName(base, usedNames),

        values,

        // 重複した参照元を除く
        sourceColumns: [...new Set(sources)],

        operation,
      });
    }

    /* ====================================
       データ列同士の四則演算
    ==================================== */

    if (method === "binary") {
      const a = manager.getColumn(
        dataset.id,

        $("transform-a").value,
      );

      const b = manager.getColumn(
        dataset.id,

        $("transform-b").value,
      );

      if (a.type !== "number" || b.type !== "number") {
        throw new Error("数値列を指定してください。");
      }

      const values = columnOperation(
        a.values,

        b.values,

        operator,
      );

      prepare(
        `${a.name}_${operator.toUpperCase()}_${b.name}`,

        values,

        [a.name, b.name],

        `ColumnOperation(${a.name}, ${operator}, ${b.name})`,
      );

      /* ====================================
       ベクトルの大きさ
    ==================================== */
    } else if (method === "magnitude") {
      const names = [...selected];

      if (names.length < 2) {
        throw new Error("2項目以上を選択してください。");
      }

      const columns = names.map(
        (name) =>
          manager.getColumn(
            dataset.id,

            name,
          ).values,
      );

      const values = vectorMagnitude(columns);

      prepare(
        `Magnitude_${names.join("_")}`,

        values,

        names,

        `Magnitude(${names.join(", ")})`,
      );

      /* ====================================
       各列に対する個別の変換処理
    ==================================== */
    } else {
      if (!selected.size) {
        throw new Error("加工する項目を選択してください。");
      }

      for (const name of [...selected]) {
        const column = manager.getColumn(
          dataset.id,

          name,
        );

        const sourceColumns = [name];

        let values;

        let suffix;

        let operation;

        switch (method) {
          // Nサンプル差分
          case "difference":
            values = difference(column.values, lag);

            suffix = `DIFF_${lag}`;

            operation = `Difference(lag=${lag})`;

            break;

          // 時間微分
          case "derivative":
            values = derivative(
              column.values,

              dataset.axis.values,

              lag,
            );

            suffix = `DERIV_${lag}`;

            operation =
              `Derivative(lag=${lag}, ` +
              `axis=${dataset.axis.label}, ` +
              `inputUnit=${dataset.axis.inputUnit})`;

            // 計算に使用した時刻列も記録する
            if (dataset.axis.column !== null) {
              sourceColumns.push(dataset.axis.column);
            }

            break;

          // 絶対値
          case "absolute":
            values = absoluteValues(column.values);

            suffix = "ABS";

            operation = "Absolute";

            break;

          // 定数演算
          case "constant":
            values = constantOperation(
              column.values,

              operator,

              constant,
            );

            suffix = `${operator.toUpperCase()}_${constant}`;

            operation = `ConstantOperation(${operator}, ${constant})`;

            break;

          // Min-Max正規化
          case "minmax":
            values = minMaxNormalize(column.values);

            suffix = "MINMAX";

            operation = "MinMax";

            break;

          // Z-score標準化
          case "zscore":
            values = zScore(column.values);

            suffix = "ZSCORE";

            operation = "ZScore(population)";

            break;

          default:
            throw new Error("未対応の変換処理です。");
        }

        prepare(
          `${name}_${suffix}`,

          values,

          sourceColumns,

          operation,
        );
      }
    }

    /* ====================================
       加工データの登録
    ==================================== */

    // すべての計算が完了してから登録する
    for (const result of pending) {
      manager.addDerivedColumn(
        dataset.id,

        result.name,

        result.values,

        {
          sourceColumns: result.sourceColumns,

          operation: result.operation,
        },
      );

      // 加工結果を表示項目に追加する
      selected.add(result.name);
    }

    // 画面を更新する
    render();

    const emptyResults = pending.filter((r) =>
      r.values.every((v) => v === null),
    );

    status(
      `${pending.length} 列の加工データを生成しました。` +
        (emptyResults.length
          ? `\n${emptyResults.length} 列は` + "有効な計算結果がありません。"
          : ""),

      emptyResults.length > 0,
    );
  } catch (error) {
    status(error.message, true);
  }
}

/* ========================================
   ピーク検出
======================================== */

// 検出方向を表示用文字列に変換する
function peakDirectionLabel(direction) {
  return direction === "positive" ? "正方向" : "負方向";
}

// 検出結果を消去する
function clearPeakResults(message = "検出条件を設定してください。") {
  $("peak-table").tBodies[0].replaceChildren();

  $("peak-summary-table").tBodies[0].replaceChildren();

  // グラフ上のマーカーも削除する
  chart.setPeakMarkers();

  $("peak-info").textContent = message;
}

// ピーク検出用の操作画面を更新する
function refreshPeakControls() {
  const dataset = current();

  const names = dataset ? [...selections.get(dataset.id)] : [];

  $("peak-settings").disabled = !dataset || !names.length;

  $("apply-peaks").disabled = !dataset || !names.length;

  // 選択項目を比較するための文字列
  const signature = JSON.stringify(names);

  // データセット・横軸・選択項目が
  // 以前と同じ場合は設定を維持する
  if (
    peakContext &&
    peakContext.id === dataset?.id &&
    peakContext.axis === dataset?.axis &&
    peakContext.signature === signature
  ) {
    return;
  }

  // 現在の設定を記録する
  peakContext = {
    id: dataset?.id,

    axis: dataset?.axis,

    signature,
  };

  // 同じデータセットの入力値を可能な限り保持
  const previous = new Map();

  for (const [name, entry] of peakThresholdInputs) {
    if (entry.datasetId === dataset?.id) {
      previous.set(name, entry.input.value);
    }
  }

  peakThresholdInputs.clear();

  const list = $("peak-threshold-list");

  list.replaceChildren();

  // 選択項目ごとに閾値入力欄を生成する
  for (const name of names) {
    const label = document.createElement("label");

    label.className = "peak-threshold-row";

    const text = document.createElement("span");

    text.textContent = name;

    const input = document.createElement("input");

    input.type = "number";

    input.step = "any";

    input.placeholder = "共通閾値";

    input.value = previous.get(name) ?? "";

    label.append(text, input);

    list.append(label);

    peakThresholdInputs.set(name, {
      datasetId: dataset.id,

      input,
    });
  }

  // 古い条件による検出結果を消去する
  clearPeakResults(
    names.length
      ? `${names.length} 項目を検出できます。`
      : "表示項目を選択してください。",
  );
}

// ピーク検出を実行する
function runPeakDetection() {
  const dataset = current();

  if (!dataset) return;

  const names = [...selections.get(dataset.id)];

  if (!names.length) return;

  clearPeakResults("ピークを検出しています。");

  try {
    /* ====================================
       検出条件の取得
    ==================================== */

    const direction = $("peak-direction").value;

    const threshold = $("peak-threshold").valueAsNumber;

    const minProminence = $("peak-prominence").valueAsNumber;

    const minDistance = $("peak-distance").valueAsNumber;

    const distanceUnit = $("peak-distance-unit").value;

    const scope = $("peak-scope").value;

    // 横軸の値
    const x = dataset.axis.values;

    /* ====================================
       検出範囲の設定
    ==================================== */

    let start = 0;

    let end = dataset.rowCount;

    // グラフの表示範囲だけを検出する場合
    if (scope === "visible") {
      [start, end] = rangeIndices(
        x,

        chart.view[0],

        chart.view[1],
      );
    }

    /* ====================================
       項目ごとのピーク検出
    ==================================== */

    const results = new Map();

    const summaries = [];

    const directions =
      direction === "both" ? ["positive", "negative"] : [direction];

    for (const name of names) {
      const column = manager.getColumn(
        dataset.id,

        name,
      );

      // 項目別の閾値を取得する
      const input = peakThresholdInputs.get(name)?.input;

      if (input?.validity.badInput) {
        throw new Error(`${name}の閾値が不正です。`);
      }

      // 個別設定がなければ共通閾値を使用
      const individualThreshold =
        input && input.value.trim() !== "" ? input.valueAsNumber : threshold;

      // ピーク検出を実行する
      const peaks = detectPeaks(
        column.values,

        x,

        {
          direction,

          threshold: individualThreshold,

          minProminence,

          minDistance,

          distanceUnit,

          start,

          end,
        },
      );

      results.set(name, peaks);

      // 正方向・負方向の統計量を別々に算出
      for (const d of directions) {
        const count = peaks.filter((p) => p.direction === d).length;

        // 同じ方向のピーク間隔を計算
        const intervals = peakIntervals(peaks, d);

        // statistics.jsを再利用する
        const stats = summarize(intervals);

        summaries.push({
          name,

          direction: d,

          count,

          intervalCount: intervals.length,

          mean: stats.mean,

          stdDev: stats.stdDev,
        });
      }
    }

    /* ====================================
       検出結果の概要を表示する
    ==================================== */

    const summaryBody = $("peak-summary-table").tBodies[0];

    for (const s of summaries) {
      appendAnalysisRow(summaryBody, [
        s.name,

        peakDirectionLabel(s.direction),

        s.count,

        s.intervalCount,

        formatStatistic(s.mean),

        formatStatistic(s.stdDev),
      ]);
    }

    /* ====================================
       検出ピーク一覧を表示する
    ==================================== */

    const body = $("peak-table").tBodies[0];

    // 大量のDOM要素が生成されることを防ぐ
    const displayLimit = 500;

    let displayed = 0;

    let total = 0;

    for (const [name, peaks] of results) {
      total += peaks.length;

      for (let i = 0; i < peaks.length; i++) {
        if (displayed >= displayLimit) {
          break;
        }

        const p = peaks[i];

        appendAnalysisRow(body, [
          name,

          i + 1,

          peakDirectionLabel(p.direction),

          p.index,

          formatStatistic(p.x),

          formatStatistic(p.value),

          formatStatistic(p.prominence),
        ]);

        displayed++;
      }
    }

    /* ====================================
       グラフ上のマーカーを更新する
    ==================================== */

    chart.setPeakMarkers(results);

    /* ====================================
       検出条件と結果を表示する
    ==================================== */

    const rangeLabel =
      scope === "all"
        ? "全区間"
        : `${formatStatistic(chart.view[0])}` +
          ` ～ ${formatStatistic(chart.view[1])}`;

    $("peak-info").textContent =
      `${names.length} 項目 / ` +
      `${total} ピークを検出 / ` +
      `対象 ${end - start} サンプル / ` +
      `検出範囲：${rangeLabel} / ` +
      `横軸：${dataset.axis.label}` +
      (total > displayLimit ? `（一覧は先頭${displayLimit}件まで表示）` : "");

    status(`${total} 件のピークを検出しました。`);
  } catch (error) {
    clearPeakResults(error.message);

    status(error.message, true);
  }
}

/**
 * 選択された項目のグラフを表示する
 */
function renderSelection() {
  const dataset = current();

  const selected = dataset ? selections.get(dataset.id) : new Set();

  // 選択項目数を表示する
  $("selection-count").textContent = `${selected.size} 項目選択中`;

  // 選択された項目のX・Yデータを取得する
  const series = dataset
    ? [...selected].map((name) => manager.getSeries(dataset.id, name))
    : [];

  // グラフの表示設定を取得する
  const mode = $("chart-mode").value;

  const normalized = $("chart-scale").value === "normalized";

  // グラフを描画する
  chart.setSeries(
    series,

    {
      mode,

      normalized,
    },
  );

  // 統計量も更新する
  renderStatistics();

  refreshFilterControls();

  refreshTransformControls();

  refreshPeakControls();
}

/* ========================================
   データプレビュー
======================================== */

function renderPreview(dataset) {
  const table = $("preview-table");

  // 古いテーブルを削除する
  table.tHead.replaceChildren();

  const body = table.tBodies[0];

  body.replaceChildren();

  if (!dataset) {
    $("preview-info").textContent = "データ未読み込み";

    return;
  }

  // ヘッダー行を生成する
  const head = table.tHead.insertRow();

  const headers = ["行", ...dataset.columns.map((c) => c.name)];

  for (const name of headers) {
    const th = document.createElement("th");

    th.scope = "col";

    th.textContent = name;

    head.append(th);
  }

  // 最大12行まで表示する
  const count = Math.min(
    previewLimit,

    dataset.rowCount,
  );

  for (let i = 0; i < count; i++) {
    const row = body.insertRow();

    row.insertCell().textContent = String(i + 1);

    for (const column of dataset.columns) {
      const cell = row.insertCell();

      const value = column.values[i];

      // 欠損値と通常の値を区別する
      cell.textContent = value === null ? "—" : String(value);

      if (value === null) {
        cell.className = "missing";
      } else if (typeof value === "number") {
        cell.className = "number";
      }
    }
  }

  $("preview-info").textContent =
    `先頭 ${count} / ${dataset.rowCount} 行` + "（— は欠損）";
}

/* ========================================
   画面全体の更新
======================================== */

function render() {
  const datasets = manager.listDatasets();

  const dataset = current();

  // データセット一覧を更新
  const select = $("dataset-select");

  select.replaceChildren(
    ...datasets.map((d) => option(d.id, `${d.name} (${d.id})`)),
  );

  if (!dataset) {
    select.append(option("", "未読み込み"));
  }

  select.value = activeId ?? "";

  select.disabled = $("remove-button").disabled = !dataset;

  // 横軸設定を更新
  $("axis-settings").disabled = !dataset;

  $("axis-kind").value = dataset?.axis.kind ?? "index";

  $("axis-unit").value = dataset?.axis.inputUnit ?? "raw";

  updateAxisInputs(dataset?.axis.column ?? "");

  $("axis-summary").textContent = dataset
    ? `適用中：${dataset.axis.label}`
    : "未設定";

  // 行数
  $("row-count").textContent = dataset
    ? dataset.rowCount.toLocaleString()
    : "—";

  // 列数
  $("column-count").textContent = dataset
    ? dataset.columns.length.toLocaleString()
    : "—";

  // 欠損値の総数
  $("missing-count").textContent = dataset
    ? dataset.columns
        .reduce((sum, c) => sum + c.missingCount, 0)
        .toLocaleString()
    : "—";

  // 表示項目とプレビューを更新
  // 統計分析用の選択肢を更新する
  refreshStatisticsControls();

  renderColumns(dataset);

  renderPreview(dataset);
}

/* ========================================
   CSV・TSVファイルの読み込み
======================================== */

$("file-input").addEventListener(
  "change",

  async (event) => {
    const files = [...event.target.files];

    if (!files.length || busy) {
      return;
    }

    // 区切り文字を取得する
    const delimiter = {
      auto: "auto",

      comma: ",",

      tab: "\t",

      semicolon: ";",
    }[$("delimiter").value];

    // 文字コードを取得する
    const encoding = $("encoding").value;

    const errors = [];

    let loaded = 0;

    setBusy(true);

    status("読み込み中…");

    try {
      // 選択されたファイルを順番に読み込む
      for (const file of files) {
        try {
          // ファイルをバイナリデータとして取得
          const buffer = await file.arrayBuffer();

          // 指定された文字コードで文字列に変換
          const decoder = new TextDecoder(
            encoding,

            { fatal: true },
          );

          const text = decoder.decode(buffer);

          // データセットとして登録
          register(file.name, text, delimiter);

          loaded++;
        } catch (error) {
          errors.push(`${file.name}: ${error.message}`);
        }
      }

      render();

      status(
        [
          `${loaded} / ${files.length} ` + "ファイルを読み込みました。",

          ...errors,
        ].join("\n"),

        errors.length > 0,
      );
    } finally {
      // 同じファイルを再選択できるようにする
      event.target.value = "";

      setBusy(false);
    }
  },
);

/* ========================================
   サンプルデータの読み込み
======================================== */

$("sample-button").addEventListener(
  "click",

  async () => {
    if (busy) {
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("./samples/environment.csv");

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();

      register("environment.csv", text);

      render();

      status("人工サンプルを読み込みました。");
    } catch (error) {
      status(
        "サンプルの読み込みに失敗しました：" + error.message,

        true,
      );
    } finally {
      setBusy(false);
    }
  },
);

/* ========================================
   データセットの切り替え
======================================== */

$("dataset-select").addEventListener(
  "change",

  (event) => {
    activeId = event.target.value;

    render();

    status(`${current().name} を表示しています。`);
  },
);

/* ========================================
   データセットの削除
======================================== */

$("remove-button").addEventListener(
  "click",

  () => {
    if (!current()) {
      return;
    }

    manager.removeDataset(activeId);

    selections.delete(activeId);

    // 残っているデータセットを選択する
    activeId = manager.listDatasets()[0]?.id ?? null;

    render();

    status("データセットを削除しました。");
  },
);

/* ========================================
   横軸設定の変更
======================================== */

$("axis-kind").addEventListener(
  "change",

  () => updateAxisInputs(),
);

$("apply-axis").addEventListener(
  "click",

  () => {
    if (!current()) {
      return;
    }

    try {
      manager.setAxis(
        activeId,

        {
          kind: $("axis-kind").value,

          column: $("axis-column").value,

          unit: $("axis-unit").value,
        },
      );

      render();

      status("横軸を変更しました。");
    } catch (error) {
      status(error.message, true);
    }
  },
);

/* ========================================
   表示項目の全選択
======================================== */

$("select-all").addEventListener(
  "click",

  () => {
    const dataset = current();

    if (!dataset) {
      return;
    }

    selections.set(
      activeId,

      new Set(numericColumns(dataset).map((c) => c.name)),
    );

    renderColumns(dataset);
  },
);

/* ========================================
   表示項目の選択解除
======================================== */

$("select-none").addEventListener(
  "click",

  () => {
    const dataset = current();

    if (!dataset) {
      return;
    }

    selections.set(activeId, new Set());

    renderColumns(dataset);
  },
);

/* ========================================
   初期画面の表示
======================================== */

/* ========================================
   グラフ表示設定
======================================== */

// 重ね合わせ・個別表示の切り替え
$("chart-mode").addEventListener(
  "change",

  () => {
    renderSelection();
  },
);

// 元データ・正規化表示の切り替え
$("chart-scale").addEventListener(
  "change",

  () => {
    renderSelection();
  },
);

// グラフの表示範囲をリセット
$("reset-chart").addEventListener(
  "click",

  () => {
    chart.resetView();
  },
);

/* ========================================
   統計分析の操作イベント
======================================== */

// 分析範囲の変更
$("stats-scope").addEventListener(
  "change",

  renderStatistics,
);

// 測定対象の変更
$("error-measured").addEventListener(
  "change",

  renderStatistics,
);

// 基準値の形式の変更
$("reference-mode").addEventListener(
  "change",

  renderStatistics,
);

// 基準値の変更
$("reference-value").addEventListener(
  "input",

  renderStatistics,
);

// 基準データ列の変更
$("reference-column").addEventListener(
  "change",

  renderStatistics,
);

/* ========================================
   フィルタ処理の操作イベント
======================================== */

// フィルタの種類を変更
$("filter-method").addEventListener(
  "change",

  updateFilterInputs,
);

// フィルタを適用する
$("apply-filter").addEventListener(
  "click",

  applySelectedFilters,
);

// 加工データを削除する
$("remove-derived").addEventListener(
  "click",

  removeSelectedDerived,
);

/* ========================================
   データ変換の操作イベント
======================================== */

// 処理の種類を変更する
$("transform-method").addEventListener(
  "change",

  refreshTransformControls,
);

// データ変換を実行する
$("apply-transform").addEventListener(
  "click",

  applySelectedTransforms,
);

/* ========================================
   ピーク検出の操作イベント
======================================== */

// 検出条件が変更された場合
$("peak-settings").addEventListener(
  "input",

  () => {
    clearPeakResults("検出条件が変更されました。再検出してください。");
  },
);

// ピーク検出を実行する
$("apply-peaks").addEventListener(
  "click",

  runPeakDetection,
);

// 検出結果を消去する
$("clear-peaks").addEventListener(
  "click",

  () => {
    clearPeakResults("検出結果を消去しました。");
  },
);

render();

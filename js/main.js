
import { DatasetManager } from './dataset.js';

import { TimeSeriesChart } from './chart.js';


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
const $ = id => document.getElementById(id);
// グラフ描画オブジェクト
const chart = new TimeSeriesChart(
  $('chart-area')
);

// プレビューする最大行数
const previewLimit = 12;



/* ========================================
   共通処理
======================================== */

// 状態やエラーメッセージを表示する
function status(message, error = false) {

  $('status').textContent = message;

  $('status').classList.toggle(
    'error',
    error
  );
}


// 現在のデータセットを取得する
function current() {

  return activeId === null
    ? null
    : manager.getDataset(activeId);
}


// select要素の選択肢を生成する
function option(value, label) {

  const el = document.createElement('option');

  el.value = value;

  el.textContent = label;

  return el;
}


// 数値列だけを取得する
function numericColumns(dataset) {

  return dataset.columns.filter(
    c => c.type === 'number'
  );
}


// 新しいデータセットを登録する
function register(
  name,
  text,
  delimiter = 'auto'
) {

  const dataset = manager.addCSV(
    name,
    text,
    { delimiter }
  );


  const columns = numericColumns(dataset);


  // 時刻列の候補を初期表示から除外する
  const candidates = columns.filter(
    c => !dataset.timeCandidates.includes(c.name)
  );


  // 初期状態では最大3項目を選択する
  const initialColumns =
    candidates.length ? candidates : columns;


  selections.set(

    dataset.id,

    new Set(
      initialColumns
        .slice(0, 3)
        .map(c => c.name)
    )
  );


  activeId = dataset.id;
}


// 読み込み中の操作を制御する
function setBusy(value) {

  busy = value;

  $('file-input').disabled = value;

  $('sample-button').disabled = value;

  $('encoding').disabled = value;

  $('delimiter').disabled = value;
}



/* ========================================
   横軸設定
======================================== */

function updateAxisInputs(
  preferred = $('axis-column').value
) {

  const dataset = current();

  const kind = $('axis-kind').value;


  // 横軸の形式に応じて選択可能な列を変更する
  const columns =
    !dataset || kind === 'index'
      ? []
      : kind === 'numeric'
        ? numericColumns(dataset)
        : dataset.columns.filter(
            c =>
              c.type === 'text' ||
              c.type === 'mixed'
          );


  // 横軸候補を更新する
  $('axis-column').replaceChildren(

    ...columns.map(
      c => option(c.name, c.name)
    )
  );


  // 既存の選択、または時刻列の候補を優先する
  const choice =

    columns.find(
      c => c.name === preferred
    )

    ||

    columns.find(
      c => dataset.timeCandidates.includes(c.name)
    );


  if (choice) {

    $('axis-column').value = choice.name;
  }


  // 入力可能な項目を制御する
  $('axis-column').disabled =

    kind === 'index' ||
    !columns.length;


  $('axis-unit').disabled =

    kind !== 'numeric';


  $('apply-axis').disabled =

    !dataset ||
    (
      kind !== 'index' &&
      !columns.length
    );
}



/* ========================================
   表示項目の生成
======================================== */

function renderColumns(dataset) {

  const list = $('column-list');

  list.replaceChildren();


  const selected = dataset
    ? selections.get(dataset.id)
    : new Set();


  const columns = dataset
    ? numericColumns(dataset)
    : [];


  $('select-all').disabled =
    $('select-none').disabled =
      !columns.length;


  // 数値列が存在しない場合
  if (!columns.length) {

    list.textContent =
      '数値列がありません。';
  }


  // 数値列ごとにチェックボックスを生成する
  for (const column of columns) {

    const label =
      document.createElement('label');


    const checkbox =
      document.createElement('input');


    checkbox.type = 'checkbox';


    checkbox.checked =
      selected.has(column.name);


    // チェック状態の変更を検出する
    checkbox.addEventListener(
      'change',
      () => {

        if (checkbox.checked) {

          selected.add(column.name);

        } else {

          selected.delete(column.name);
        }

        renderSelection();
      }
    );


    label.append(

      checkbox,

      document.createTextNode(
        column.name
      )
    );


    list.append(label);
  }


  renderSelection();
}



/**
 * 選択された項目のグラフを表示する
 */
function renderSelection() {

  const dataset = current();


  const selected = dataset

    ? selections.get(dataset.id)

    : new Set();


  // 選択項目数を表示する
  $('selection-count').textContent =

    `${selected.size} 項目選択中`;


  // 選択された項目のX・Yデータを取得する
  const series = dataset

    ? [...selected].map(name =>

        manager.getSeries(
          dataset.id,
          name
        )

      )

    : [];


  // グラフの表示設定を取得する
  const mode =
    $('chart-mode').value;

  const normalized =

    $('chart-scale').value ===
    'normalized';


  // グラフを描画する
  chart.setSeries(

    series,

    {

      mode,

      normalized
    }
  );
}




/* ========================================
   データプレビュー
======================================== */

function renderPreview(dataset) {

  const table = $('preview-table');


  // 古いテーブルを削除する
  table.tHead.replaceChildren();


  const body = table.tBodies[0];

  body.replaceChildren();


  if (!dataset) {

    $('preview-info').textContent =
      'データ未読み込み';

    return;
  }


  // ヘッダー行を生成する
  const head = table.tHead.insertRow();


  const headers = [

    '行',

    ...dataset.columns.map(
      c => c.name
    )
  ];


  for (const name of headers) {

    const th = document.createElement('th');

    th.scope = 'col';

    th.textContent = name;

    head.append(th);
  }


  // 最大12行まで表示する
  const count = Math.min(

    previewLimit,

    dataset.rowCount
  );


  for (let i = 0; i < count; i++) {

    const row = body.insertRow();


    row.insertCell().textContent =
      String(i + 1);


    for (const column of dataset.columns) {

      const cell = row.insertCell();

      const value = column.values[i];


      // 欠損値と通常の値を区別する
      cell.textContent = value === null

        ? '—'

        : String(value);


      if (value === null) {

        cell.className = 'missing';

      } else if (typeof value === 'number') {

        cell.className = 'number';
      }
    }
  }


  $('preview-info').textContent =

    `先頭 ${count} / ${dataset.rowCount} 行` +
    '（— は欠損）';
}



/* ========================================
   画面全体の更新
======================================== */

function render() {

  const datasets = manager.listDatasets();

  const dataset = current();


  // データセット一覧を更新
  const select = $('dataset-select');


  select.replaceChildren(

    ...datasets.map(
      d => option(
        d.id,
        `${d.name} (${d.id})`
      )
    )
  );


  if (!dataset) {

    select.append(
      option('', '未読み込み')
    );
  }


  select.value = activeId ?? '';


  select.disabled =
    $('remove-button').disabled =
      !dataset;


  // 横軸設定を更新
  $('axis-settings').disabled =
    !dataset;


  $('axis-kind').value =

    dataset?.axis.kind ?? 'index';


  $('axis-unit').value =

    dataset?.axis.inputUnit ?? 'raw';


  updateAxisInputs(

    dataset?.axis.column ?? ''
  );


  $('axis-summary').textContent =

    dataset

      ? `適用中：${dataset.axis.label}`

      : '未設定';


  // 行数
  $('row-count').textContent =

    dataset

      ? dataset.rowCount.toLocaleString()

      : '—';


  // 列数
  $('column-count').textContent =

    dataset

      ? dataset.columns.length.toLocaleString()

      : '—';


  // 欠損値の総数
  $('missing-count').textContent =

    dataset

      ? dataset.columns.reduce(
          (sum, c) => sum + c.missingCount,
          0
        ).toLocaleString()

      : '—';


  // 表示項目とプレビューを更新
  renderColumns(dataset);

  renderPreview(dataset);
}



/* ========================================
   CSV・TSVファイルの読み込み
======================================== */

$('file-input').addEventListener(

  'change',

  async event => {

    const files = [
      ...event.target.files
    ];


    if (!files.length || busy) {
      return;
    }


    // 区切り文字を取得する
    const delimiter = {

      auto: 'auto',

      comma: ',',

      tab: '\t',

      semicolon: ';'

    }[$('delimiter').value];


    // 文字コードを取得する
    const encoding = $('encoding').value;


    const errors = [];

    let loaded = 0;


    setBusy(true);

    status('読み込み中…');


    try {

      // 選択されたファイルを順番に読み込む
      for (const file of files) {

        try {

          // ファイルをバイナリデータとして取得
          const buffer = await file.arrayBuffer();


          // 指定された文字コードで文字列に変換
          const decoder = new TextDecoder(

            encoding,

            { fatal: true }
          );


          const text = decoder.decode(buffer);


          // データセットとして登録
          register(
            file.name,
            text,
            delimiter
          );


          loaded++;

        } catch (error) {

          errors.push(
            `${file.name}: ${error.message}`
          );
        }
      }


      render();


      status(

        [
          `${loaded} / ${files.length} ` +
          'ファイルを読み込みました。',

          ...errors

        ].join('\n'),

        errors.length > 0
      );

    } finally {

      // 同じファイルを再選択できるようにする
      event.target.value = '';

      setBusy(false);
    }
  }
);



/* ========================================
   サンプルデータの読み込み
======================================== */

$('sample-button').addEventListener(

  'click',

  async () => {

    if (busy) {
      return;
    }


    setBusy(true);


    try {

      const response = await fetch(
        './samples/environment.csv'
      );


      if (!response.ok) {

        throw new Error(
          `HTTP ${response.status}`
        );
      }


      const text = await response.text();


      register(
        'environment.csv',
        text
      );


      render();


      status(
        '人工サンプルを読み込みました。'
      );

    } catch (error) {

      status(

        'サンプルの読み込みに失敗しました：' +
        error.message,

        true
      );

    } finally {

      setBusy(false);
    }
  }
);



/* ========================================
   データセットの切り替え
======================================== */

$('dataset-select').addEventListener(

  'change',

  event => {

    activeId = event.target.value;


    render();


    status(
      `${current().name} を表示しています。`
    );
  }
);



/* ========================================
   データセットの削除
======================================== */

$('remove-button').addEventListener(

  'click',

  () => {

    if (!current()) {
      return;
    }


    manager.removeDataset(activeId);


    selections.delete(activeId);


    // 残っているデータセットを選択する
    activeId =

      manager.listDatasets()[0]?.id ?? null;


    render();


    status(
      'データセットを削除しました。'
    );
  }
);



/* ========================================
   横軸設定の変更
======================================== */

$('axis-kind').addEventListener(

  'change',

  () => updateAxisInputs()
);


$('apply-axis').addEventListener(

  'click',

  () => {

    if (!current()) {
      return;
    }


    try {

      manager.setAxis(

        activeId,

        {

          kind:
            $('axis-kind').value,

          column:
            $('axis-column').value,

          unit:
            $('axis-unit').value
        }
      );


      render();


      status(
        '横軸を変更しました。'
      );

    } catch (error) {

      status(
        error.message,
        true
      );
    }
  }
);



/* ========================================
   表示項目の全選択
======================================== */

$('select-all').addEventListener(

  'click',

  () => {

    const dataset = current();


    if (!dataset) {
      return;
    }


    selections.set(

      activeId,

      new Set(

        numericColumns(dataset).map(
          c => c.name
        )
      )
    );


    renderColumns(dataset);
  }
);



/* ========================================
   表示項目の選択解除
======================================== */

$('select-none').addEventListener(

  'click',

  () => {

    const dataset = current();


    if (!dataset) {
      return;
    }


    selections.set(
      activeId,
      new Set()
    );


    renderColumns(dataset);
  }
);



/* ========================================
   初期画面の表示
======================================== */


/* ========================================
   グラフ表示設定
======================================== */

// 重ね合わせ・個別表示の切り替え
$('chart-mode').addEventListener(

  'change',

  () => {

    renderSelection();
  }
);


// 元データ・正規化表示の切り替え
$('chart-scale').addEventListener(

  'change',

  () => {

    renderSelection();
  }
);


// グラフの表示範囲をリセット
$('reset-chart').addEventListener(

  'click',

  () => {

    chart.resetView();
  }
);

render();

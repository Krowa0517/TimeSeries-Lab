
import { parseCSV } from './csv.js';


// 時刻を秒に変換するための係数
const TIME_FACTORS = Object.freeze({
  s: 1,
  ms: 1e-3,
  us: 1e-6,
  min: 60,
  h: 3600
});


// 指定された列を取得する
function findColumn(dataset, name) {

  const column = dataset.columns.find(
    c => c.name === name
  );

  if (!column) {
    throw new Error(
      `列「${name}」が存在しません。`
    );
  }

  return column;
}


// データ列の変更を禁止する
function freezeColumn(column) {

  return Object.freeze({
    ...column,

    values: Object.freeze([
      ...column.values
    ]),

    sourceColumns: Object.freeze([
      ...column.sourceColumns
    ])
  });
}


// データセットの変更を禁止する
function freezeDataset(dataset) {

  return Object.freeze({
    ...dataset,

    columns: Object.freeze([
      ...dataset.columns
    ]),

    timeCandidates: Object.freeze([
      ...dataset.timeCandidates
    ])
  });
}


// ISO形式の日付・日時をUNIX秒に変換する
// 日時にはZまたはUTCオフセットを必須とする
// 日付のみの場合はUTCとして扱う
function parseDateTime(value) {

  if (typeof value !== 'string') {
    return NaN;
  }

  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|[+-]\d{2}:\d{2}))?$/.exec(
    value.trim()
  );

  if (!m) {
    return NaN;
  }

  const [
    ,
    date,
    h,
    min,
    s,
    fraction = '',
    zone
  ] = m;

  const midnight = new Date(
    `${date}T00:00:00Z`
  );

  // 存在しない日付を拒否する
  if (
    !Number.isFinite(midnight.getTime()) ||
    midnight.toISOString().slice(0, 10) !== date
  ) {
    return NaN;
  }

  // 日付のみの場合
  if (h === undefined) {
    return midnight.getTime() / 1000;
  }

  // 不正な時刻を拒否する
  if (+h > 23 || +min > 59 || +s > 59) {
    return NaN;
  }

  return Date.parse(
    `${date}T${h}:${min}:${s}${fraction}${zone}`
  ) / 1000;
}


// HH:mm:ss形式を午前0時からの秒数に変換する
function parseClock(value) {

  if (typeof value !== 'string') {
    return NaN;
  }

  const m = /^(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(
    value.trim()
  );

  if (!m) {
    return NaN;
  }

  const [, h, min, s] = m;

  if (+h > 23 || +min > 59 || +s >= 60) {
    return NaN;
  }

  return +h * 3600 + +min * 60 + +s;
}


// 横軸のデータが有効か確認する
function validateAxis(values) {

  for (let i = 0; i < values.length; i++) {

    // 欠損値や不正な数値を検出
    if (!Number.isFinite(values[i])) {

      throw new Error(
        `データ${i + 1}行目: ` +
        '横軸の値が不正または欠損しています。'
      );
    }

    // 横軸が厳密な昇順であるか確認
    if (
      i > 0 &&
      values[i] <= values[i - 1]
    ) {

      throw new Error(
        `データ${i + 1}行目: ` +
        '横軸は厳密な昇順である必要があります。'
      );
    }
  }
}


// 横軸データを生成する
function makeAxis(dataset, options = {}) {

  const {
    kind = 'index',
    column = null,
    unit = 'raw'
  } = options;

  let values;
  let label;
  let axisUnit;
  let origin = null;


  // サンプル番号を使用する場合
  if (kind === 'index') {

    values = Array.from(
      { length: dataset.rowCount },
      (_, i) => i
    );

    label = 'サンプル番号';
    axisUnit = 'sample';

  } else {

    const source = findColumn(
      dataset,
      column
    );


    // 数値列を使用する場合
    if (kind === 'numeric') {

      if (source.type !== 'number') {

        throw new Error(
          '数値列を指定してください。'
        );
      }

      if (
        unit !== 'raw' &&
        !Object.hasOwn(TIME_FACTORS, unit)
      ) {

        throw new Error(
          '未対応の時刻単位です。'
        );
      }

      const factor = unit === 'raw'
        ? 1
        : TIME_FACTORS[unit];

      values = source.values.map(
        v => v === null
          ? NaN
          : v * factor
      );

      axisUnit = unit === 'raw'
        ? 'raw'
        : 's';

      label = unit === 'raw'
        ? column
        : `${column} (s)`;


    // 日時または時刻を使用する場合
    } else if (
      kind === 'datetime' ||
      kind === 'clock'
    ) {

      const convert = kind === 'datetime'
        ? parseDateTime
        : parseClock;

      const absolute = source.values.map(
        convert
      );

      validateAxis(absolute);

      // 最初の測定時刻を基準とする
      origin = absolute[0];

      values = absolute.map(
        v => v - origin
      );

      axisUnit = 's';
      label = `${column} (経過秒)`;

    } else {

      throw new Error(
        '未対応の横軸形式です。'
      );
    }
  }


  // 横軸データを検証する
  validateAxis(values);


  return Object.freeze({

    kind,

    column: kind === 'index'
      ? null
      : column,

    unit: axisUnit,

    inputUnit: kind === 'numeric'
      ? unit
      : null,

    label,

    origin,

    values: Object.freeze(values)
  });
}


/**
 * データセット管理クラス
 *
 * 複数のCSVデータや加工データを管理する。
 */
export class DatasetManager {

  // データセットの保存領域
  #datasets = new Map();

  // データセットIDの連番
  #nextId = 1;


  /**
   * CSV文字列から新しいデータセットを作成する
   */
  addCSV(name, text, options = {}) {

    if (
      typeof name !== 'string' ||
      !name.trim()
    ) {

      throw new Error(
        'データセット名を指定してください。'
      );
    }


    // csv.jsを使用してCSVを解析する
    const parsed = parseCSV(
      text,
      options
    );


    if (parsed.rowCount === 0) {

      throw new Error(
        'データ行がありません。'
      );
    }


    const dataset = {

      id: `dataset-${this.#nextId}`,

      name: name.trim(),

      rowCount: parsed.rowCount,

      delimiter: parsed.delimiter,

      timeCandidates: parsed.timeCandidates,

      columns: parsed.columns.map(
        c => freezeColumn({
          ...c,
          derived: false,
          sourceColumns: [],
          operation: null
        })
      )
    };


    // 初期状態ではサンプル番号を横軸とする
    dataset.axis = makeAxis(dataset);


    const snapshot = freezeDataset(
      dataset
    );


    // データセットを保存する
    this.#datasets.set(
      snapshot.id,
      snapshot
    );


    this.#nextId++;

    return snapshot;
  }


  /**
   * 登録済みのデータセット一覧を取得する
   */
  listDatasets() {

    return [
      ...this.#datasets.values()
    ];
  }


  /**
   * IDからデータセットを取得する
   */
  getDataset(id) {

    const dataset = this.#datasets.get(id);

    if (!dataset) {

      throw new Error(
        `データセット「${id}」が存在しません。`
      );
    }

    return dataset;
  }


  /**
   * 指定されたデータ列を取得する
   */
  getColumn(id, name) {

    return findColumn(
      this.getDataset(id),
      name
    );
  }


  /**
   * データセットの横軸を設定する
   */
  setAxis(id, options = {}) {

    const dataset = this.getDataset(id);

    const axis = makeAxis(
      dataset,
      options
    );

    const next = freezeDataset({
      ...dataset,
      axis
    });

    this.#datasets.set(id, next);

    return next;
  }


  /**
   * グラフ描画や分析に必要なX・Yデータを取得する
   */
  getSeries(id, name) {

    const dataset = this.getDataset(id);

    const column = findColumn(
      dataset,
      name
    );

    if (column.type !== 'number') {

      throw new Error(
        '数値列を指定してください。'
      );
    }

    return Object.freeze({

      datasetId: id,

      name,

      x: dataset.axis.values,

      y: column.values,

      axis: dataset.axis
    });
  }


  /**
   * 加工結果を新しいデータ列として追加する
   */
  addDerivedColumn(
    id,
    name,
    values,
    {
      sourceColumns = [],
      operation = null
    } = {}
  ) {

    const dataset = this.getDataset(id);


    // 列名を検証する
    if (
      typeof name !== 'string' ||
      !name.trim()
    ) {

      throw new Error(
        '列名を指定してください。'
      );
    }

    name = name.trim();


    // 重複した列名を拒否する
    if (
      dataset.columns.some(
        c => c.name === name
      )
    ) {

      throw new Error(
        '重複した列名です。'
      );
    }


    // 元データと行数が一致するか確認する
    if (
      !Array.isArray(values) ||
      values.length !== dataset.rowCount
    ) {

      throw new Error(
        'データ数が元データと一致しません。'
      );
    }


    // 加工元の列を検証する
    if (!Array.isArray(sourceColumns)) {

      throw new Error(
        '元の列名は配列で指定してください。'
      );
    }

    for (const source of sourceColumns) {
      findColumn(dataset, source);
    }


    // 加工処理名を検証する
    if (
      operation !== null &&
      typeof operation !== 'string'
    ) {

      throw new Error(
        '処理名は文字列で指定してください。'
      );
    }


    // 加工データの値を検証する
    let missingCount = 0;

    for (const value of values) {

      if (value === null) {

        missingCount++;

      } else if (!Number.isFinite(value)) {

        throw new Error(
          '加工データには有限の数値または' +
          'nullを指定してください。'
        );
      }
    }


    // 新しい加工データ列を生成する
    const column = freezeColumn({

      name,

      type: 'number',

      values,

      missingCount,

      numericCount:
        values.length - missingCount,

      derived: true,

      sourceColumns,

      operation
    });


    // 元データを残したまま新しい列を追加する
    const next = freezeDataset({

      ...dataset,

      columns: [
        ...dataset.columns,
        column
      ]
    });


    this.#datasets.set(id, next);

    return column;
  }


  /**
   * 加工データ列を削除する
   */
  removeDerivedColumn(id, name) {

    const dataset = this.getDataset(id);

    const column = findColumn(
      dataset,
      name
    );


    // 元データは削除できない
    if (!column.derived) {

      throw new Error(
        '元データの列は削除できません。'
      );
    }


    // 横軸として使用中の列は削除できない
    if (dataset.axis.column === name) {

      throw new Error(
        '横軸に使用中の列は削除できません。'
      );
    }


    // 他の加工データが参照していないか確認する
    if (
      dataset.columns.some(
        c => c.sourceColumns.includes(name)
      )
    ) {

      throw new Error(
        '他の加工データが参照している列は' +
        '削除できません。'
      );
    }


    const next = freezeDataset({

      ...dataset,

      columns: dataset.columns.filter(
        c => c.name !== name
      )
    });


    this.#datasets.set(id, next);

    return next;
  }


  /**
   * データセット全体を削除する
   */
  removeDataset(id) {

    return this.#datasets.delete(id);
  }
}

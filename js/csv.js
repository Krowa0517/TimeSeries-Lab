
/**
 * TimeSeries Lab
 * csv.js
 *
 * CSV・TSV解析モジュール
 * 外部ライブラリは使用しない。
 */

// 対応する区切り文字
const DELIMITERS = [',', '\t', ';'];

// 数値判定用の正規表現
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;


/**
 * 文字列を数値に変換する。
 * 数値として扱えない場合はnullを返す。
 */
function numericValue(text) {
  const value = text.trim();

  if (!NUMBER.test(value)) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}


/**
 * CSV文字列を行・列に分解する。
 *
 * 状態：
 * start  : 項目の読み込み開始
 * plain  : 通常の文字列
 * quoted : 引用符の内部
 * closed : 引用符が閉じた直後
 */
function readRecords(text, delimiter, limit = Infinity) {

  const records = [];

  let fields = [];
  let field = '';
  let state = 'start';

  let line = 1;
  let recordLine = 1;
  let hadQuote = false;


  // エラー処理
  const fail = message => {
    throw new Error(`${line}行目: ${message}`);
  };


  // 現在の項目の読み込みを終了
  function endField() {
    fields.push(field);

    field = '';
    state = 'start';
  }


  // 現在の行の読み込みを終了
  function endRecord() {

    endField();

    // 空白行は無視する。
    // ただし、引用符付きの空セルは保持する。
    if (
      hadQuote ||
      fields.length > 1 ||
      fields[0].trim() !== ''
    ) {
      records.push({
        fields,
        line: recordLine
      });
    }

    fields = [];
    hadQuote = false;
  }


  // 文字を1文字ずつ解析する
  for (let i = 0; i < text.length; i++) {

    const ch = text[i];

    const newline =
      ch === '\n' || ch === '\r';


    // 引用符の内部にいる場合
    if (state === 'quoted') {

      if (ch === '"') {

        // 連続した引用符は1つの引用符として扱う
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          state = 'closed';
        }

      } else {

        field += ch;

        // 引用符内部の改行にも対応する
        if (newline) {

          if (
            ch === '\r' &&
            text[i + 1] === '\n'
          ) {
            field += text[++i];
          }

          line++;
        }
      }

      continue;
    }


    // 区切り文字を検出
    if (ch === delimiter) {
      endField();
      continue;
    }


    // 改行を検出
    if (newline) {

      endRecord();

      if (records.length >= limit) {
        return records;
      }

      // WindowsのCRLFに対応
      if (
        ch === '\r' &&
        text[i + 1] === '\n'
      ) {
        i++;
      }

      recordLine = ++line;

      continue;
    }


    // 閉じ引用符の後に不正な文字がある場合
    if (state === 'closed') {
      fail('閉じ引用符の後に不正な文字があります。');
    }


    // 引用符の開始
    if (ch === '"') {

      if (state !== 'start') {
        fail('引用符の位置が不正です。');
      }

      state = 'quoted';
      hadQuote = true;

    } else {

      // 通常の文字列
      field += ch;
      state = 'plain';
    }
  }


  // 引用符が閉じられていない場合
  if (state === 'quoted') {
    fail('引用符が閉じられていません。');
  }


  // 最終行に改行がない場合にも対応
  if (
    fields.length ||
    field !== '' ||
    hadQuote
  ) {
    endRecord();
  }

  return records;
}


/**
 * 区切り文字を自動判定する。
 *
 * カンマ・タブ・セミコロンの中から
 * ヘッダーを最も多くの列に分割できるものを選ぶ。
 */
function detectDelimiter(text) {

  const candidates = DELIMITERS.flatMap(delimiter => {

    try {

      const [header] = readRecords(
        text,
        delimiter,
        1
      );

      return [{
        delimiter,
        width: header?.fields.length ?? 0
      }];

    } catch {
      return [];
    }

  }).sort((a, b) => b.width - a.width);


  if (!candidates.length) {
    throw new Error(
      'CSVヘッダーを解析できません。'
    );
  }


  // 1列しかないデータにも対応する
  if (candidates[0].width <= 1) {
    return candidates[0].delimiter;
  }


  // 同じ列数の候補が存在する場合は手動指定を求める
  if (
    candidates[0].width ===
    candidates[1]?.width
  ) {
    throw new Error(
      '区切り文字が曖昧です。手動で指定してください。'
    );
  }

  return candidates[0].delimiter;
}


/**
 * CSV解析のメイン関数
 *
 * @param {string} text
 * CSVファイルの内容
 *
 * @param {Object} options
 * 区切り文字などの設定
 *
 * @returns {Object}
 * CSV解析結果
 */
export function parseCSV(
  text,
  { delimiter = 'auto' } = {}
) {

  // 入力形式の確認
  if (typeof text !== 'string') {
    throw new TypeError(
      '文字列を指定してください。'
    );
  }


  // UTF-8 BOMを除去する
  text = text.replace(/^\uFEFF/, '');


  // 区切り文字の自動判定
  if (delimiter === 'auto') {
    delimiter = detectDelimiter(text);
  }


  // 未対応の区切り文字を拒否する
  if (!DELIMITERS.includes(delimiter)) {
    throw new Error(
      '未対応の区切り文字です。'
    );
  }


  // CSVを行・列に分解する
  const records = readRecords(
    text,
    delimiter
  );


  // 空ファイルの確認
  if (!records.length) {
    throw new Error('CSVが空です。');
  }


  // 先頭行をヘッダーとして取得する
  const headers = records
    .shift()
    .fields
    .map(value => value.trim());


  // 空の列名を確認する
  if (headers.some(name => !name)) {
    throw new Error(
      '空の列名があります。'
    );
  }


  // 重複した列名を確認する
  if (new Set(headers).size !== headers.length) {
    throw new Error(
      '重複した列名があります。'
    );
  }


  // 各行の列数を確認する
  for (const record of records) {

    if (record.fields.length !== headers.length) {

      throw new Error(
        `${record.line}行目: 列数が一致しません` +
        `（期待 ${headers.length}、` +
        `実際 ${record.fields.length}）。`
      );
    }
  }


  // 列単位でデータを管理する
  const columns = headers.map((name, index) => {

    // 対象列の元データ
    const raw = records.map(
      record => record.fields[index]
    );


    // 欠損値の個数
    const missingCount = raw.filter(
      value => value.trim() === ''
    ).length;


    // 数値への変換
    const numbers = raw.map(numericValue);


    // 数値データの個数
    const numericCount = numbers.filter(
      value => value !== null
    ).length;


    // 欠損値以外のデータ数
    const presentCount =
      raw.length - missingCount;


    // データ型を自動判定する
    let type;

    if (presentCount === 0) {

      type = 'empty';

    } else if (numericCount === presentCount) {

      type = 'number';

    } else if (numericCount === 0) {

      type = 'text';

    } else {

      type = 'mixed';
    }


    // 数値列は数値に変換する。
    // 混合列・文字列は元の文字列を保持する。
    // 欠損値はnullとして扱う。
    const values = type === 'number'
      ? numbers
      : raw.map(
          value => value.trim() === ''
            ? null
            : value
        );


    return {
      name,
      type,
      values,
      missingCount,
      numericCount
    };
  });


  // 解析結果を返す
  return {

    // 区切り文字
    delimiter,

    // データ行数
    rowCount: records.length,

    // 列名の一覧
    headers,

    // 列ごとのデータ
    columns,

    // 数値列の一覧
    numericColumns: columns
      .filter(column => column.type === 'number')
      .map(column => column.name),

    // 時刻列の候補
    timeCandidates: headers.filter(name =>
      /^(?:time|timestamp|date|datetime|elapsed|sample|index)(?:$|[_\s(])|時刻|時間|日時/i.test(name)
    )
  };
}

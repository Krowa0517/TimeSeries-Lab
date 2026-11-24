import { test } from "node:test";

import assert from "node:assert/strict";

import { toCSV, datasetRows, outputFilename } from "../js/export.js";

// テスト1：BOMと改行コード
test("BOM and CRLF", () => {
  assert.equal(toCSV(["A"], [[1]]), '\uFEFF"A"\r\n1\r\n');

  assert.equal(toCSV(["A"], [[1]], { bom: false }), '"A"\r\n1\r\n');
});

// テスト2：特殊文字のエスケープ
test("quotes, comma and newline", () => {
  assert.equal(
    toCSV(["A,B"], [['x"y\nz']], { bom: false }),
    '"A,B"\r\n"x""y\nz"\r\n',
  );
});

// テスト3：欠損値・0・数値の精度
test("null, zero and precision", () => {
  assert.equal(
    toCSV(["A", "B", "C"], [[null, 0, 1.234567890123]], { bom: false }),
    '"A","B","C"\r\n,0,1.234567890123\r\n',
  );
});

// テスト4：数式として解釈される文字列の保護
test("formula text protected; negative number preserved", () => {
  assert.equal(
    toCSV(["=A", "B", "C"], [["  +1", "@x", -2]], { bom: false }),
    '"\'=A","B","C"\r\n"\'  +1","\'@x",-2\r\n',
  );

  assert.equal(
    toCSV(["A"], [["=1"]], {
      bom: false,
      safeText: false,
    }),
    '"A"\r\n"=1"\r\n',
  );
});

// テスト5：不正な行や値の拒否
test("invalid row and values rejected", () => {
  assert.throws(() => toCSV(["A"], [[1, 2]]));

  assert.throws(() => toCSV(["A"], [[Infinity]]));

  assert.throws(() => toCSV(["A"], [[undefined]]));

  assert.throws(() => toCSV(["A", "A"], []));
});

// データセットのテスト用データ
const dataset = {
  rowCount: 3,

  axis: {
    unit: "s",
    values: [0, 0.1, 0.3],
  },

  columns: [
    {
      name: "A",
      values: [1, null, 3],
    },

    {
      name: "axis_s",
      values: [0, 1, 2],
    },
  ],
};

// テスト6：選択項目と範囲指定
test("selected columns and range", () => {
  assert.deepEqual(
    datasetRows(dataset, ["A"], 1, 3),

    {
      headers: ["axis_s", "A"],
      rows: [
        [0.1, null],
        [0.3, 3],
      ],
    },
  );
});

// テスト7：横軸名の重複防止と空区間
test("axis header collision and empty range", () => {
  assert.deepEqual(
    datasetRows(dataset, ["axis_s"], 1, 1),

    {
      headers: ["axis_s_2", "axis_s"],
      rows: [],
    },
  );
});

// テスト8：不正な出力範囲
test("invalid range and missing column", () => {
  assert.throws(() => datasetRows(dataset, ["A"], -1, 2));

  assert.throws(() => datasetRows(dataset, ["Z"]));
});

// テスト9：ファイル名の安全化
test("safe filename", () => {
  assert.equal(
    outputFilename("a:b.csv", "data", "csv"),

    "a_b_data.csv",
  );
});

// テスト10：安全化後の列名重複
test("protected header collision rejected", () => {
  assert.throws(() => toCSV(["=A", "'=A"], []));
});

import { test } from "node:test";

import assert from "node:assert/strict";

import { DatasetManager } from "../js/dataset.js";

// 共通のテストデータを生成する
const setup = () => {
  const manager = new DatasetManager();

  const { id } = manager.addCSV(
    "sample.csv",
    "time_ms,A,B\n0,1,2\n10,3,4\n25,5,6",
  );

  return {
    manager,
    id,
  };
};

// テスト1
// 複数データセットを独立して管理できるか
test("multiple datasets and independent axes", () => {
  const { manager, id } = setup();

  const other = manager.addCSV("sample.csv", "t,V\n0,10\n2,20");

  assert.notEqual(id, other.id);

  assert.equal(manager.listDatasets().length, 2);

  manager.setAxis(id, {
    kind: "numeric",
    column: "time_ms",
    unit: "ms",
  });

  assert.deepEqual(manager.getDataset(other.id).axis.values, [0, 1]);
});

// テスト2
// サンプル番号と数値列を取得できるか
test("default sample axis and numeric series", () => {
  const { manager, id } = setup();

  const series = manager.getSeries(id, "B");

  assert.deepEqual(series.x, [0, 1, 2]);

  assert.deepEqual(series.y, [2, 4, 6]);
});

// テスト3
// 不等間隔の時刻を秒に変換できるか
test("irregular numeric timestamps convert to seconds", () => {
  const { manager, id } = setup();

  manager.setAxis(id, {
    kind: "numeric",
    column: "time_ms",
    unit: "ms",
  });

  const series = manager.getSeries(id, "A");

  assert.deepEqual(series.x, [0, 0.01, 0.025]);

  assert.equal(series.axis.unit, "s");

  assert.deepEqual(manager.getColumn(id, "time_ms").values, [0, 10, 25]);
});

// テスト4
// 日時・時刻データを変換できるか
test("ISO datetime and clock axes", () => {
  const manager = new DatasetManager();

  const a = manager.addCSV(
    "date.csv",
    "t,A\n" + "2026-11-24T12:00:00+09:00,1\n" + "2026-11-24T12:00:02+09:00,2",
  );

  const b = manager.addCSV("clock.csv", "t,A\n12:00:00,1\n12:00:03,2");

  assert.deepEqual(
    manager.setAxis(a.id, {
      kind: "datetime",
      column: "t",
    }).axis.values,

    [0, 2],
  );

  assert.deepEqual(
    manager.setAxis(b.id, {
      kind: "clock",
      column: "t",
    }).axis.values,

    [0, 3],
  );
});

// テスト5
// 不正な横軸を検出できるか
test("bad axes rejected and previous axis retained", () => {
  const manager = new DatasetManager();

  const samples = [
    // 重複した時刻
    "0,1\n0,2",

    // 降順の時刻
    "2,1\n1,2",

    // 欠損した時刻
    ",1\n2,2",
  ];

  for (const values of samples) {
    const { id } = manager.addCSV("bad.csv", "t,A\n" + values);

    assert.throws(() =>
      manager.setAxis(id, {
        kind: "numeric",
        column: "t",
      }),
    );

    assert.equal(manager.getDataset(id).axis.kind, "index");
  }
});

// テスト6
// 存在しない日付や日付をまたぐ時刻を拒否するか
test("invalid dates and midnight rollover rejected", () => {
  const manager = new DatasetManager();

  const a = manager.addCSV("date.csv", "t,A\n2026-02-30,1\n2026-03-03,2");

  const b = manager.addCSV("clock.csv", "t,A\n23:59:59,1\n00:00:01,2");

  assert.throws(() =>
    manager.setAxis(a.id, {
      kind: "datetime",
      column: "t",
    }),
  );

  assert.throws(() =>
    manager.setAxis(b.id, {
      kind: "clock",
      column: "t",
    }),
  );
});

// テスト7
// 元データを保持したまま加工データを追加できるか
test("derived columns preserve originals and record provenance", () => {
  const { manager, id } = setup();

  const values = [null, 2, 4];

  const c = manager.addDerivedColumn(id, "A_SMA", values, {
    sourceColumns: ["A"],
    operation: "SMA",
  });

  // 外部の配列を書き換えてみる
  values[1] = 99;

  assert.deepEqual(c.values, [null, 2, 4]);

  assert.equal(c.missingCount, 1);

  assert.equal(c.derived, true);

  assert.deepEqual(c.sourceColumns, ["A"]);

  assert.deepEqual(manager.getColumn(id, "A").values, [1, 3, 5]);
});

// テスト8
// データを外部から上書きできないか
test("public data cannot be overwritten", () => {
  const { manager, id } = setup();

  const dataset = manager.getDataset(id);

  assert.throws(() => {
    dataset.columns[1].values[0] = 99;
  }, TypeError);

  assert.throws(() => dataset.columns.push({}), TypeError);

  assert.throws(() => {
    dataset.axis.values[0] = 99;
  }, TypeError);
});

// テスト9
// 不正な加工データを拒否できるか
test("invalid derived columns are rejected", () => {
  const { manager, id } = setup();

  // 重複した列名
  assert.throws(() => manager.addDerivedColumn(id, "A", [1, 2, 3]));

  // 行数が異なる
  assert.throws(() => manager.addDerivedColumn(id, "C", [1, 2]));

  // 不正な数値
  assert.throws(() => manager.addDerivedColumn(id, "C", [1, NaN, 3]));

  // 存在しない加工元の列
  assert.throws(() =>
    manager.addDerivedColumn(id, "C", [1, 2, 3], {
      sourceColumns: ["unknown"],
    }),
  );
});

// テスト10
// 削除時に元データや依存関係を保護できるか
test("deletion respects original columns and dependencies", () => {
  const { manager, id } = setup();

  manager.addDerivedColumn(id, "C", [1, 2, 3]);

  manager.addDerivedColumn(id, "D", [2, 4, 6], {
    sourceColumns: ["C"],
  });

  // 元データは削除できない
  assert.throws(() => manager.removeDerivedColumn(id, "A"));

  // 他の列が参照している場合は削除できない
  assert.throws(() => manager.removeDerivedColumn(id, "C"));

  manager.removeDerivedColumn(id, "D");

  // 横軸として使用中の列は削除できない
  manager.setAxis(id, {
    kind: "numeric",
    column: "C",
  });

  assert.throws(() => manager.removeDerivedColumn(id, "C"));

  // 横軸を変更してから削除する
  manager.setAxis(id, {
    kind: "index",
  });

  manager.removeDerivedColumn(id, "C");

  assert.equal(manager.getDataset(id).columns.length, 3);

  // データセット全体を削除する
  assert.equal(manager.removeDataset(id), true);

  assert.equal(manager.listDatasets().length, 0);
});

// テスト11
// データ行のないCSVや文字列の分析を拒否するか
test("empty dataset and nonnumeric series rejected", () => {
  const manager = new DatasetManager();

  assert.throws(() => manager.addCSV("empty.csv", "time,A"));

  const { id } = manager.addCSV("text.csv", "t,status\n0,OK\n1,NG");

  assert.throws(() => manager.getSeries(id, "status"));
});

// 時間微分データが存在する場合の横軸保護
test("axis changes are blocked while derivatives exist", () => {
  const { manager, id } = setup();

  manager.setAxis(id, {
    kind: "numeric",

    column: "time_ms",

    unit: "ms",
  });

  manager.addDerivedColumn(
    id,

    "A_DERIV_1",

    [null, 200, 133.3333],

    {
      sourceColumns: ["A", "time_ms"],

      operation: "Derivative(lag=1)",
    },
  );

  // 異なる横軸への変更は拒否する
  assert.throws(() =>
    manager.setAxis(id, {
      kind: "index",
    }),
  );

  // 同じ設定の再適用は許可する
  assert.doesNotThrow(() =>
    manager.setAxis(id, {
      kind: "numeric",

      column: "time_ms",

      unit: "ms",
    }),
  );

  // 微分データを削除すれば横軸を変更できる
  manager.removeDerivedColumn(id, "A_DERIV_1");

  assert.doesNotThrow(() =>
    manager.setAxis(id, {
      kind: "index",
    }),
  );
});

// グラフの表示色
const COLORS = [
  "#88baf0",
  "#e5aa70",
  "#77c5ad",
  "#c2a1e8",
  "#e78ba0",
  "#b9cf75",
  "#73cbd8",
  "#e4d284",
];

/* ========================================
   データ検索・正規化
======================================== */

// 二分探索によってtarget以上の
// 最初のデータのインデックスを取得する
export function lowerBound(values, target) {
  let lo = 0;
  let hi = values.length;

  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);

    if (values[mid] < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  return lo;
}

// 指定された値に最も近い
// データのインデックスを取得する
export function nearestIndex(values, target) {
  if (!values.length) return -1;

  const i = lowerBound(values, target);

  if (i === 0) return 0;

  if (i === values.length) return i - 1;

  return target - values[i - 1] <= values[i] - target ? i - 1 : i;
}

// 有効な数値の最小値・最大値を取得する
function extent(values) {
  let min = Infinity;
  let max = -Infinity;

  for (const v of values) {
    if (!Number.isFinite(v)) continue;

    if (v < min) min = v;

    if (v > max) max = v;
  }

  return min === Infinity ? null : [min, max];
}

// Min-Max正規化
export function normalizeValues(values) {
  const bounds = extent(values);

  if (!bounds) {
    return values.map(() => null);
  }

  const [min, max] = bounds;

  const scale = Math.max(Math.abs(min), Math.abs(max)) || 1;

  return values.map((v) => {
    if (!Number.isFinite(v)) {
      return null;
    }

    // 定数データは0として扱う
    if (min === max) return 0;

    const width = max - min;

    // 極端に大きな数値にも配慮
    return Number.isFinite(width)
      ? (v - min) / width
      : (v / scale - min / scale) / (max / scale - min / scale);
  });
}

// 数値をグラフ表示用に整形する
function format(v) {
  if (!Number.isFinite(v)) {
    return "—";
  }

  return Number(v.toPrecision(6)).toString();
}

// 表示範囲内の縦軸の範囲を求める
function yRange(group, from, to, normalized) {
  if (normalized) return [0, 1];

  let min = Infinity;
  let max = -Infinity;

  for (const s of group) {
    for (let i = from; i < to; i++) {
      const v = s.display[i];

      if (!Number.isFinite(v)) continue;

      if (v < min) min = v;

      if (v > max) max = v;
    }
  }

  // 有効なデータがない場合
  if (min === Infinity) {
    return [0, 1];
  }

  // グラフの上下に余白を確保する
  const pad = min === max ? Math.abs(min) * 0.05 || 1 : (max - min) * 0.05;

  return [min - pad, max + pad];
}

/* ========================================
   グラフ描画クラス
======================================== */

export class TimeSeriesChart {
  constructor(container) {
    this.container = container;

    this.x = [];

    this.series = [];

    this.panels = [];

    // データ列ごとの検出ピーク
    this.peakMarkers = new Map();

    // データ全体の横軸範囲
    this.full = [0, 1];

    // 現在の表示範囲
    this.view = [0, 1];

    // カーソル位置
    this.cursor = null;

    // ドラッグ操作の状態
    this.drag = null;

    // 描画予約の管理
    this.frame = null;

    // 画面サイズの変化を監視する
    this.observer = new ResizeObserver(() => this.schedule());
  }

  /* ======================================
     表示データの設定
  ====================================== */

  setSeries(series, { mode = "overlay", normalized = false } = {}) {
    const x = series[0]?.x ?? [];

    // データセットや横軸が変更された場合
    if (x !== this.x) {
      this.x = x;

      this.full =
        x.length > 1
          ? [x[0], x[x.length - 1]]
          : x.length === 1
            ? [x[0] - 0.5, x[0] + 0.5]
            : [0, 1];

      this.view = [...this.full];
    }

    this.normalized = normalized;

    this.cursor = null;

    this.drag = null;

    // 表示用データを生成する
    this.series = series.map((s, i) => ({
      ...s,

      color: COLORS[i % COLORS.length],

      display: normalized ? normalizeValues(s.y) : s.y,
    }));

    // 古いグラフを削除する
    this.observer.disconnect();

    this.container.replaceChildren();

    this.panels = [];

    if (!this.series.length) {
      this.container.textContent = "表示する数値列を選択してください。";

      return;
    }

    // 個別表示・重ね合わせ表示を切り替える
    const groups =
      mode === "separate" ? this.series.map((s) => [s]) : [this.series];

    for (const group of groups) {
      const section = document.createElement("div");

      section.className = "plot-panel";

      // 凡例を生成する
      const legend = document.createElement("div");

      legend.className = "plot-legend";

      for (const s of group) {
        const item = document.createElement("span");

        item.style.color = s.color;

        item.textContent = `━ ${s.name}`;

        legend.append(item);
      }

      // Canvas要素を生成する
      const canvas = document.createElement("canvas");

      canvas.className =
        "plot-canvas" + (mode === "separate" ? " compact" : "");

      canvas.setAttribute("role", "img");

      canvas.setAttribute(
        "aria-label",

        group.map((s) => s.name).join("、") + " の時系列グラフ",
      );

      // カーソル位置の測定値表示
      const readout = document.createElement("div");

      readout.className = "plot-readout";

      section.append(legend, canvas, readout);

      this.container.append(section);

      const panel = {
        canvas,

        group,

        readout,
      };

      this.panels.push(panel);

      // マウス操作の登録
      this.bind(panel);

      // サイズ変更を監視する
      this.observer.observe(canvas);
    }

    this.schedule();
  }

  /* ======================================
     表示範囲の管理
  ====================================== */

  /**
   * ピークマーカーを設定する
   */
  setPeakMarkers(markers = new Map()) {
    this.peakMarkers = new Map(markers);

    this.schedule();
  }

  resetView() {
    this.view = [...this.full];

    this.cursor = null;

    // 分析範囲の変更を通知する
    this.onViewChange?.();

    this.schedule();
  }

  // 再描画を予約する
  schedule() {
    if (this.frame !== null) return;

    this.frame = requestAnimationFrame(() => {
      this.frame = null;

      for (const panel of this.panels) {
        this.draw(panel);
      }
    });
  }

  // グラフ描画領域を取得する
  plot(canvas) {
    return {
      left: 74,

      top: 15,

      width: Math.max(1, canvas.clientWidth - 90),

      height: Math.max(1, canvas.clientHeight - 60),
    };
  }

  // 表示範囲が元データの範囲を
  // 超えないように調整する
  clampView(start, span) {
    const [lo, hi] = this.full;

    const total = hi - lo;

    span = Math.max(
      total / 10000,

      Math.min(total, span),
    );

    start = Math.max(
      lo,

      Math.min(hi - span, start),
    );

    this.view = [start, start + span];

    // 分析範囲の変更を通知する
    this.onViewChange?.();
  }

  /* ======================================
     マウス操作
  ====================================== */

  bind(panel) {
    const { canvas } = panel;

    // マウスの位置を取得する
    const position = (e) => {
      const r = canvas.getBoundingClientRect();

      const p = this.plot(canvas);

      const x = e.clientX - r.left - p.left;

      const y = e.clientY - r.top - p.top;

      return {
        x,

        p,

        inside: x >= 0 && x <= p.width && y >= 0 && y <= p.height,
      };
    };

    // マウスホイールによる拡大・縮小
    canvas.addEventListener(
      "wheel",

      (e) => {
        const { x, p, inside } = position(e);

        if (!inside) return;

        e.preventDefault();

        // カーソル位置を拡大の基準とする
        const f = x / p.width;

        const span = this.view[1] - this.view[0];

        const anchor = this.view[0] + f * span;

        const total = this.full[1] - this.full[0];

        const next = Math.max(
          total / 10000,

          Math.min(
            total,

            span * (e.deltaY < 0 ? 0.8 : 1.25),
          ),
        );

        this.clampView(
          anchor - f * next,

          next,
        );

        this.cursor = null;

        this.schedule();
      },

      { passive: false },
    );

    // ドラッグ操作の開始
    canvas.addEventListener(
      "pointerdown",

      (e) => {
        if (e.button !== 0 || !position(e).inside) return;

        this.drag = {
          canvas,

          id: e.pointerId,

          clientX: e.clientX,

          view: [...this.view],
        };

        canvas.setPointerCapture(e.pointerId);
      },
    );

    // マウスカーソルの移動
    canvas.addEventListener(
      "pointermove",

      (e) => {
        const { x, p, inside } = position(e);

        // ドラッグによるグラフの移動
        if (this.drag?.canvas === canvas && this.drag.id === e.pointerId) {
          const [a, b] = this.drag.view;

          this.clampView(
            a - ((e.clientX - this.drag.clientX) / p.width) * (b - a),

            b - a,
          );

          this.cursor = null;
        } else {
          // カーソルに最も近いデータを検索
          this.cursor = inside
            ? nearestIndex(
                this.x,

                this.view[0] + (x / p.width) * (this.view[1] - this.view[0]),
              )
            : null;
        }

        this.schedule();
      },
    );

    // ドラッグ操作の終了
    const stop = (e) => {
      if (this.drag?.canvas === canvas && this.drag.id === e.pointerId) {
        this.drag = null;
      }

      this.cursor = null;

      this.schedule();
    };

    for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) {
      canvas.addEventListener(event, stop);
    }

    canvas.addEventListener(
      "pointerleave",

      () => {
        if (!this.drag) {
          this.cursor = null;

          this.schedule();
        }
      },
    );
  }

  /* ======================================
     グラフ描画処理
  ====================================== */

  draw({ canvas, group, readout }) {
    const w = canvas.clientWidth;

    const h = canvas.clientHeight;

    if (!w || !h) return;

    // 高解像度ディスプレイへの対応
    const dpr = window.devicePixelRatio || 1;

    const bw = Math.round(w * dpr);

    const bh = Math.round(h * dpr);

    if (canvas.width !== bw) {
      canvas.width = bw;
    }

    if (canvas.height !== bh) {
      canvas.height = bh;
    }

    const ctx = canvas.getContext("2d");

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);

    const p = this.plot(canvas);

    const [a, b] = this.view;

    // 描画する必要のある範囲を取得
    // 範囲外の隣接点も含めて描画する
    const from = Math.max(
      0,

      lowerBound(this.x, a) - 1,
    );

    const to = Math.min(
      this.x.length,

      lowerBound(this.x, b) + 1,
    );

    // 縦軸の表示範囲
    const [min, max] = yRange(
      group,

      from,

      to,

      this.normalized,
    );

    // データ座標から画面座標への変換
    const px = (v) => p.left + ((v - a) / (b - a)) * p.width;

    const py = (v) => p.top + ((max - v) / (max - min)) * p.height;

    ctx.font = "11px system-ui, sans-serif";

    ctx.lineWidth = 1;

    /* ====================================
       目盛り・グリッド線
    ==================================== */

    for (let i = 0; i <= 5; i++) {
      const f = i / 5;

      const x = p.left + f * p.width;

      const y = p.top + f * p.height;

      ctx.strokeStyle = "#354559";

      ctx.beginPath();

      // 縦方向のグリッド線
      ctx.moveTo(x, p.top);

      ctx.lineTo(x, p.top + p.height);

      // 横方向のグリッド線
      ctx.moveTo(p.left, y);

      ctx.lineTo(p.left + p.width, y);

      ctx.stroke();

      ctx.fillStyle = "#aab9ca";

      // 縦軸の目盛り
      ctx.textAlign = "right";

      ctx.textBaseline = "middle";

      ctx.fillText(
        format(max - (max - min) * f),

        p.left - 7,

        y,
      );

      // 横軸の目盛り
      ctx.textAlign = "center";

      ctx.textBaseline = "top";

      ctx.fillText(
        format(a + (b - a) * f),

        x,

        p.top + p.height + 8,
      );
    }

    // 横軸の名前を表示
    ctx.fillText(
      group[0].axis.label + (this.normalized ? " / Y: normalized" : ""),

      p.left + p.width / 2,

      h - 17,
    );

    /* ====================================
       折れ線グラフの描画
    ==================================== */

    ctx.save();

    // グラフ描画領域の外には
    // データを描画しない
    ctx.beginPath();

    ctx.rect(
      p.left,

      p.top,

      p.width,

      p.height,
    );

    ctx.clip();

    for (const s of group) {
      ctx.strokeStyle = s.color;

      ctx.fillStyle = s.color;

      ctx.lineWidth = 1.5;

      ctx.beginPath();

      let connected = false;

      for (let i = from; i < to; i++) {
        const v = s.display[i];

        // 欠損値の場合は折れ線を分断する
        if (!Number.isFinite(v)) {
          connected = false;

          continue;
        }

        const x = px(this.x[i]);

        const y = py(v);

        if (connected) {
          ctx.lineTo(x, y);
        } else {
          ctx.moveTo(x, y);
        }

        connected = true;

        // 孤立したデータ点を表示する
        if (
          !Number.isFinite(s.display[i - 1]) &&
          !Number.isFinite(s.display[i + 1])
        ) {
          ctx.fillRect(x - 2, y - 2, 4, 4);
        }
      }

      ctx.stroke();
    }

    /* ====================================
      ピークマーカーの描画
    ==================================== */

    for (const s of group) {
      // 対象列の検出ピークを取得する
      const peaks = this.peakMarkers.get(s.name) ?? [];

      for (const peak of peaks) {
        const i = peak.index;

        const x = this.x[i];

        const y = s.display[i];

        // 描画範囲外のピークは描画しない
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < a || x > b) {
          continue;
        }

        const cx = px(x);

        const cy = py(y);

        // マーカーの色はデータ列の色と統一する
        ctx.strokeStyle = s.color;

        ctx.fillStyle = "#111821";

        ctx.lineWidth = 2;

        ctx.beginPath();

        // 正方向のピークは丸
        if (peak.direction === "positive") {
          ctx.arc(
            cx,

            cy,

            5,

            0,

            Math.PI * 2,
          );

          // 負方向のピークは四角
        } else {
          ctx.rect(
            cx - 4.5,

            cy - 4.5,

            9,

            9,
          );
        }

        ctx.fill();

        ctx.stroke();
      }
    }

    /* ====================================
       カーソル位置の描画
    ==================================== */

    if (this.cursor !== null && this.cursor >= 0) {
      const x = px(this.x[this.cursor]);

      // カーソル位置に破線を表示する
      ctx.strokeStyle = "#aab9ca";

      ctx.lineWidth = 1;

      ctx.setLineDash([4, 4]);

      ctx.beginPath();

      ctx.moveTo(x, p.top);

      ctx.lineTo(x, p.top + p.height);

      ctx.stroke();

      ctx.setLineDash([]);

      // 各データ列の測定点を描画する
      for (const s of group) {
        const v = s.display[this.cursor];

        if (!Number.isFinite(v)) {
          continue;
        }

        ctx.fillStyle = s.color;

        ctx.beginPath();

        ctx.arc(
          x,

          py(v),

          3.5,

          0,

          Math.PI * 2,
        );

        ctx.fill();
      }

      // 測定時刻と各項目の値を表示する
      readout.textContent =
        `${group[0].axis.label}: ` +
        `${format(this.x[this.cursor])} | ` +
        group
          .map(
            (s) =>
              `${s.name}: ` +
              `${format(s.y[this.cursor])}` +
              (this.normalized
                ? ` (正規化 ${format(s.display[this.cursor])})`
                : ""),
          )
          .join(" / ");
    } else {
      readout.textContent =
        "グラフ上にカーソルを合わせると" + "測定値を表示します。";
    }

    ctx.restore();
  }
}

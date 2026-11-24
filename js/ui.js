// Existing DOM nodes are moved, not recreated, so IDs and listeners survive.
export function setupWorkspace() {
  const $ = id => document.getElementById(id);
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const panel = id => $(id).closest('.panel');
  const content = document.querySelector('.content');
  const sidebar = document.querySelector('.sidebar');
  const header = document.querySelector('.app-header');
  const chartPanel = panel('chart-area');
  const tabs = [
    ['stats', '基本統計', 'stats-table'],
    ['errors', '誤差分析', 'error-table'],
    ['filters', 'フィルタ', 'filter-settings'],
    ['transforms', 'データ変換', 'transform-settings'],
    ['peaks', 'ピーク検出', 'peak-settings'],
    ['correlation', '相関分析', 'correlation-settings'],
    ['preview', 'データ一覧', 'preview-table']
  ].map(([key, label, id]) => ({ key, label, element: panel(id) }));
  const tools = [
    ['generator', '人工データ生成', 'generator-run'],
    ['export', 'ファイル出力', 'export-run'],
    ['evaluation', '精度・性能評価', 'evaluation-run']
  ].map(([key, label, id]) => ({ key, label, element: panel(id) }));

  // Keep the usual import controls visible; fold infrequent settings.
  const importOptions = make('details', 'sidebar-options');
  importOptions.append(make('summary', '', '読み込み設定（区切り・文字コード）'));
  document.querySelector('label[for="delimiter"]').before(importOptions);
  for (const id of ['delimiter', 'encoding']) {
    importOptions.append(document.querySelector(`label[for="${id}"]`), $(id));
  }
  const axisPanel = panel('axis-settings');
  const axisOptions = make('details', 'sidebar-options');
  axisOptions.append(make('summary', '', '横軸設定'), $('axis-settings'));
  axisPanel.querySelector('h2').replaceWith(axisOptions);

  // Move derived-column management into the sidebar.
  const derived = $('derived-select').closest('.derived-manager');
  const derivedPanel = make('section', 'panel derived-panel');
  const derivedOptions = make('details', 'sidebar-options');
  derivedOptions.append(make('summary', '', '加工データの管理'), derived);
  derived.querySelector('h3').remove();
  derivedPanel.append(derivedOptions);
  sidebar.append(derivedPanel);

  // Search/filter only affects the column list, not the analysis selection.
  const list = $('column-list');
  const controls = make('div', 'column-tools');
  const search = make('input', 'column-search');
  search.type = 'search';
  search.placeholder = '列名で検索';
  search.setAttribute('aria-label', '列名で検索');
  const type = make('select', 'column-kind');
  type.setAttribute('aria-label', '列の種類');
  for (const [value, label] of [
    ['all', 'すべての列'], ['original', '元データ'], ['derived', '加工データ']
  ]) {
    const opt = make('option', '', label);
    opt.value = value;
    type.append(opt);
  }
  const count = make('p', 'muted column-match-count');
  count.setAttribute('aria-live', 'polite');
  const note = make('p', 'muted', '検索・分類は一覧のみ。全選択・解除は全数値列が対象です。');
  controls.append(search, type, count, note);
  list.before(controls);
  function refreshColumns() {
    const query = search.value.trim().toLowerCase();
    const labels = [...list.querySelectorAll('label[data-column-name]')];
    let shown = 0;
    for (const label of labels) {
      const match = label.dataset.columnName.toLowerCase().includes(query) &&
        (type.value === 'all' || label.dataset.columnType === type.value);
      label.hidden = !match;
      if (match) shown++;
    }
    count.textContent = `${shown} / ${labels.length} 列表示`;
  }
  search.addEventListener('input', refreshColumns);
  type.addEventListener('change', refreshColumns);

  // Auxiliary tools are native modal dialogs.
  const actions = make('nav', 'workspace-actions');
  actions.setAttribute('aria-label', '補助機能');
  for (const { key, label, element } of tools) {
    const button = make('button', 'secondary', label);
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'dialog');
    const dialog = make('dialog', 'workspace-dialog');
    dialog.id = `tool-${key}`;
    button.setAttribute('aria-controls', dialog.id);
    const bar = make('div', 'dialog-heading');
    const title = make('h2', '', label);
    title.id = `tool-title-${key}`;
    dialog.setAttribute('aria-labelledby', title.id);
    const close = make('button', 'secondary', '閉じる');
    close.type = 'button';
    close.autofocus = true;
    bar.append(title, close);
    const details = element.querySelector(':scope > details');
    details.querySelector(':scope > summary').remove();
    details.replaceWith(...details.childNodes);
    dialog.append(bar, element);
    document.body.append(dialog);
    actions.append(button);
    button.addEventListener('click', () => dialog.showModal());
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => button.focus());
  }
  header.insertBefore(actions, header.querySelector('.version'));

  // The graph stays visible while analysis tabs change.
  chartPanel.classList.add('workspace-chart');
  const overview = make('div', 'workspace-overview');
  $('status').before(overview);
  overview.append($('status'), content.querySelector('.metrics'));
  chartPanel.querySelector('.section-heading').append(chartPanel.querySelector('.chart-toolbar'));
  const help = make('div', 'workspace-chart-help');
  chartPanel.querySelector('.chart-help').before(help);
  help.append(...chartPanel.querySelectorAll('.chart-help'));
  const resize = make('div', 'workspace-resize');
  const resizeLabel = make('label', '', 'グラフ領域');
  const slider = make('input', '');
  slider.id = 'workspace-chart-size';
  slider.type = 'range';
  slider.min = '35';
  slider.max = '70';
  slider.value = '65';
  resizeLabel.htmlFor = slider.id;
  const ratio = make('output', '', '65%');
  ratio.setAttribute('for', slider.id);
  resize.append(resizeLabel, slider, ratio);
  function resizeChart() {
    const v = Number(slider.value);
    content.style.setProperty('--chart-share', `${v / (100 - v)}fr`);
    ratio.value = `${v}%`;
  }
  slider.addEventListener('input', resizeChart);
  resizeChart();

  const tablist = make('div', 'analysis-tabs');
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', '分析機能');
  const region = make('div', 'analysis-region');
  const buttons = tabs.map(({ key, label, element }) => {
    const button = make('button', 'analysis-tab', label);
    button.type = 'button';
    button.id = `tab-${key}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `pane-${key}`);
    element.id = `pane-${key}`;
    element.setAttribute('role', 'tabpanel');
    element.setAttribute('aria-labelledby', button.id);
    element.tabIndex = 0;
    tablist.append(button);
    region.append(element);
    return button;
  });
  function activate(index, focus = false) {
    tabs.forEach(({ element }, i) => {
      element.hidden = i !== index;
      buttons[i].setAttribute('aria-selected', String(i === index));
      buttons[i].tabIndex = i === index ? 0 : -1;
    });
    region.scrollTop = 0;
    region.scrollLeft = 0;
    if (focus) buttons[index].focus();
  }
  buttons.forEach((button, i) => {
    button.addEventListener('click', () => activate(i));
    button.addEventListener('keydown', event => {
      const n = buttons.length;
      const next = {
        ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n,
        Home: 0, End: n - 1
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      activate(next, true);
    });
  });
  chartPanel.after(resize, tablist, region);
  activate(0);
  document.body.classList.add('workspace-ready');
  refreshColumns();
  return { refreshColumns };
}

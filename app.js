'use strict';

/* ============================================================
   こころ日和 — app.js
   データはすべて localStorage に保存(この端末だけ)
   ============================================================ */

const STORE_KEY = 'kokorobiyori-v1';

const DEFAULT_MOOD_LABELS = ['レベル1', 'レベル2', 'レベル3', 'レベル4', 'レベル5'];
const MOOD_COLORS = ['#A9B7E8', '#B4DCF0', '#BEE8C9', '#FFD9A0', '#FFAFC7'];

const PRAISE_MESSAGES = [
  'きろくできたね、えらい🎀',
  '今日もおつかれさま💗',
  'めろりんはいつでも味方だよ🐰',
  'ゆっくり休んでね🌙',
  'きろく、ちゃんと残したよ🌷',
];

/* ---------------- データ ---------------- */

let data = loadData();

function loadData() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY));
    if (d && typeof d === 'object') {
      d.days = d.days || {};
      d.periods = d.periods || [];
      d.settings = d.settings || {};
      return d;
    }
  } catch (e) { /* 壊れていたら初期化 */ }
  return { days: {}, periods: [], settings: {} };
}

function persist() {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

function moodLabels() {
  const l = data.settings.moodLabels;
  return (Array.isArray(l) && l.length === 5) ? l : DEFAULT_MOOD_LABELS;
}

/* ---------------- 日付ユーティリティ ---------------- */

function fmt(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return fmt(d);
}
function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}
function todayStr() { return fmt(new Date()); }

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
function prettyDate(s) {
  const d = parseDate(s);
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`;
}
function prettyMD(s) {
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/* ---------------- めろりん(マスコット画像) ---------------- */

function melorinImg(size) {
  // イラスト画像を丸くトリミングして表示する
  // 小さいサイズでは潰れないよう、顔アップ版を使う
  const src = size <= 48 ? 'icons/mascot-face.png' : 'icons/mascot-small.png';
  return `<img class="mascot-img" src="${src}" width="${size}" height="${size}" alt="めろりん">`;
}

/* ---------------- 生理周期の計算 ---------------- */

function sortedPeriods() {
  return [...data.periods].sort((a, b) => (a.start < b.start ? -1 : 1));
}

function openPeriod() {
  return data.periods.find(p => !p.end);
}

function periodAt(dateStr) {
  return data.periods.find(p =>
    p.start <= dateStr && (p.end ? dateStr <= p.end : dateStr <= todayStr()));
}

function cycleStats() {
  const ps = sortedPeriods();
  const diffs = [];
  for (let i = 1; i < ps.length; i++) {
    const d = diffDays(ps[i - 1].start, ps[i].start);
    if (d >= 15 && d <= 60) diffs.push(d); // 極端な値は平均から除外
  }
  const recent = diffs.slice(-6);
  const cycle = recent.length
    ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length)
    : 28;
  const lens = ps.filter(p => p.end)
    .map(p => diffDays(p.start, p.end) + 1)
    .filter(n => n >= 1 && n <= 14)
    .slice(-6);
  const len = lens.length
    ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)
    : 5;

  let next = null;
  if (ps.length) {
    next = addDays(ps[ps.length - 1].start, cycle);
    const t = todayStr();
    let guard = 0;
    while (next < t && guard++ < 24) next = addDays(next, cycle);
  }
  return { cycle, len, next, count: ps.length, sampleCount: recent.length };
}

function isPredicted(dateStr, stats) {
  if (!stats.next) return false;
  return stats.next <= dateStr && dateStr <= addDays(stats.next, stats.len - 1);
}

/* ---------------- 睡眠 ---------------- */

function sleepMinutes(rec) {
  if (!rec || !rec.sleepStart || !rec.sleepEnd) return null;
  const [sh, sm] = rec.sleepStart.split(':').map(Number);
  const [eh, em] = rec.sleepEnd.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 1440; // 日をまたいだ場合
  return mins;
}

function sleepText(mins) {
  if (mins == null) return '';
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}時間${m}分` : `${h}時間`;
}

/* ============================================================
   きょう(記録)タブ
   ============================================================ */

let selDate = todayStr();
let selMood = null;

function buildMoodPicker() {
  const wrap = document.getElementById('mood-picker');
  wrap.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mood-btn';
    b.style.background = `linear-gradient(180deg, ${MOOD_COLORS[i - 1]}, ${shade(MOOD_COLORS[i - 1])})`;
    b.textContent = i;
    b.addEventListener('click', () => {
      selMood = (selMood === i) ? null : i; // もう一度押すと解除
      updateMoodPicker();
    });
    wrap.appendChild(b);
  }
}

function shade(hex) {
  // 少しだけ濃い色を作る(グラデーション用)
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - 24);
  const g = Math.max(0, ((n >> 8) & 255) - 24);
  const b = Math.max(0, (n & 255) - 24);
  return `rgb(${r},${g},${b})`;
}

function updateMoodPicker() {
  const btns = document.querySelectorAll('.mood-btn');
  btns.forEach((b, idx) => b.classList.toggle('selected', selMood === idx + 1));
  const disp = document.getElementById('mood-label-display');
  disp.textContent = selMood ? `「${moodLabels()[selMood - 1]}」` : 'タップしてえらんでね';
}

function renderRecord() {
  const t = todayStr();
  document.getElementById('record-date-label').textContent =
    (selDate === t ? 'きょう ' : '') + prettyDate(selDate);
  document.getElementById('date-next').disabled = selDate >= t;

  const rec = data.days[selDate] || {};
  selMood = rec.mood || null;
  updateMoodPicker();
  document.getElementById('mood-memo').value = rec.moodMemo || '';
  document.getElementById('sleep-start').value = rec.sleepStart || '';
  document.getElementById('sleep-end').value = rec.sleepEnd || '';
  document.getElementById('diary').value = rec.diary || '';
  updateSleepDuration();
  renderPeriodSection();
}

function updateSleepDuration() {
  const rec = {
    sleepStart: document.getElementById('sleep-start').value,
    sleepEnd: document.getElementById('sleep-end').value,
  };
  const mins = sleepMinutes(rec);
  document.getElementById('sleep-duration').textContent =
    mins != null ? `💤 睡眠 ${sleepText(mins)}` : '';
}

function renderPeriodSection() {
  const statusEl = document.getElementById('period-status');
  const btnsEl = document.getElementById('period-buttons');
  btnsEl.innerHTML = '';

  const stats = cycleStats();
  const cur = periodAt(selDate);
  const open = openPeriod();

  if (cur) {
    const day = diffDays(cur.start, selDate) + 1;
    let text = `この日は生理${day}日目です💧(${prettyMD(cur.start)}開始)`;
    if (!cur.end) {
      text += ' おわった日に下のボタンを押してね';
    }
    statusEl.textContent = text;
  } else if (stats.next && selDate <= stats.next) {
    const rest = diffDays(selDate, stats.next);
    statusEl.textContent = rest === 0
      ? 'きょうが次の予測日です♡'
      : `次の予測日まで あと${rest}日(${prettyMD(stats.next)}ごろ)`;
  } else if (stats.count === 0) {
    statusEl.textContent = 'まだ記録がありません。はじまった日にボタンを押してね';
  } else {
    statusEl.textContent = '';
  }

  if (!cur && !open) {
    addPeriodBtn(btnsEl, '💧 生理がはじまった', () => {
      data.periods.push({ start: selDate, end: null });
      persist();
      renderPeriodSection();
      showToast('はじまりを記録したよ💧');
    });
  }
  if (cur && !cur.end) {
    addPeriodBtn(btnsEl, '🌷 生理がおわった(この日でおわり)', () => {
      cur.end = selDate;
      persist();
      renderPeriodSection();
      showToast('おわりを記録したよ🌷');
    });
    if (cur.start === selDate) {
      addPeriodBtn(btnsEl, 'まちがえた(取り消す)', () => {
        if (confirm('この開始記録を取り消しますか?')) {
          data.periods = data.periods.filter(p => p !== cur);
          persist();
          renderPeriodSection();
        }
      }, true);
    }
  }
}

function addPeriodBtn(parent, label, onClick, subtle) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'period-btn' + (subtle ? ' subtle' : '');
  b.textContent = label;
  b.addEventListener('click', onClick);
  parent.appendChild(b);
}

function saveRecord() {
  const rec = {
    mood: selMood,
    moodMemo: document.getElementById('mood-memo').value.trim(),
    sleepStart: document.getElementById('sleep-start').value,
    sleepEnd: document.getElementById('sleep-end').value,
    diary: document.getElementById('diary').value.trim(),
  };
  const hasContent = rec.mood || rec.moodMemo || rec.sleepStart || rec.sleepEnd || rec.diary;
  if (hasContent) {
    data.days[selDate] = rec;
  } else {
    delete data.days[selDate]; // 全部空なら記録を消す
  }
  persist();
  const msg = PRAISE_MESSAGES[Math.floor(Math.random() * PRAISE_MESSAGES.length)];
  showToast(msg);
}

/* ============================================================
   カレンダータブ
   ============================================================ */

let calY, calM; // 表示中の年・月(0始まり)

function initCalendar() {
  const now = new Date();
  calY = now.getFullYear();
  calM = now.getMonth();
}

function renderCalendar() {
  document.getElementById('cal-title').textContent = `${calY}年${calM + 1}月`;
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const stats = cycleStats();
  const first = new Date(calY, calM, 1);
  const daysInMonth = new Date(calY, calM + 1, 0).getDate();
  const t = todayStr();

  for (let i = 0; i < first.getDay(); i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell empty';
    grid.appendChild(cell);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const ds = fmt(new Date(calY, calM, day));
    const rec = data.days[ds];
    const dow = new Date(calY, calM, day).getDay();
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if (dow === 0) cell.classList.add('sun');
    if (dow === 6) cell.classList.add('sat');
    if (ds === t) cell.classList.add('today');
    const predicted = !periodAt(ds) && isPredicted(ds, stats);
    if (predicted) cell.classList.add('predicted');

    let html = `<span class="d">${day}</span>`;
    if (rec && rec.mood) {
      html += `<span class="mood-dot" style="background:${MOOD_COLORS[rec.mood - 1]}"></span>`;
    }
    const marks = [];
    if (periodAt(ds)) marks.push('💧');
    if (rec && (rec.diary || rec.moodMemo)) marks.push('✏️');
    if (predicted) marks.push('<span class="predict-heart">♡</span>');
    if (marks.length) html += `<span class="marks">${marks.join('')}</span>`;

    cell.innerHTML = html;
    cell.addEventListener('click', () => openDayModal(ds));
    grid.appendChild(cell);
  }
}

function openDayModal(ds) {
  const rec = data.days[ds];
  const cur = periodAt(ds);
  const body = document.getElementById('modal-body');
  let html = `<h3>🎀 ${prettyDate(ds)}</h3>`;

  if (rec && rec.mood) {
    html += `<div class="modal-row"><span class="tag">きもち</span>` +
      `<span style="color:${MOOD_COLORS[rec.mood - 1]}">●</span> ${esc(moodLabels()[rec.mood - 1])}</div>`;
  }
  if (rec && rec.moodMemo) {
    html += `<div class="modal-row"><span class="tag">ひとこと</span>${esc(rec.moodMemo)}</div>`;
  }
  const mins = sleepMinutes(rec);
  if (mins != null) {
    html += `<div class="modal-row"><span class="tag">睡眠</span>` +
      `${rec.sleepStart} → ${rec.sleepEnd}(${sleepText(mins)})</div>`;
  }
  if (cur) {
    html += `<div class="modal-row"><span class="tag">生理</span>💧 ${diffDays(cur.start, ds) + 1}日目</div>`;
  }
  if (rec && rec.diary) {
    html += `<div class="modal-row"><span class="tag">できごと</span>${esc(rec.diary)}</div>`;
  }
  if (!rec && !cur) {
    html += `<div class="modal-row" style="text-align:center">${melorinImg(70)}<br>この日の記録はまだないよ</div>`;
  }

  body.innerHTML = html;
  const editBtn = document.getElementById('modal-edit-btn');
  editBtn.onclick = () => {
    closeModal();
    selDate = ds;
    switchTab('record');
  };
  document.getElementById('modal-backdrop').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ============================================================
   グラフタブ
   ============================================================ */

let chartRange = 30;

function renderChart() {
  const showSleep = document.getElementById('show-sleep').checked;
  document.getElementById('legend-sleep').classList.toggle('hidden', !showSleep);

  const n = chartRange;
  const end = todayStr();
  const start = addDays(end, -(n - 1));
  const dates = [];
  for (let i = 0; i < n; i++) dates.push(addDays(start, i));

  const W = 720, H = 320;
  const padL = 40, padR = 14, padT = 16, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const x = i => padL + (n === 1 ? plotW / 2 : i * plotW / (n - 1));
  const yMood = m => padT + (5 - m) * plotH / 4;
  const step = plotW / Math.max(n - 1, 1);

  const stats = cycleStats();
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="きもちのグラフ">`;

  // --- 生理期間の帯 ---
  for (const p of sortedPeriods()) {
    const pEnd = p.end || todayStr();
    if (pEnd < start || p.start > end) continue;
    const i0 = Math.max(0, diffDays(start, p.start));
    const i1 = Math.min(n - 1, diffDays(start, pEnd));
    svg += `<rect x="${x(i0) - step / 2}" y="${padT}" width="${(i1 - i0) * step + step}" height="${plotH}"
      fill="rgba(255,175,199,.35)" rx="6"/>`;
  }
  // --- 予測期間の帯(点線枠) ---
  if (stats.next && stats.next <= end) {
    const predEnd = addDays(stats.next, stats.len - 1);
    if (predEnd >= start) {
      const i0 = Math.max(0, diffDays(start, stats.next));
      const i1 = Math.min(n - 1, diffDays(start, predEnd));
      svg += `<rect x="${x(i0) - step / 2}" y="${padT}" width="${(i1 - i0) * step + step}" height="${plotH}"
        fill="rgba(255,214,232,.5)" stroke="#FFAFC7" stroke-dasharray="6 5" rx="6"/>`;
    }
  }

  // --- 目盛り(気分レベル) ---
  for (let m = 1; m <= 5; m++) {
    const yy = yMood(m);
    svg += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="#FFE1EE" stroke-width="1.5"/>`;
    svg += `<text x="${padL - 8}" y="${yy + 4}" text-anchor="end" font-size="13" fill="#C9A2B5">${m}</text>`;
  }

  // --- 睡眠バー ---
  if (showSleep) {
    const maxH = 12 * 60; // 12時間分をグラフの高さいっぱいに
    dates.forEach((ds, i) => {
      const mins = sleepMinutes(data.days[ds]);
      if (mins == null) return;
      const h = Math.min(mins / maxH, 1) * plotH;
      const bw = Math.max(step * 0.45, 3);
      svg += `<rect x="${x(i) - bw / 2}" y="${padT + plotH - h}" width="${bw}" height="${h}"
        fill="rgba(201,195,242,.65)" rx="2"/>`;
    });
  }

  // --- 気分の折れ線 ---
  const pts = [];
  dates.forEach((ds, i) => {
    const rec = data.days[ds];
    if (rec && rec.mood) pts.push({ i, mood: rec.mood });
  });
  if (pts.length > 1) {
    const path = pts.map((p, k) =>
      `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${yMood(p.mood).toFixed(1)}`).join(' ');
    svg += `<path d="${path}" fill="none" stroke="#F27BA5" stroke-width="3"
      stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  for (const p of pts) {
    svg += `<circle cx="${x(p.i)}" cy="${yMood(p.mood)}" r="${n > 60 ? 4 : 6}"
      fill="${MOOD_COLORS[p.mood - 1]}" stroke="#fff" stroke-width="2"/>`;
  }

  // --- X軸ラベル ---
  const tick = n > 60 ? 14 : 7;
  dates.forEach((ds, i) => {
    if (i % tick === 0 || i === n - 1) {
      svg += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" font-size="12" fill="#C9A2B5">${prettyMD(ds)}</text>`;
    }
  });

  svg += '</svg>';
  document.getElementById('chart').innerHTML = svg;

  const note = document.getElementById('chart-note');
  if (pts.length === 0) {
    note.innerHTML = `${melorinImg(70)}<br>きもちの記録がたまると、ここに波が見えてくるよ🌊`;
    note.classList.remove('hidden');
  } else {
    note.classList.add('hidden');
  }
}

/* ============================================================
   せっていタブ
   ============================================================ */

function renderSettings() {
  // 周期サマリー
  const stats = cycleStats();
  const el = document.getElementById('cycle-summary');
  if (stats.count === 0) {
    el.textContent = 'まだ生理の記録がありません';
  } else {
    let html = `平均周期: <strong>${stats.cycle}日</strong>`;
    html += stats.sampleCount ? `(直近${stats.sampleCount}回分の平均)` : '(記録が2回たまると計算されます)';
    if (stats.next) html += `<br>次回予測: <strong>${prettyDate(stats.next)}</strong>ごろ`;
    el.innerHTML = html;
  }

  // 生理履歴リスト
  const list = document.getElementById('period-list');
  list.innerHTML = '';
  const ps = sortedPeriods().reverse();
  for (const p of ps) {
    const item = document.createElement('div');
    item.className = 'period-item';
    const label = document.createElement('span');
    label.textContent = `💧 ${prettyMD(p.start)} 〜 ${p.end ? prettyMD(p.end) : '(継続中)'}`;
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '削除';
    del.addEventListener('click', () => {
      if (confirm(`${prettyMD(p.start)}からの記録を削除しますか?`)) {
        data.periods = data.periods.filter(q => q !== p);
        persist();
        renderSettings();
      }
    });
    item.appendChild(label);
    item.appendChild(del);
    list.appendChild(item);
  }

  // 気分ラベル編集
  const editor = document.getElementById('mood-label-editor');
  editor.innerHTML = '';
  moodLabels().forEach((lab, i) => {
    const row = document.createElement('div');
    row.className = 'mood-label-row';
    const dot = document.createElement('span');
    dot.className = 'lv-dot';
    dot.style.background = MOOD_COLORS[i];
    dot.textContent = i + 1;
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 20;
    input.value = lab;
    input.dataset.idx = i;
    row.appendChild(dot);
    row.appendChild(input);
    editor.appendChild(row);
  });
}

function saveMoodLabels() {
  const inputs = document.querySelectorAll('#mood-label-editor input');
  const labels = [...inputs].map((inp, i) => inp.value.trim() || DEFAULT_MOOD_LABELS[i]);
  data.settings.moodLabels = labels;
  persist();
  showToast('ラベルをほぞんしたよ🌷');
  renderSettings();
}

/* ---------------- バックアップ ---------------- */

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kokorobiyori-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('バックアップを書き出したよ📤');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (!d || typeof d !== 'object' || (!d.days && !d.periods)) {
        throw new Error('形式がちがいます');
      }
      if (!confirm('いまのデータを読み込んだ内容で置きかえます。よろしいですか?')) return;
      data = {
        days: d.days || {},
        periods: d.periods || [],
        settings: d.settings || {},
      };
      persist();
      renderAll();
      showToast('読み込みできたよ📥');
    } catch (e) {
      alert('読み込めませんでした。バックアップファイルか確認してね(' + e.message + ')');
    }
  };
  reader.readAsText(file);
}

function deleteAll() {
  if (!confirm('すべての記録を削除します。この操作はもとに戻せません。よろしいですか?')) return;
  if (!confirm('ほんとうに削除して大丈夫?(バックアップの書き出しがおすすめです)')) return;
  data = { days: {}, periods: [], settings: {} };
  persist();
  renderAll();
  showToast('データを削除しました');
}

/* ============================================================
   共通UI
   ============================================================ */

let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.innerHTML = melorinImg(44) + `<span>${esc(msg)}</span>`;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(s => s.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === name));
  if (name === 'record') renderRecord();
  if (name === 'calendar') renderCalendar();
  if (name === 'chart') renderChart();
  if (name === 'settings') renderSettings();
  window.scrollTo({ top: 0 });
}

function renderAll() {
  renderRecord();
  renderCalendar();
  renderChart();
  renderSettings();
}

/* ---------------- 初期化 ---------------- */

function init() {
  document.getElementById('header-melorin').innerHTML = melorinImg(38);
  document.getElementById('about-melorin').innerHTML = melorinImg(90);

  buildMoodPicker();
  initCalendar();

  // きょうタブ
  document.getElementById('date-prev').addEventListener('click', () => {
    selDate = addDays(selDate, -1); renderRecord();
  });
  document.getElementById('date-next').addEventListener('click', () => {
    if (selDate < todayStr()) { selDate = addDays(selDate, 1); renderRecord(); }
  });
  document.getElementById('sleep-start').addEventListener('input', updateSleepDuration);
  document.getElementById('sleep-end').addEventListener('input', updateSleepDuration);
  document.getElementById('save-btn').addEventListener('click', saveRecord);

  // カレンダー
  document.getElementById('cal-prev').addEventListener('click', () => {
    calM--; if (calM < 0) { calM = 11; calY--; } renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calM++; if (calM > 11) { calM = 0; calY++; } renderCalendar();
  });
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // グラフ
  document.querySelectorAll('.range-toggle button').forEach(b => {
    b.addEventListener('click', () => {
      chartRange = Number(b.dataset.range);
      document.querySelectorAll('.range-toggle button').forEach(x =>
        x.classList.toggle('active', x === b));
      renderChart();
    });
  });
  document.getElementById('show-sleep').addEventListener('change', renderChart);

  // せってい
  document.getElementById('save-labels-btn').addEventListener('click', saveMoodLabels);
  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('import-file').addEventListener('change', e => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('delete-all-btn').addEventListener('click', deleteAll);

  // 下部ナビ
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.addEventListener('click', () => switchTab(b.dataset.tab)));

  // URLハッシュでタブを直接開ける (例: index.html#chart)
  const hash = location.hash.replace('#', '');
  if (['record', 'calendar', 'chart', 'settings'].includes(hash)) {
    switchTab(hash);
  } else {
    renderRecord();
  }

  // PWA: Service Worker 登録
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* オフライン非対応環境 */ });

    // 新しいService Workerが有効になったら、開き直さなくても最新版を反映する
    let refreshedOnce = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshedOnce) return;
      refreshedOnce = true;
      window.location.reload();
    });
  }
}

document.addEventListener('DOMContentLoaded', init);

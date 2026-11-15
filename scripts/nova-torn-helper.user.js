// ==UserScript==
// @name         Nova Torn Helper
// @namespace    nova-torn-helper
// @version      1.1
// @description  All-in-one: enemy hospital timers + FF badges on every page + FF on profiles + 🏥 panel (faction/war pages), and a "Fill stock" button (company Stock page). Read-only / you press every game action yourself.
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @connect      ffscouter.com
// @connect      api.torn.com
// @downloadURL  https://raw.githubusercontent.com/etherhtun/nova-torn-helper/main/scripts/nova-torn-helper.user.js
// @updateURL    https://raw.githubusercontent.com/etherhtun/nova-torn-helper/main/scripts/nova-torn-helper.user.js
// ==/UserScript==

// ===================== Part 1: Enemy Hospital Timer + FF =====================

(function () {
  'use strict';

  // Torn PDA replaces this automatically with your API key.
  // On desktop (Tampermonkey) you'll be asked for a key in the panel instead.
  const PDA_KEY = '###PDA-APIKEY###';
  const REFRESH_SEC = 30;      // API refresh interval
  const SOON_SEC = 120;        // highlight when leaving within this many seconds
  const ALERT_SEC = 20;        // alert this many seconds before an enemy leaves hospital
  const FILTER_SEC = 300;      // "≤5 min" filter

  const LS = {
    get: (k, d) => { try { return localStorage.getItem('ehtimer_' + k) ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem('ehtimer_' + k, v); } catch {} },
  };
  const getKey = () => (PDA_KEY.includes('PDA-APIKEY') ? LS.get('key', '') : PDA_KEY);

  let hosp = new Map();      // id -> {id,name,level,until}
  let enemyList = [];        // hospital members of the enemy faction (for the panel)
  let ownFactionId = null;
  let ownId = '';            // your own player ID (no FF badge on yourself)
  let warFactionIds = null;  // [idA, idB] when in a ranked war
  let lastFetch = 0;
  let lastError = '';

  // panel settings (remembered)
  let sortBy = LS.get('sort', 'time');          // 'time' | 'ff'
  let soonOnly = LS.get('soon', '0') === '1';
  let alertOn = LS.get('alert', '1') === '1';

  // ---------- styles ----------
  const style = document.createElement('style');
  style.textContent = `
  #eht-btn{position:fixed;right:10px;bottom:90px;z-index:99999;width:44px;height:44px;border-radius:50%;
    background:#c0392b;color:#fff;font-size:22px;border:none;box-shadow:0 2px 6px #0008;}
  #eht-panel{position:fixed;right:10px;bottom:140px;z-index:99999;width:300px;max-height:60vh;overflow:auto;
    background:#1e1e1e;color:#ddd;font:12px Arial,sans-serif;border:1px solid #444;border-radius:8px;
    box-shadow:0 4px 12px #000a;display:none;}
  #eht-panel header{position:sticky;top:0;background:#2b2b2b;padding:6px 8px;display:flex;gap:6px;align-items:center}
  #eht-panel input{width:90px;background:#111;color:#eee;border:1px solid #555;border-radius:4px;padding:3px}
  #eht-panel button{background:#444;color:#eee;border:1px solid #666;border-radius:4px;padding:3px 6px}
  #eht-panel .row{display:flex;justify-content:space-between;padding:5px 8px;border-bottom:1px solid #333}
  #eht-panel .row a{color:#8cf;text-decoration:none}
  #eht-panel .soon{background:#4a3b00}
  #eht-panel .out{background:#123d1a}
  #eht-panel .t{font-family:monospace;font-weight:bold}
  #eht-panel .msg{padding:8px;color:#aaa}
  #eht-panel .bar{display:flex;gap:6px;padding:4px 8px;background:#252525;border-bottom:1px solid #333}
  #eht-panel .bar button{flex:1}
  #eht-panel .atk{font-size:15px;text-decoration:none}
  #eht-btn.eht-ring{animation:eht-pulse .5s infinite alternate}
  @keyframes eht-pulse{to{background:#ffd700;transform:scale(1.15)}}
  #eht-toast{position:fixed;right:60px;bottom:95px;z-index:99999;background:#ffd700;color:#000;
    font:bold 12px Arial,sans-serif;padding:6px 10px;border-radius:6px;box-shadow:0 2px 6px #0008;display:none}
  .eht-ff{display:inline-block;margin-left:3px;padding:1px 4px;border-radius:3px;font:bold 11px Arial,sans-serif;
    color:#000;vertical-align:middle;line-height:14px;white-space:nowrap}
  #eht-prof{margin:6px 0;padding:6px 10px;border-radius:5px;color:#000;font:bold 13px Arial,sans-serif}
  #eht-panel .ffcol{display:flex;gap:6px;align-items:center}
  .eht-cd{font-family:monospace!important;font-weight:bold!important;color:#ff6b6b!important}
  .eht-cd.eht-soon{color:#ffd700!important}
  .eht-cd.eht-out{color:#5dff7a!important}`;
  document.head.appendChild(style);

  // ---------- panel ----------
  const btn = document.createElement('button');
  btn.id = 'eht-btn';
  btn.textContent = '🏥';
  const panel = document.createElement('div');
  panel.id = 'eht-panel';
  const toast = document.createElement('div');
  toast.id = 'eht-toast';
  document.body.append(btn, panel, toast);

  btn.onclick = () => {
    unlockSound();
    btn.classList.remove('eht-ring');
    const open = panel.style.display === 'block';
    panel.style.display = open ? 'none' : 'block';
    if (!open) { renderPanel(); refresh(true); }
  };

  // ---------- alerts ----------
  let actx = null;
  function unlockSound() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch {}
  }
  function beep() {
    try {
      unlockSound();
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.2;
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + 0.3);
    } catch {}
  }
  let toastTimer = 0;
  function ring(m, left) {
    beep();
    try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch {}
    btn.classList.add('eht-ring');
    toast.textContent = `🔔 ${m.name} leaves hospital in ${left}s`;
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.display = 'none'; btn.classList.remove('eht-ring'); }, 6000);
  }
  const alerted = new Set();
  function checkAlerts() {
    if (!alertOn) return;
    const now = Math.floor(Date.now() / 1000);
    for (const m of enemyList) {
      const left = m.until - now;
      if (left > ALERT_SEC) alerted.delete(m.id);
      else if (left > 0 && !alerted.has(m.id)) { alerted.add(m.id); ring(m, left); }
    }
  }

  function fmt(sec) {
    if (sec <= 0) return 'OUT';
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  // The panel is built once; after that only the list changes, and the
  // countdowns are updated in place so taps on links/buttons aren't lost.
  let shellKey = '';
  let listSig = '';

  function buildShell() {
    panel.innerHTML = `<header>
        ${getKey() ? '' : '<input id="eht-key" placeholder="API key">'}
        <input id="eht-fid" placeholder="Enemy faction ID" value="${LS.get('fid', '')}">
        <button id="eht-go">Load</button>
      </header>
      <div class="bar">
        <button id="eht-sort"></button><button id="eht-soon"></button><button id="eht-alert"></button>
      </div>
      <div id="eht-list"></div>`;
    const q = s => panel.querySelector(s);
    q('#eht-go').onclick = () => {
      const k = q('#eht-key');
      if (k && k.value.trim()) LS.set('key', k.value.trim());
      LS.set('fid', q('#eht-fid').value.trim());
      refresh(true);
    };
    q('#eht-sort').onclick = () => { sortBy = sortBy === 'time' ? 'ff' : 'time'; LS.set('sort', sortBy); renderPanel(); };
    q('#eht-soon').onclick = () => { soonOnly = !soonOnly; LS.set('soon', soonOnly ? '1' : '0'); renderPanel(); };
    q('#eht-alert').onclick = () => { alertOn = !alertOn; LS.set('alert', alertOn ? '1' : '0'); unlockSound(); renderPanel(); };
  }

  function renderPanel() {
    if (panel.style.display !== 'block') return;
    const sk = getKey() ? 'key' : 'nokey';
    if (shellKey !== sk) { buildShell(); shellKey = sk; listSig = ''; }
    const q = s => panel.querySelector(s);
    q('#eht-sort').textContent = sortBy === 'time' ? 'Sort: Time' : 'Sort: FF';
    q('#eht-soon').textContent = soonOnly ? '≤5 min ✓' : 'All';
    q('#eht-alert').textContent = alertOn ? '🔔 On' : '🔕 Off';

    const now = Math.floor(Date.now() / 1000);
    let rows = enemyList.slice();
    if (soonOnly) rows = rows.filter(m => m.until - now <= FILTER_SEC);
    if (sortBy === 'ff') rows.sort((a, b) => (ffGet(b.id)?.ff ?? -1) - (ffGet(a.id)?.ff ?? -1));

    let msg = '';
    if (lastError) msg = lastError;
    else if (ffError && !enemyList.length) msg = ffError;
    else if (!enemyFactionId()) msg = 'Enter the enemy faction ID (auto-detected during a ranked war).';
    else if (!enemyList.length) msg = 'No enemy in hospital right now.';
    else if (!rows.length) msg = 'Nobody leaving within 5 min.';

    // rebuild the list only when what's shown actually changes
    const sig = msg ? 'msg:' + msg : rows.map(m => m.id + ':' + ffBadge(m.id).text).join(',') + '|' + ffError;
    const list = q('#eht-list');
    if (sig !== listSig) {
      listSig = sig;
      if (msg) list.innerHTML = `<div class="msg">${msg.startsWith('No') || msg.startsWith('Nobody') || msg.startsWith('Enter') ? '' : '⚠️ '}${msg}</div>`;
      else {
        list.innerHTML = rows.map(m => {
          const b = ffBadge(m.id);
          return `<div class="row" data-id="${m.id}">
            <a href="https://www.torn.com/profiles.php?XID=${m.id}">${m.name} [${m.level}]</a>
            <span class="ffcol"><span class="eht-ff" style="background:${b.bg}" title="${b.title}">${b.text}</span>
            <span class="t"></span>
            <a class="atk" href="https://www.torn.com/loader.php?sid=attack&user2ID=${m.id}" title="Attack">⚔️</a></span></div>`;
        }).join('')
          + (ffError ? `<div class="msg">⚠️ ${ffError}</div>` : '')
          + `<div class="msg" id="eht-foot"></div>`;
      }
    }
    if (msg) return;

    // every second: update countdowns and colours in place
    for (const m of rows) {
      const row = list.querySelector(`.row[data-id="${m.id}"]`);
      if (!row) continue;
      const left = m.until - now;
      row.classList.toggle('out', left <= 0);
      row.classList.toggle('soon', left > 0 && left <= SOON_SEC);
      row.querySelector('.t').textContent = fmt(left);
    }
    const foot = q('#eht-foot');
    if (foot) foot.textContent = `${rows.length} in hospital · updated ${Math.max(0, now - Math.floor(lastFetch / 1000))}s ago`;
  }

  // ---------- API ----------
  async function api(path) {
    const key = getKey();
    if (!key) throw new Error('Enter a Public/Limited API key.');
    const sep = path.includes('?') ? '&' : '?';
    const r = await fetch(`https://api.torn.com/${path}${sep}key=${key}&comment=EnemyHospTimer`);
    const j = await r.json();
    if (j.error) throw new Error(`API error ${j.error.code}: ${j.error.error}`);
    return j;
  }

  async function loadOwnFaction() {
    if (ownFactionId !== null) return;
    try {
      const j = await api('user/?selections=profile');
      ownFactionId = String(j.faction?.faction_id ?? '');
      ownId = String(j.player_id ?? '');
    } catch { ownFactionId = ''; }
  }

  // Find both factions in the current ranked war (if any)
  async function loadWar() {
    if (warFactionIds !== null) return;
    warFactionIds = [];
    try {
      const j = await api('v2/faction/wars');
      const rw = j.wars?.ranked;
      if (rw && rw.factions && !rw.winner) warFactionIds = rw.factions.map(f => String(f.id));
    } catch {}
  }

  function enemyFactionId() {
    if (warFactionIds && warFactionIds.length) {
      const e = warFactionIds.find(id => id !== ownFactionId);
      if (e) return e;
    }
    const url = new URL(location.href);
    if (url.pathname.includes('factions.php') && url.searchParams.get('step') === 'profile' && url.searchParams.get('ID')) {
      return url.searchParams.get('ID');
    }
    return LS.get('fid', '');
  }

  async function fetchFaction(fid) {
    let list;
    try {
      const j = await api(`v2/faction/${fid}/members`);
      list = (j.members || []).map(m => ({ id: String(m.id), name: m.name, level: m.level, st: m.status }));
    } catch (e) {
      const j = await api(`faction/${fid}?selections=basic`);
      list = Object.entries(j.members || {}).map(([id, m]) => ({ id: String(id), name: m.name, level: m.level, st: m.status }));
    }
    return list
      .filter(m => m.st && m.st.state === 'Hospital')
      .map(m => ({ id: m.id, name: m.name, level: m.level, until: m.st.until }));
  }

  let busy = false;
  async function refresh(force) {
    if (busy) return;
    if (!force && Date.now() - lastFetch < REFRESH_SEC * 1000) return;
    busy = true;
    lastFetch = Date.now();
    try {
      await loadOwnFaction();
      await loadWar();
      const enemy = enemyFactionId();
      // During a war, load both sides so every row in the war list gets a timer
      const ids = new Set(warFactionIds && warFactionIds.length ? warFactionIds : []);
      if (enemy) ids.add(enemy);
      const urlId = new URL(location.href).searchParams.get('ID');
      if (urlId && location.href.includes('step=profile')) ids.add(urlId);

      const next = new Map();
      for (const fid of ids) {
        const list = await fetchFaction(fid);
        list.forEach(m => next.set(m.id, m));
        if (fid === enemy) enemyList = list.sort((a, b) => a.until - b.until);
      }
      hosp = next;
      lastError = '';
    } catch (e) {
      lastError = e.message;
    }
    busy = false;
    renderPanel();
    decorateRows();
  }


  // ---------- FF (Fair Fight) from FFScouter ----------
  // Uses the same API key; it must be registered once at https://ffscouter.com
  const FF_TTL = 60 * 60 * 1000;   // cache FF values for 1 hour
  let ffCache = {};
  try { ffCache = JSON.parse(LS.get('ff', '{}')) || {}; } catch { ffCache = {}; }
  let ffError = '';
  let ffBusy = false;
  let ffLastCall = 0;

  function httpGet(url) {
    if (typeof PDA_httpGet === 'function') {
      return PDA_httpGet(url).then(r => (typeof r === 'string' ? r : r.responseText));
    }
    if (typeof GM_xmlhttpRequest === 'function') {
      return new Promise((res, rej) => GM_xmlhttpRequest({
        method: 'GET', url, onload: r => res(r.responseText), onerror: rej, ontimeout: rej,
      }));
    }
    return fetch(url).then(r => r.text());
  }

  function ffGet(id) {
    const e = ffCache[id];
    return e && Date.now() - e.t < FF_TTL ? e : null;
  }

  async function ffFetch(ids) {
    const key = getKey();
    if (!key || ffBusy || !ids.length) return;
    if (Date.now() - ffLastCall < 10000) return;   // at most one batch every 10s
    ffBusy = true;
    ffLastCall = Date.now();
    try {
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const txt = await httpGet(`https://ffscouter.com/api/v1/get-stats?key=${key}&targets=${chunk.join(',')}`);
        const j = JSON.parse(txt);
        if (!Array.isArray(j)) {
          throw new Error((j && (j.error || j.message)) || 'FFScouter error');
        }
        const now = Date.now();
        chunk.forEach(id => { ffCache[id] = { ff: null, bs: null, t: now }; });
        j.forEach(r => { ffCache[String(r.player_id)] = { ff: r.fair_fight, bs: r.bs_estimate_human, t: now }; });
      }
      ffError = '';
      LS.set('ff', JSON.stringify(ffCache));
    } catch (e) {
      ffError = 'FF: ' + (e.message || e) + ' (is your key registered at ffscouter.com?)';
    }
    ffBusy = false;
  }

  function ffColor(ff) {
    if (ff <= 1.5) return '#3b6bff';
    if (ff <= 2.25) return '#22d3ee';
    if (ff <= 3.5) return '#34d399';
    if (ff <= 4.5) return '#fb923c';
    return '#ef4444';
  }

  function ffBadge(id) {
    const e = ffGet(id);
    if (!e) return { text: '…', bg: '#666', title: 'Loading FF' };
    if (e.ff == null) return { text: '?', bg: '#666', title: 'No FF estimate' };
    return { text: Number(e.ff).toFixed(2), bg: ffColor(e.ff), title: `FF ${e.ff}  ·  est. stats ${e.bs ?? '?'}` };
  }

  // ---------- inline timers + FF in the member list ----------
  function findStatusCell(row) {
    const cands = row.querySelectorAll('.status, [class*="status"]');
    for (const el of cands) {
      if (el.closest('#eht-panel')) continue;
      if (el.children.length && !el.querySelector('.eht-cd')) continue; // only leaf text cells
      const t = el.textContent.trim();
      if (el.dataset.eht || /^(Hospital|OUT|[\d:]+)$/.test(t)) return el;
    }
    return null;
  }

  // FF badge next to player names on every page (like FFScouter);
  // hospital countdowns only on faction/war pages.
  function decorateRows() {
    const onFaction = location.pathname.includes('factions.php');
    const now = Math.floor(Date.now() / 1000);
    const links = document.querySelectorAll('a[href*="profiles.php?XID="]');
    const seen = new Set();
    const missing = [];
    profileBox(missing);
    for (const a of links) {
      if (a.closest('#eht-panel, #chatRoot, [class*="chat-box"], #eht-prof')) continue;
      if (!a.textContent.trim()) continue;            // skip avatar/image links
      const id = new URL(a.href, location.origin).searchParams.get('XID');
      if (!id || id === ownId) continue;
      const row = a.closest('li, .table-row, tr');
      if (!row || seen.has(row)) continue;
      seen.add(row);

      // FF badge next to the name
      if (!ffGet(id)) missing.push(id);
      let badge = row.querySelector('.eht-ff');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'eht-ff';
        a.after(badge);
      }
      const b = ffBadge(id);
      if (badge.textContent !== b.text) badge.textContent = b.text;
      badge.style.background = b.bg;
      badge.title = b.title;

      if (!onFaction) continue;
      const cell = findStatusCell(row);
      if (!cell) continue;
      const m = hosp.get(id);
      if (!m) {
        if (cell.dataset.eht) { cell.textContent = 'Hospital'; cell.classList.remove('eht-cd', 'eht-soon', 'eht-out'); delete cell.dataset.eht; }
        continue;
      }
      const left = m.until - now;
      cell.dataset.eht = '1';
      cell.classList.add('eht-cd');
      cell.classList.toggle('eht-soon', left > 0 && left <= SOON_SEC);
      cell.classList.toggle('eht-out', left <= 0);
      const txt = fmt(left);
      if (cell.textContent !== txt) cell.textContent = txt;
    }
    if (missing.length) ffFetch([...new Set(missing)]);
  }

  // Big FF line at the top of a player's profile page
  function profileBox(missing) {
    if (!location.pathname.includes('profiles.php')) return;
    const id = new URL(location.href).searchParams.get('XID');
    if (!id || id === ownId) return;
    let box = document.getElementById('eht-prof');
    if (!box) {
      const anchor = document.querySelector('.content-title');
      if (!anchor) return;                              // page not loaded yet
      box = document.createElement('div');
      box.id = 'eht-prof';
      anchor.after(box);
    }
    const e = ffGet(id);
    if (!e) missing.push(id);
    const b = ffBadge(id);
    const txt = !e ? 'Fair Fight: loading…'
      : e.ff == null ? 'Fair Fight: no estimate'
      : `Fair Fight: ${Number(e.ff).toFixed(2)}  ·  est. stats ${e.bs ?? '?'}`;
    if (box.textContent !== txt) box.textContent = txt;
    box.style.background = b.bg;
  }

  // ---------- loops ----------
  setInterval(() => {
    checkAlerts();
    if (document.hidden) return;
    renderPanel();
    decorateRows();
    if (panel.style.display === 'block') {
      const miss = enemyList.map(m => m.id).filter(id => !ffGet(id));
      if (miss.length) ffFetch(miss);
    }
  }, 1000);
  setInterval(() => {
    if (document.hidden) return;   // save API calls while Torn isn't on screen
    if (location.pathname.includes('factions.php') || panel.style.display === 'block') refresh();
  }, 5000);
  if (location.pathname.includes('factions.php')) refresh(true);
  else if (getKey()) loadOwnFaction();
})();

// ===================== Part 2: Stock Fill (company Stock page) =====================

(function () {
  'use strict';

  const num = (s) => parseInt(String(s || '').replace(/[^\d-]/g, ''), 10) || 0;

  // Fill each item's order box with its share of the free storage space,
  // based on how much of that item sells per day.
  function fill(form) {
    const cap = [...form.querySelectorAll('.storage-capacity > *')].map(el => num(el.textContent));
    const free = Math.max((cap[1] || 0) - (cap[0] || 0), 0);   // [current, max]

    const items = [...form.querySelectorAll('.stock-list > li:not(.total):not(.quantity)')]
      .map(li => ({
        input: li.querySelector('input'),
        sold: num(li.querySelector('.sold-daily')?.lastChild?.textContent),
      }))
      .filter(it => it.input);
    if (!items.length) return 'No stock items found.';

    const totalSold = items.reduce((sum, it) => sum + it.sold, 0);
    let ordered = 0;
    for (const it of items) {
      // nothing sold yet → split the space evenly
      const share = totalSold > 0 ? it.sold / totalSold : 1 / items.length;
      const amount = Math.floor(free * share);
      ordered += amount;
      setValue(it.input, amount);
    }
    return free > 0 ? `Filled ${ordered.toLocaleString()} items. Check, then press Order.` : 'Storage is already full.';
  }

  function setValue(input, value) {
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function addButton() {
    const form = document.querySelector('div#stock > form');
    if (!form || form.querySelector('#nova-fill')) return;
    const wrap = document.createElement('span');
    wrap.className = 'btn-wrap silver';
    wrap.innerHTML = '<span class="btn"><button type="button" class="torn-btn" id="nova-fill">Fill stock</button></span>'
      + '<span id="nova-fill-msg" style="margin-left:8px;font-weight:bold"></span>';
    form.appendChild(wrap);
    wrap.querySelector('#nova-fill').onclick = () => {
      wrap.querySelector('#nova-fill-msg').textContent = fill(form);
    };
  }

  // The Stock tab is loaded on demand, so keep checking for it.
  if (location.pathname.includes('companies.php')) setInterval(addButton, 1000);
})();

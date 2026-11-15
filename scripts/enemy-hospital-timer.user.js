// ==UserScript==
// @name         Enemy Hospital Timer + FF
// @namespace    torn-enemy-hosp
// @version      1.2
// @description  Hospital countdowns in the faction/war Status column, FF (Fair Fight) badges from FFScouter, and a 🏥 panel. Read-only.
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @connect      ffscouter.com
// @connect      api.torn.com
// @downloadURL  https://raw.githubusercontent.com/etherhtun/nova-torn-helper/claude/dazzling-bell-3jvncf/scripts/enemy-hospital-timer.user.js
// @updateURL    https://raw.githubusercontent.com/etherhtun/nova-torn-helper/claude/dazzling-bell-3jvncf/scripts/enemy-hospital-timer.user.js
// ==/UserScript==

(function () {
  'use strict';

  // Torn PDA replaces this automatically with your API key.
  // On desktop (Tampermonkey) you'll be asked for a key in the panel instead.
  const PDA_KEY = '###PDA-APIKEY###';
  const REFRESH_SEC = 30;      // API refresh interval
  const SOON_SEC = 120;        // highlight when leaving within this many seconds

  const LS = {
    get: (k, d) => { try { return localStorage.getItem('ehtimer_' + k) ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem('ehtimer_' + k, v); } catch {} },
  };
  const getKey = () => (PDA_KEY.includes('PDA-APIKEY') ? LS.get('key', '') : PDA_KEY);

  let hosp = new Map();      // id -> {id,name,level,until}
  let enemyList = [];        // hospital members of the enemy faction (for the panel)
  let ownFactionId = null;
  let warFactionIds = null;  // [idA, idB] when in a ranked war
  let lastFetch = 0;
  let lastError = '';

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
  .eht-ff{display:inline-block;margin-left:3px;padding:1px 4px;border-radius:3px;font:bold 11px Arial,sans-serif;
    color:#000;vertical-align:middle;line-height:14px;white-space:nowrap}
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
  document.body.append(btn, panel);

  btn.onclick = () => {
    const open = panel.style.display === 'block';
    panel.style.display = open ? 'none' : 'block';
    if (!open) { renderPanel(); refresh(true); }
  };

  function fmt(sec) {
    if (sec <= 0) return 'OUT';
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function renderPanel() {
    if (panel.style.display !== 'block') return;
    const now = Math.floor(Date.now() / 1000);
    let body;
    if (lastError) body = `<div class="msg">⚠️ ${lastError}</div>`;
    else if (ffError && !enemyList.length) body = `<div class="msg">⚠️ ${ffError}</div>`;
    else if (!enemyFactionId()) body = `<div class="msg">Enter the enemy faction ID (auto-detected during a ranked war).</div>`;
    else if (!enemyList.length) body = `<div class="msg">No enemy in hospital right now.</div>`;
    else {
      body = enemyList.map(m => {
        const left = m.until - now;
        const cls = left <= 0 ? 'out' : left <= SOON_SEC ? 'soon' : '';
        return `<div class="row ${cls}">
          <a href="https://www.torn.com/profiles.php?XID=${m.id}">${m.name} [${m.level}]</a>
          <span class="ffcol"><span class="eht-ff" style="background:${ffBadge(m.id).bg}">${ffBadge(m.id).text}</span>
          <span class="t">${fmt(left)}</span></span></div>`;
      }).join('');
      if (ffError) body += `<div class="msg">⚠️ ${ffError}</div>`;
      body += `<div class="msg">${enemyList.length} in hospital · updated ${Math.max(0, now - Math.floor(lastFetch / 1000))}s ago</div>`;
    }
    if (document.activeElement && panel.contains(document.activeElement)) {
      const list = panel.querySelector('#eht-list');
      if (list) list.innerHTML = body;
      return;
    }
    panel.innerHTML = `<header>
        ${getKey() ? '' : '<input id="eht-key" placeholder="API key">'}
        <input id="eht-fid" placeholder="Enemy faction ID" value="${LS.get('fid', '')}">
        <button id="eht-go">Load</button>
      </header><div id="eht-list">${body}</div>`;
    panel.querySelector('#eht-go').onclick = () => {
      const k = panel.querySelector('#eht-key');
      if (k && k.value.trim()) LS.set('key', k.value.trim());
      LS.set('fid', panel.querySelector('#eht-fid').value.trim());
      refresh(true);
    };
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

  function decorateRows() {
    if (!location.pathname.includes('factions.php')) return;
    const now = Math.floor(Date.now() / 1000);
    const links = document.querySelectorAll('a[href*="profiles.php?XID="]');
    const seen = new Set();
    const missing = [];
    for (const a of links) {
      if (a.closest('#eht-panel')) continue;
      const id = new URL(a.href, location.origin).searchParams.get('XID');
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

  // ---------- loops ----------
  setInterval(() => {
    renderPanel();
    decorateRows();
    if (panel.style.display === 'block') {
      const miss = enemyList.map(m => m.id).filter(id => !ffGet(id));
      if (miss.length) ffFetch(miss);
    }
  }, 1000);
  setInterval(() => {
    if (location.pathname.includes('factions.php') || panel.style.display === 'block') refresh();
  }, 5000);
  if (location.pathname.includes('factions.php')) refresh(true);
})();

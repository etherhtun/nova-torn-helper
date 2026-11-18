// ==UserScript==
// @name         Nova Torn Helper
// @namespace    nova-torn-helper
// @version      4.3
// @description  All-in-one: 💪 battle stats on the Gym page, 💊 drug cooldown alarm, ✅ war targets, ✈️ travel helper, 🌍 where abroad/traveling players are, 💲 item market price helper, ⛓️ chain timer + repeating chain alarm, ⚡ energy alert, 🎯 FF target finder, enemy hospital timers + FF badges on every page + FF on profiles + 🏥 panel (faction/war pages), and a "Fill stock" button (company Stock page). Read-only / you press every game action yourself.
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      ffscouter.com
// @connect      api.torn.com
// @connect      yata.yt
// @downloadURL  https://raw.githubusercontent.com/etherhtun/nova-torn-helper/main/scripts/nova-torn-helper.user.js
// @updateURL    https://raw.githubusercontent.com/etherhtun/nova-torn-helper/main/scripts/nova-torn-helper.user.js
// ==/UserScript==

// If this script is loaded twice (e.g. added twice in PDA), only the first copy runs.
if (document.documentElement.dataset.novaTornHelper) {
  console.warn('Nova Torn Helper is installed more than once - remove the extra copy.');
} else {
document.documentElement.dataset.novaTornHelper = '1';

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

  // ---------- API key on desktop (PDA fills it in by itself) ----------
  function askKey() {
    const k = prompt('Nova Torn Helper\n\nPaste your Torn API key (Limited is enough).\nTorn → Settings → API Keys', LS.get('key', ''));
    if (k !== null) { LS.set('key', k.trim()); location.reload(); }
  }
  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('🔑 Set API key', askKey);
  if (!getKey()) {
    const bar = document.createElement('div');
    bar.textContent = '🔑 Nova Torn Helper needs your API key — click here to enter it';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:100000;background:#ffd700;color:#000;'
      + 'font:bold 14px Arial,sans-serif;text-align:center;padding:10px;cursor:pointer;box-shadow:0 2px 6px #0008';
    bar.onclick = askKey;
    document.body.appendChild(bar);
  }

  let hosp = new Map();      // id -> {id,name,level,until,flag}
  let away = new Map();      // id -> {label, desc, flag}  (abroad / traveling)
  let enemyList = [];        // hospital members of the enemy faction (for the panel)
  let enemyOkay = [];        // enemy members who can be hit right now (✅ view)
  let ownFactionId = null;
  let ownId = '';            // your own player ID (no FF badge on yourself)
  let warFactionIds = null;  // [idA, idB] when in a ranked war
  let lastFetch = 0;
  let lastError = '';

  // panel settings (remembered)
  let panelView = LS.get('view', 'hosp');       // 'hosp' | 'okay'
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
  #eht-panel .bar button{flex:1;padding:3px 2px}
  #eht-panel .atk{font-size:15px;text-decoration:none}
  #eht-btn.eht-ring{animation:eht-pulse .5s infinite alternate}
  @keyframes eht-pulse{to{background:#ffd700;transform:scale(1.15)}}
  #eht-toast{position:fixed;right:10px;bottom:145px;z-index:99999;background:#ffd700;color:#000;
    font:bold 12px Arial,sans-serif;padding:6px 10px;border-radius:6px;box-shadow:0 2px 6px #0008;display:none}
  .eht-ff{display:inline-block;margin-left:3px;padding:1px 4px;border-radius:3px;font:bold 11px Arial,sans-serif;
    color:#000;vertical-align:middle;line-height:14px;white-space:nowrap}
  #eht-tbtn{position:fixed;right:60px;bottom:90px;z-index:99999;width:44px;height:44px;border-radius:50%;
    background:#2e7d32;color:#fff;font-size:22px;border:none;box-shadow:0 2px 6px #0008;}
  #eht-card{position:fixed;right:10px;bottom:140px;z-index:99999;width:270px;background:#1e1e1e;color:#ddd;
    font:12px Arial,sans-serif;border:1px solid #444;border-radius:8px;box-shadow:0 4px 12px #000a;display:none}
  #eht-card header{background:#2b2b2b;padding:6px 8px;display:flex;gap:4px;align-items:center;border-radius:8px 8px 0 0}
  #eht-card input[type=number]{width:44px;background:#111;color:#eee;border:1px solid #555;border-radius:4px;padding:2px}
  #eht-card .tb{padding:10px 8px;min-height:44px;line-height:18px}
  #eht-card .tb a{color:#8cf;font-weight:bold;font-size:14px;text-decoration:none}
  #eht-card .btns{display:flex;gap:6px;padding:0 8px 8px}
  #eht-card .btns a,#eht-card .btns button{flex:1;text-align:center;padding:8px 0;border-radius:5px;font:bold 13px Arial,sans-serif;
    text-decoration:none;border:none}
  #eht-card #eht-atk{background:#c0392b;color:#fff}
  #eht-card #eht-atk.off{opacity:.35;pointer-events:none}
  #eht-card #eht-next{background:#444;color:#eee}
  #eht-fly{position:fixed;right:10px;bottom:140px;z-index:99999;display:none;padding:7px 12px;border-radius:18px;
    background:#1565c0;color:#fff;font:bold 14px monospace;box-shadow:0 2px 6px #0008;white-space:nowrap}
  #nova-gym{margin:8px 0;background:#1e1e1e;color:#ddd;border:1px solid #444;border-radius:6px;font:12px Arial,sans-serif}
  #nova-gym .ng-head{display:flex;align-items:center;justify-content:space-between;padding:8px;background:#2b2b2b;font-weight:bold;color:#eee}
  #nova-gym button{background:#444;color:#eee;border:1px solid #666;border-radius:4px;padding:2px 8px}
  #nova-gym .ng-body{padding:6px 8px}
  #nova-gym table{border-collapse:collapse;font:13px Arial,sans-serif}
  #nova-gym td{padding:3px 14px 3px 0;white-space:nowrap}
  #nova-gym tr.ng-top td{font-weight:bold!important}
  #nova-gym tr.ng-hd td{font-size:11px!important}
  #nova-gym .ng-up,#nova-gym .ng-down{font-size:11px}
  #nova-gym tr.ng-total td{border-top:1px solid #555;font-weight:bold!important}
  #nova-gym .ng-report{margin-top:6px;padding:6px 8px;border-radius:5px;background:#1f4d2b;color:#eee!important;line-height:16px}
  #nova-gym .ng-gain{color:#eee!important;padding-top:6px;line-height:16px}
  #nova-gym .ng-train{margin-top:6px;padding:6px 8px;border-radius:5px;background:#2a3550;color:#eee!important;line-height:16px}
  #nova-gym .ng-tip{color:#ccc!important;padding-top:6px;line-height:16px}
  #nova-travel{margin:8px 0;background:#1e1e1e;color:#ddd;border:1px solid #444;border-radius:6px;font:12px Arial,sans-serif;overflow-x:auto}
  #nova-travel .nt-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:8px;background:#2b2b2b;font-weight:bold}
  #nova-travel .nt-head label{font-weight:normal}
  #nova-travel .nt-head label:first-of-type{margin-left:auto}
  #nova-travel input{width:50px;background:#111;color:#eee;border:1px solid #555;border-radius:4px;padding:2px}
  #nova-travel button{background:#444;color:#eee;border:1px solid #666;border-radius:4px;padding:2px 8px}
  #nova-travel .nt-body{padding:6px 8px}
  #nova-travel table{width:100%;border-collapse:collapse;font:12px Arial,sans-serif;color:#eee!important;background:transparent!important}
  #nova-travel th,#nova-travel td{text-align:left;padding:4px 6px;border-bottom:1px solid #333;white-space:nowrap;
    color:#eee!important;background:transparent!important;font:12px Arial,sans-serif!important}
  #nova-travel th{color:#aaa!important;font-weight:bold!important}
  #nova-travel td b{color:#5dff7a!important}
  #nova-travel .nt-note{color:#999;padding-top:6px;font-size:11px}
  #eht-chain{position:fixed;right:110px;bottom:96px;z-index:99999;display:none;padding:7px 12px;border-radius:18px;
    background:#333;color:#fff;font:bold 14px monospace;box-shadow:0 2px 6px #0008;cursor:pointer;white-space:nowrap}
  #eht-chain.warn{background:#b8860b;color:#000}
  #eht-chain.urgent{background:#c0392b;animation:eht-blink .5s infinite alternate}
  @keyframes eht-blink{to{background:#ff0000;transform:scale(1.12)}}
  .nova-px{margin-left:4px;padding:2px 6px;border-radius:4px;border:none;background:#2e7d32;color:#fff;
    font:bold 11px Arial,sans-serif;cursor:pointer;vertical-align:middle}
  .nova-pxmsg{margin-left:4px;font:bold 11px Arial,sans-serif;color:#2e7d32;vertical-align:middle}
  #eht-prof{margin:6px 0;padding:6px 10px;border-radius:5px;color:#000;font:bold 13px Arial,sans-serif}
  .eht-ov{position:absolute;right:1px;top:50%;transform:translateY(-50%);margin:0;z-index:2;
    font-size:10px;line-height:12px;padding:1px 3px;box-shadow:0 0 2px #000}
  #eht-panel .ffcol{display:flex;gap:6px;align-items:center}
  /* Torn's own text stays in place (keeps the cell's size) but is made invisible;
     our label is pinned on top of it inside the same cell. */
  [data-eht-host]{position:relative!important;color:transparent!important}
  [data-eht-host] > :not(.eht-lbl){visibility:hidden!important}
  .eht-lbl{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
    font-size:12px!important;line-height:14px!important;white-space:nowrap;pointer-events:none}
  .eht-cd{font-family:monospace!important;font-weight:bold!important;color:#ff6b6b!important}
  .eht-cd.eht-soon{color:#ffd700!important}
  .eht-cd.eht-out{color:#5dff7a!important}
  .eht-tr{color:#4fc3f7!important;font-weight:bold!important;white-space:nowrap}`;
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
    if (!open) { card.style.display = 'none'; renderPanel(); refresh(true); }
  };

  // ---------- alerts ----------
  let actx = null;
  function unlockSound() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch {}
  }
  // Browsers only allow sound/vibration after you've tapped or clicked the page once.
  const touched = () => !!(navigator.userActivation && navigator.userActivation.hasBeenActive);
  ['pointerdown', 'keydown'].forEach(ev =>
    document.addEventListener(ev, unlockSound, { once: true, capture: true }));
  function beep() {
    if (!actx && !touched()) return;      // not allowed yet → stay quiet (toast still shows)
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
  function ring(m, left) { notify(`🔔 ${m.name} leaves hospital in ${left}s`); }
  function notify(text) {
    beep();
    try { if (touched() && navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch {}
    btn.classList.add('eht-ring');
    toast.textContent = text;
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

  // Attack page address. Torn moved it (old loader.php links now give an error),
  // so copy the address from one of Torn's own Attack buttons when the page has one.
  function attackUrl(id) {
    const own = document.querySelector('a[href*="sid=attack"][href*="user2ID="]:not(.atk):not(#eht-atk)');
    if (own) {
      const u = new URL(own.href, location.origin);
      u.searchParams.set('user2ID', id);
      return u.href;
    }
    return `https://www.torn.com/page.php?sid=attack&user2ID=${id}`;
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
        <button id="eht-view"></button><button id="eht-sort"></button><button id="eht-soon"></button><button id="eht-alert"></button>
      </div>
      <div id="eht-list"></div>`;
    const q = s => panel.querySelector(s);
    q('#eht-go').onclick = () => {
      const k = q('#eht-key');
      if (k && k.value.trim()) LS.set('key', k.value.trim());
      LS.set('fid', q('#eht-fid').value.trim());
      refresh(true);
    };
    q('#eht-view').onclick = () => { panelView = panelView === 'hosp' ? 'okay' : 'hosp'; LS.set('view', panelView); renderPanel(); };
    q('#eht-sort').onclick = () => { sortBy = sortBy === 'time' ? 'ff' : 'time'; LS.set('sort', sortBy); renderPanel(); };
    q('#eht-soon').onclick = () => { soonOnly = !soonOnly; LS.set('soon', soonOnly ? '1' : '0'); renderPanel(); };
    q('#eht-alert').onclick = () => { alertOn = !alertOn; LS.set('alert', alertOn ? '1' : '0'); unlockSound(); renderPanel(); };
  }

  function renderPanel() {
    if (panel.style.display !== 'block') return;
    const sk = getKey() ? 'key' : 'nokey';
    if (shellKey !== sk) { buildShell(); shellKey = sk; listSig = ''; }
    const q = s => panel.querySelector(s);
    const okayView = panelView === 'okay';
    q('#eht-view').textContent = okayView ? '✅ Okay' : '🏥 Hosp';
    q('#eht-sort').textContent = sortBy === 'time' ? 'Sort: Time' : 'Sort: FF';
    q('#eht-soon').textContent = soonOnly ? '≤5 min ✓' : 'All';
    q('#eht-sort').style.display = q('#eht-soon').style.display = okayView ? 'none' : '';
    q('#eht-alert').textContent = alertOn ? '🔔 On' : '🔕 Off';

    const now = Math.floor(Date.now() / 1000);
    if (okayView) return renderOkay(q, now);
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
            <span class="t">${m.flag || ''}</span>
            <a class="atk" href="${attackUrl(m.id)}" title="Attack">⚔️</a></span></div>`;
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
      row.querySelector('.t').textContent = (m.flag ? m.flag + ' ' : '') + fmt(left);
    }
    const foot = q('#eht-foot');
    if (foot) foot.textContent = `${rows.length} in hospital · updated ${Math.max(0, now - Math.floor(lastFetch / 1000))}s ago`;
  }

  // ✅ view: enemies who can be hit right now, highest FF first
  const DOT = { Online: '🟢', Idle: '🟡', Offline: '⚫' };
  function renderOkay(q, now) {
    const rows = enemyOkay.slice().sort((a, b) => (ffGet(b.id)?.ff ?? -1) - (ffGet(a.id)?.ff ?? -1));
    let msg = '';
    if (lastError) msg = '⚠️ ' + lastError;
    else if (!enemyFactionId()) msg = 'Enter the enemy faction ID (auto-detected during a ranked war).';
    else if (!rows.length) msg = 'No enemy is hittable right now (all in hospital / abroad / traveling).';
    const list = q('#eht-list');
    const sig = 'okay|' + (msg || rows.map(m => m.id + ':' + m.la + ':' + ffBadge(m.id).text).join(','));
    if (sig !== listSig) {
      listSig = sig;
      list.innerHTML = msg ? `<div class="msg">${msg}</div>` : rows.map(m => {
        const b = ffBadge(m.id);
        return `<div class="row" data-id="${m.id}">
          <a href="https://www.torn.com/profiles.php?XID=${m.id}">${DOT[m.la] || '⚪'} ${m.name} [${m.level}]</a>
          <span class="ffcol"><span class="eht-ff" style="background:${b.bg}" title="${b.title}">${b.text}</span>
          <a class="atk" href="${attackUrl(m.id)}" title="Attack">⚔️</a></span></div>`;
      }).join('') + `<div class="msg" id="eht-foot"></div>`;
    }
    const foot = q('#eht-foot');
    if (foot) foot.textContent = `${rows.length} hittable · 🟢 online 🟡 idle ⚫ offline · updated ${Math.max(0, now - Math.floor(lastFetch / 1000))}s ago`;
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

  // ---------- where is everyone? (Abroad / Traveling) ----------
  const COUNTRIES = [
    ['Mexic', '🇲🇽', 'MEX'], ['Cayman', '🇰🇾', 'CAY'], ['Canad', '🇨🇦', 'CAN'],
    ['Hawai', '🇺🇸', 'HAW'], ['United Kingdom', '🇬🇧', 'UK'], ['British', '🇬🇧', 'UK'],
    ['Argentin', '🇦🇷', 'ARG'], ['Switzerland', '🇨🇭', 'SWI'], ['Swiss', '🇨🇭', 'SWI'],
    ['Japan', '🇯🇵', 'JPN'], ['Chin', '🇨🇳', 'CHN'], ['UAE', '🇦🇪', 'UAE'], ['Emirat', '🇦🇪', 'UAE'],
    ['South Africa', '🇿🇦', 'SA'],
  ];
  // "In Japan" → 🇯🇵 Japan · "Traveling to Japan" → ✈ 🇯🇵 Japan · "Returning to Torn from Japan" → 🇯🇵 ✈ Torn
  function where(st) {
    const d = st.description || '';
    const c = COUNTRIES.find(([k]) => d.includes(k));
    if (!c) return null;
    const [, flag, name] = c;
    let label = `${flag} ${name}`;
    if (st.state === 'Traveling') label = d.startsWith('Returning') ? `${flag} ✈ Torn` : `✈ ${flag} ${name}`;
    return { flag, label, desc: d };
  }

  async function fetchFaction(fid) {
    let list;
    try {
      const j = await api(`v2/faction/${fid}/members`);
      list = (j.members || []).map(m => ({ id: String(m.id), name: m.name, level: m.level, st: m.status, la: m.last_action?.status }));
    } catch (e) {
      const j = await api(`faction/${fid}?selections=basic`);
      list = Object.entries(j.members || {}).map(([id, m]) => ({ id: String(id), name: m.name, level: m.level, st: m.status, la: m.last_action?.status }));
    }
    return list.filter(m => m.st);
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

      const next = new Map(), nextAway = new Map();
      for (const fid of ids) {
        const hl = [], ok = [];
        for (const m of await fetchFaction(fid)) {
          if (m.st.state === 'Okay') ok.push({ id: m.id, name: m.name, level: m.level, la: m.la || '' });
          const w = where(m.st);
          if (m.st.state === 'Hospital') {
            const h = { id: m.id, name: m.name, level: m.level, until: m.st.until, flag: w ? w.flag : '' };
            hl.push(h); next.set(m.id, h);
          } else if (w && (m.st.state === 'Abroad' || m.st.state === 'Traveling')) {
            nextAway.set(m.id, w);
          }
        }
        if (fid === enemy) { enemyList = hl.sort((a, b) => a.until - b.until); enemyOkay = ok; }
      }
      hosp = next;
      away = nextAway;
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
      // say it once per page, so a stuck "…" badge never leaves you guessing
      if (!ffWarned) {
        ffWarned = true;
        toast.textContent = '⚠️ FF badges: FFScouter refused your API key. Register this key at ffscouter.com, then reload.';
        toast.style.display = 'block';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 12000);
      }
    }
    ffBusy = false;
  }
  let ffWarned = false;

  function ffColor(ff) {
    if (ff <= 1.5) return '#3b6bff';
    if (ff <= 2.25) return '#22d3ee';
    if (ff <= 3.5) return '#34d399';
    if (ff <= 4.5) return '#fb923c';
    return '#ef4444';
  }

  // Badges always show the estimated stats; the colour follows FF
  // (blue = easy … red = very hard). The FF number is in the hover text.
  function ffBadge(id) {
    const e = ffGet(id);
    if (!e) return ffError ? { text: '!', bg: '#c0392b', title: ffError } : { text: '…', bg: '#666', title: 'Loading FF' };
    if (e.ff == null) return { text: '?', bg: '#666', title: 'No FF estimate' };
    const ff = Number(e.ff).toFixed(2), bs = e.bs ?? '?';
    return { text: bs, bg: ffColor(e.ff), title: `FF ${ff}  ·  est. stats ${bs}` };
  }

  // ---------- inline timers + FF in the member list ----------
  // The row's Status cell. If the "row" holds more than one Status cell it is
  // really a whole list (Torn wraps lists in an <li> too), so we skip it.
  function findStatusCell(row) {
    const found = [];
    for (const el of row.querySelectorAll('.status, [class*="status"]')) {
      if (el.closest('#eht-panel')) continue;
      if (el.dataset.ehtHost) { found.push(el); continue; }
      if (el.querySelector('.status, [class*="status"]')) continue;   // want the innermost one
      if (/^(Hospital|OUT|Abroad|Traveling|Okay|[\d:]+)$/.test(el.textContent.trim())) found.push(el);
    }
    return found.length === 1 ? found[0] : null;
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
      // Honor-bar names (an image): the badge sits ON the right end of the bar, so it
      // takes no extra width and can't spill into the Level column.
      // Plain text names: the badge goes right after the name.
      const onBar = !!a.querySelector('img');
      let badge = onBar ? a.querySelector(':scope > .eht-ff') : a.nextElementSibling;
      if (!badge || !badge.classList.contains('eht-ff')) {
        badge = document.createElement('span');
        badge.className = onBar ? 'eht-ff eht-ov' : 'eht-ff';
        if (onBar) {
          if (getComputedStyle(a).position === 'static') a.style.position = 'relative';
          a.appendChild(badge);
        } else {
          a.after(badge);
        }
      }
      const b = ffBadge(id);
      if (badge.textContent !== b.text) badge.textContent = b.text;
      badge.style.background = b.bg;
      badge.title = b.title;

      if (!onFaction) continue;
      const cell = findStatusCell(row);
      if (!cell) continue;
      // We never overwrite Torn's own text (Torn redraws it and they'd clash).
      // Instead we hide it and show our own label in the same cell.
      const m = hosp.get(id), w = away.get(id);
      let lbl = cell.querySelector(':scope > .eht-lbl');
      if (!m && !w) {                  // nothing to show → give the cell back to Torn
        if (lbl) lbl.remove();
        delete cell.dataset.ehtHost;
        continue;
      }
      if (!lbl) {
        lbl = document.createElement('span');
        lbl.className = 'eht-lbl';
        cell.appendChild(lbl);
      }
      cell.dataset.ehtHost = '1';
      let txt;
      if (m) {                         // hospital countdown (flag if in a hospital abroad)
        const left = m.until - now;
        lbl.classList.remove('eht-tr');
        lbl.classList.add('eht-cd');
        lbl.classList.toggle('eht-soon', left > 0 && left <= SOON_SEC);
        lbl.classList.toggle('eht-out', left <= 0);
        lbl.title = '';
        txt = (m.flag ? m.flag + ' ' : '') + fmt(left);
      } else {                         // abroad / traveling
        lbl.classList.remove('eht-cd', 'eht-soon', 'eht-out');
        lbl.classList.add('eht-tr');
        lbl.title = w.desc;
        txt = w.label;
      }
      if (lbl.textContent !== txt) lbl.textContent = txt;
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

  // ---------- 🎯 target finder (outside hits) ----------
  // Asks FFScouter for players in your FF range, then checks with the Torn API
  // that the player is out of hospital/jail/travel before showing them.
  const tbtn = document.createElement('button');
  tbtn.id = 'eht-tbtn';
  tbtn.textContent = '🎯';
  const card = document.createElement('div');
  card.id = 'eht-card';
  card.innerHTML = `<header>FF <input type="number" id="eht-min" step="0.1"> – <input type="number" id="eht-max" step="0.1">
      <label style="margin-left:auto"><input type="checkbox" id="eht-inact"> inactive</label></header>
    <div class="tb" id="eht-tb"></div>
    <div class="btns"><a id="eht-atk" class="off" href="#">⚔️ Attack</a><button id="eht-next">Next ▶</button></div>`;
  document.body.append(tbtn, card);
  const cq = s => card.querySelector(s);
  cq('#eht-min').value = LS.get('tmin', '2');
  cq('#eht-max').value = LS.get('tmax', '3');
  cq('#eht-inact').checked = LS.get('tinact', '1') === '1';
  const saveT = () => {
    LS.set('tmin', cq('#eht-min').value); LS.set('tmax', cq('#eht-max').value);
    LS.set('tinact', cq('#eht-inact').checked ? '1' : '0');
    pool = [];                                   // new settings → new search
  };
  cq('#eht-min').onchange = cq('#eht-max').onchange = cq('#eht-inact').onchange = saveT;

  let pool = [], poolT = 0, tBusy = false;
  const setTB = html => { cq('#eht-tb').innerHTML = html; };

  async function loadPool() {
    const key = getKey();
    if (!key) throw new Error('Enter your API key in the 🏥 panel first.');
    const url = `https://ffscouter.com/api/v1/get-targets?key=${key}`
      + `&minff=${cq('#eht-min').value}&maxff=${cq('#eht-max').value}`
      + `&inactiveonly=${cq('#eht-inact').checked ? 1 : 0}&limit=50`;
    const j = JSON.parse(await httpGet(url));
    const arr = Array.isArray(j) ? j : (j && (j.targets || j.data)) || [];
    if (!arr.length && j && (j.error || j.message)) throw new Error('FFScouter: ' + (j.error || j.message));
    pool = arr.map(t => ({
      id: String(t.player_id ?? t.id),
      ff: t.fair_fight ?? t.ff,
      bs: t.bs_estimate_human ?? '?',
    })).filter(t => t.id && t.id !== 'undefined' && t.id !== ownId);
    poolT = Date.now();
  }

  async function findTarget() {
    if (tBusy) return;
    tBusy = true;
    cq('#eht-atk').classList.add('off');
    setTB('🔎 Searching…');
    try {
      for (let tries = 0; tries < 8; tries++) {
        if (!pool.length || Date.now() - poolT > 10 * 60 * 1000) await loadPool();
        if (!pool.length) throw new Error('No players in this FF range. Try a wider range.');
        const t = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        const p = await api(`user/${t.id}?selections=profile`);
        if (p.status?.state !== 'Okay') continue;     // in hospital / jail / travelling → skip
        ffCache[t.id] = { ff: t.ff, bs: t.bs, t: Date.now() };
        const ff = t.ff != null ? Number(t.ff).toFixed(2) : '?';
        setTB(`<a href="https://www.torn.com/profiles.php?XID=${t.id}">${p.name} [${p.level}]</a>
          <span class="eht-ff" style="background:${t.ff != null ? ffColor(t.ff) : '#666'}">${ff}</span><br>
          est. stats ${t.bs} · last active ${p.last_action?.relative ?? '?'}`);
        const atk = cq('#eht-atk');
        atk.href = attackUrl(t.id);
        atk.classList.remove('off');
        return;
      }
      setTB('Everyone checked was busy — press Next ▶');
    } catch (e) {
      setTB('⚠️ ' + (e.message || e));
    } finally {
      tBusy = false;
    }
  }

  tbtn.onclick = () => {
    const open = card.style.display === 'block';
    card.style.display = open ? 'none' : 'block';
    if (!open) { panel.style.display = 'none'; findTarget(); }
  };
  cq('#eht-next').onclick = findTarget;

  // ---------- ⛓️ chain alarm + ⚡ energy alert ----------
  // Uses your bars (one API call): every 60s normally, every 15s while a chain runs,
  // every 5s when the chain timer is close to running out.
  const CHAIN_STEPS = [60, 90, 120, 180];          // tap the chain timer to pick one
  let chainWarn = +LS.get('chainwarn', '90');
  if (!CHAIN_STEPS.includes(chainWarn)) chainWarn = 90;
  let bars = null, barsT = 0, lastChainBeep = 0;

  const chainEl = document.createElement('div');
  chainEl.id = 'eht-chain';
  chainEl.title = 'Tap to change when the chain alarm starts';
  document.body.appendChild(chainEl);
  chainEl.onclick = () => {
    unlockSound();
    chainWarn = CHAIN_STEPS[(CHAIN_STEPS.indexOf(chainWarn) + 1) % CHAIN_STEPS.length];
    LS.set('chainwarn', String(chainWarn));
    toast.textContent = `⛓️ Chain alarm starts at ${fmt(chainWarn)} left`;
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 3000);
  };

  let barsDenied = false;
  async function loadBars() {
    if (!getKey() || barsDenied) return;
    try { bars = await api('user/?selections=bars,travel,cooldowns'); barsT = Date.now(); }
    catch (e) {
      // error 16 = key level too low (Public key) → tell the user once, stop asking
      if (/error 16\b/.test(e.message)) {
        barsDenied = true;
        toast.textContent = '🔑 Chain & energy alerts need a LIMITED API key. Yours is Public — '
          + (PDA_KEY.includes('PDA-APIKEY') ? 'Tampermonkey menu → 🔑 Set API key.' : 'change it in PDA settings.');
        toast.style.display = 'block';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 12000);
      }
    }
  }
  const flying = () => bars?.travel && bars.travel.time_left > 0;
  const chainActive = () => bars?.chain && bars.chain.current >= 10 && bars.chain.timeout > 0;
  const chainLeft = () => bars.chain.timeout - Math.floor((Date.now() - barsT) / 1000);

  function checkBars() {
    if (!bars) { chainEl.style.display = 'none'; return; }
    const gone = Math.floor((Date.now() - barsT) / 1000);

    // ⛓️ chain: on-screen timer + repeating alarm until someone hits
    if (chainActive() && chainLeft() > -30) {
      const c = bars.chain, left = chainLeft();
      chainEl.style.display = 'block';
      chainEl.textContent = `⛓️ ${c.current} · ${left > 0 ? fmt(left) : '0:00?'}`;
      chainEl.classList.toggle('warn', left <= chainWarn && left > 30);
      chainEl.classList.toggle('urgent', left <= 30);
      if (alertOn && left > 0 && left <= chainWarn) {
        const every = left <= 30 ? 3000 : 10000;   // faster when it's really close
        if (Date.now() - lastChainBeep >= every) {
          lastChainBeep = Date.now();
          notify(`⛓️ CHAIN ${c.current}: ${fmt(left)} left — HIT NOW!`);
        }
      }
    } else {
      chainEl.style.display = 'none';
    }

    checkTravel();
    checkDrug();

    // ⚡ energy full (once per full bar, remembered across pages)
    const e = bars.energy;
    if (e && alertOn) {
      const full = e.current >= e.maximum || (e.fulltime > 0 && e.fulltime - gone <= 0);
      if (full && LS.get('efull', '0') !== '1') {
        LS.set('efull', '1');
        notify(`⚡ Energy full (${e.maximum}) — use it before regen is wasted!`);
      }
      if (!full) LS.set('efull', '0');
    }
  }

  setInterval(() => {
    if (document.hidden) return;
    const age = Date.now() - barsT;
    let every = 60000;
    if (chainActive()) every = chainLeft() <= 30 ? 3000 : chainLeft() <= chainWarn + 30 ? 5000 : 15000;
    if (age > every) loadBars();
  }, 1000);
  loadBars();

  // ---------- 💪 battle stats box (Gym page) ----------
  // Shows your four battle stats + share, and how high the other stats can go
  // while your top stat keeps its 25% lead (needed for its specialty gym).
  const SPECIALTY = { strength: 'Gym 3000', defense: "Mr. Isoyama's", speed: 'Total Rebound', dexterity: 'Elites' };
  const STAT_NAMES = { strength: 'Strength', defense: 'Defense', speed: 'Speed', dexterity: 'Dexterity' };

  async function loadBattleStats() {
    let j;
    try { j = await api('v2/user/battlestats'); } catch { j = null; }
    // each stat → { v: battle value, m: modifier in % (perks, education, faction…) }
    const v2 = j && j.battlestats;
    if (v2 && v2.strength) {
      const one = x => (typeof x === 'object' ? { v: x.value, m: x.modifier || 0 } : { v: x, m: 0 });
      return { strength: one(v2.strength), defense: one(v2.defense), speed: one(v2.speed), dexterity: one(v2.dexterity) };
    }
    const v1 = await api('user/?selections=battlestats');   // older API as a fallback
    if (v1.strength == null) throw new Error('Torn did not return battle stats');
    const one = k => ({ v: v1[k], m: v1[k + '_modifier'] || 0 });
    return { strength: one('strength'), defense: one('defense'), speed: one('speed'), dexterity: one('dexterity') };
  }

  async function renderGymBox(box, doCheck = false) {
    const body = box.querySelector('.ng-body');
    body.textContent = 'Loading…';
    try {
      const raw = await loadBattleStats();
      const keys = Object.keys(STAT_NAMES);
      const st = {}, eff = {};
      keys.forEach(k => { st[k] = raw[k].v; eff[k] = Math.round(raw[k].v * (1 + raw[k].m / 100)); });
      const effTotal = keys.reduce((t, k) => t + eff[k], 0);

      // 📊 manual checks, like Torn Stats: "📊 Check" reports the gains since your
      // LAST check, then saves now as the new last check.
      const cur = {}; keys.forEach(k => { cur[k] = Math.round(st[k]); });
      let last = null;
      try {
        const old = JSON.parse(LS.get('bsnap', 'null'));
        last = old && old.v ? old : old && (old.prev || old.last) ? (old.prev || old.last) : null;   // older formats too
      } catch {}
      const ago = ms => { const h = Math.floor(ms / 3600000), d = Math.floor(h / 24);
        return d >= 1 ? `${d} day${d > 1 ? 's' : ''}` : h >= 1 ? `${h} hour${h > 1 ? 's' : ''}` : ms < 60000 ? 'less than a minute' : `${Math.round(ms / 60000)} min`; };
      const gainsVs = base => {
        const ups = keys.map(k => [k, cur[k] - (base.v[k] || 0)]).filter(([, d]) => d > 0);
        const sum = ups.reduce((t, [, d]) => t + d, 0);
        return ups.length ? ups.map(([k, d]) => `${STAT_NAMES[k]} <b>+${d.toLocaleString()}</b>`).join(' · ')
          + (ups.length > 1 ? ` · Total <b>+${sum.toLocaleString()}</b>` : '') : '';
      };

      if (doCheck && last && !gainsVs(last)) {
        // nothing gained since the last check (e.g. a double tap): keep the last report as it is
        toast.textContent = '📊 No new gains since your last check — your last report is kept.';
        toast.style.display = 'block';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 4000);
      } else if (doCheck) {
        // report: last check → now, then now becomes the last check
        const now = Date.now();
        const report = last
          ? { t: now, text: (gainsVs(last) || 'no gains') + ` — since your previous check ${ago(now - last.t)} before` }
          : { t: now, text: 'first check saved — your next check will show your gains' };
        LS.set('breport', JSON.stringify(report));
        last = { t: now, v: cur };
        LS.set('bsnap', JSON.stringify(last));
      }

      let report = null;
      try { report = JSON.parse(LS.get('breport', 'null')); } catch {}
      let gainHtml = '';
      if (report) gainHtml += `<div class="ng-report">📊 <b>Check ${ago(Date.now() - report.t)} ago:</b> ${report.text}</div>`;
      if (last) {
        const g = gainsVs(last);
        gainHtml += `<div class="ng-gain">📈 Since your last check (${ago(Date.now() - last.t)} ago): `
          + (g || 'no gains yet') + (g ? '. Tap 📊 Check to save.' : '') + '</div>';
      } else {
        gainHtml += '<div class="ng-gain">📈 Tap <b>📊 Check</b> to save your stats. Each check then shows your gains since the one before.</div>';
      }
      const modTxt = k => { const m = raw[k].m; return m ? `<span class="${m > 0 ? 'ng-up' : 'ng-down'}">(${m > 0 ? '+' : ''}${m}%)</span>` : ''; };
      const total = keys.reduce((t, k) => t + st[k], 0);
      const sorted = keys.slice().sort((a, b) => st[b] - st[a]);
      const top = sorted[0], second = sorted[1];
      const cap = Math.floor(st[top] / 1.25);
      const keeps = st[second] <= cap;

      // 🎯 train next: an attacker's plan — most energy into the other stats
      // (Speed to hit, Strength for damage, then Defense); ~10% into your top stat.
      const PLAN = { speed: 40, strength: 35, defense: 15, dexterity: 15 };
      const others = keys.filter(k => k !== top);
      const w = {}; others.forEach(k => { w[k] = PLAN[k]; });
      const wSum = others.reduce((t, k) => t + w[k], 0);
      others.forEach(k => { w[k] = Math.round(w[k] / wSum * 90); });   // 90% split over the other three
      w[top] = 10;
      // the stat furthest behind the plan = lowest stat-per-weight among the other three
      const behind = others.slice().sort((a, b) => st[a] / w[a] - st[b] / w[b]);
      const nearCap = behind.filter(k => cap - st[k] < cap * 0.1);       // within 10% of the specialty limit
      const next = behind.find(k => !nearCap.includes(k)) || top;
      const trainHtml = `<div class="ng-train">🎯 <b>Train next: ${STAT_NAMES[next]}</b>`
        + (behind[1] && behind[1] !== next ? ` (then ${STAT_NAMES[behind.find(k => k !== next && !nearCap.includes(k)) || top]})` : '')
        + `. Suggested energy: ${keys.slice().sort((a, b) => w[b] - w[a]).map(k => `${STAT_NAMES[k]} ${w[k]}%`).join(' · ')}.`
        + (nearCap.length ? ` ⚠️ ${nearCap.map(k => STAT_NAMES[k]).join(', ')} close to the ${SPECIALTY[top]} limit — train ${STAT_NAMES[top]} first.` : '')
        + '</div>';
      body.innerHTML = `<table><tr class="ng-hd"><td></td><td>Battle</td><td>Share</td><td>Effective</td></tr>${keys.map(k => `<tr${k === top ? ' class="ng-top"' : ''}><td>${STAT_NAMES[k]}</td>
          <td>${Math.round(st[k]).toLocaleString()}</td><td>${(st[k] / total * 100).toFixed(0)}%</td>
          <td>${eff[k].toLocaleString()} ${modTxt(k)}</td></tr>`).join('')}
          <tr class="ng-total"><td>Total</td><td>${Math.round(total).toLocaleString()}</td><td></td><td>${effTotal.toLocaleString()}</td></tr></table>
        ${gainHtml}${trainHtml}<div class="ng-tip">${keeps
          ? `🏋️ To keep <b>${SPECIALTY[top]}</b> (${STAT_NAMES[top]} 25% ahead), keep every other stat under <b>${cap.toLocaleString()}</b>.`
            + ` Room left: ${keys.filter(k => k !== top).map(k => `${STAT_NAMES[k]} +${Math.max(0, cap - Math.round(st[k])).toLocaleString()}`).join(' · ')}`
          : `⚠️ ${STAT_NAMES[second]} is within 25% of ${STAT_NAMES[top]}, so ${SPECIALTY[top]} needs ${STAT_NAMES[top]} at ${Math.ceil(st[second] * 1.25).toLocaleString()}.`}</div>`;
      body.querySelectorAll('td, b, .ng-up, .ng-down').forEach(el => el.style.setProperty('color',
        el.tagName === 'B' ? '#5dff7a' : el.classList.contains('ng-up') ? '#6fcf6f' : el.classList.contains('ng-down') ? '#ff6b6b'
          : el.closest('.ng-hd') ? '#999' : '#eee', 'important'));
    } catch (e) {
      const msg = e.message || String(e);
      body.textContent = /error (16|2)\b/.test(msg)
        ? '🔑 Battle stats need a LIMITED (or Full) API key. ' + msg
        : '⚠️ Could not load battle stats: ' + msg;
    }
  }

  function addGymBox() {
    if (!location.pathname.includes('gym.php') || document.getElementById('nova-gym') || !getKey()) return;
    const anchor = document.querySelector('.content-title') || document.querySelector('.content-wrapper');
    if (!anchor) return;
    const box = document.createElement('div');
    box.id = 'nova-gym';
    box.innerHTML = '<div class="ng-head">💪 My battle stats <span><button class="ng-check" title="Show gains since your last check, then save this as the new last check">📊 Check</button> '
      + '<button class="ng-go" title="Reload stats">↻</button></span></div><div class="ng-body"></div>';
    if (anchor.classList.contains('content-title')) anchor.after(box); else anchor.prepend(box);
    box.querySelector('.ng-go').onclick = () => renderGymBox(box);
    box.querySelector('.ng-check').onclick = () => renderGymBox(box, true);
    renderGymBox(box);
  }

  // ---------- 💊 drug cooldown alarm ----------
  // Beeps once when your drug cooldown runs out. The end time is remembered
  // across pages, so it still fires if the cooldown ends between two checks.
  function checkDrug() {
    const cd = bars?.cooldowns;
    if (cd && cd.drug > 0) {
      const end = Math.round((barsT / 1000 + cd.drug) / 60) * 60;   // rounded to the minute
      if (LS.get('drugend', '') !== String(end)) LS.set('drugend', String(end));
    }
    const end = +LS.get('drugend', '0');
    const now = Math.floor(Date.now() / 1000);
    if (!end || now < end || now - end > 600) return;               // not yet / too long ago
    if (alertOn && LS.get('drugalerted', '') !== String(end)) {
      LS.set('drugalerted', String(end));
      notify('💊 Drug cooldown is over — you can take your next drug!');
    }
  }

  // ---------- ✈️ travel helper ----------
  // 1) While flying: a landing countdown on every page, and a beep when you land.
  // 2) On the travel page: the best item to bring back from each country
  //    (foreign stock from YATA, item values from Torn), ranked by profit per hour.
  const flyEl = document.createElement('div');
  flyEl.id = 'eht-fly';
  document.body.appendChild(flyEl);

  function placeName(dest) {
    const w = where({ state: 'Abroad', description: 'In ' + dest });
    return w ? `${w.flag} ${w.label.split(' ').pop()}` : dest;
  }

  function checkTravel() {
    const t = bars?.travel;
    const panelsOpen = panel.style.display === 'block' || card.style.display === 'block';
    if (!t || !t.timestamp) { flyEl.style.display = 'none'; return; }
    const left = t.timestamp - Math.floor(Date.now() / 1000);
    if (left > 0) {
      flyEl.style.display = panelsOpen ? 'none' : 'block';
      flyEl.textContent = `✈️ ${placeName(t.destination)} · ${fmt(left)}`;
    } else {
      flyEl.style.display = 'none';
      // landed in the last 2 minutes → tell once (remembered across pages)
      if (alertOn && left > -120 && LS.get('landed', '') !== String(t.timestamp)) {
        LS.set('landed', String(t.timestamp));
        notify(`✈️ Landed in ${t.destination}!`);
      }
    }
  }

  const FLIGHT_MIN = { mex: 26, cay: 35, can: 41, haw: 134, uni: 159, arg: 167, swi: 175, jap: 225, chi: 242, uae: 271, sou: 297 };
  const YATA_CC = { mex: '🇲🇽 MEX', cay: '🇰🇾 CAY', can: '🇨🇦 CAN', haw: '🇺🇸 HAW', uni: '🇬🇧 UK', arg: '🇦🇷 ARG',
    swi: '🇨🇭 SWI', jap: '🇯🇵 JPN', chi: '🇨🇳 CHN', uae: '🇦🇪 UAE', sou: '🇿🇦 SA' };
  const money = n => {
    const a = Math.abs(n);
    const t = a >= 1e9 ? (a / 1e9).toFixed(2) + 'b' : a >= 1e6 ? (a / 1e6).toFixed(1) + 'm' : a >= 1e3 ? Math.round(a / 1e3) + 'k' : String(Math.round(a));
    return (n < 0 ? '-$' : '$') + t;
  };

  async function marketValues() {
    try {
      const c = JSON.parse(LS.get('mv', 'null'));
      if (c && Date.now() - c.t < 6 * 3600 * 1000) return c.v;    // cache 6 hours
    } catch {}
    const j = await api('torn/?selections=items');
    const v = {};
    for (const [id, it] of Object.entries(j.items || {})) v[id] = it.market_value || 0;
    LS.set('mv', JSON.stringify({ t: Date.now(), v }));
    return v;
  }

  let travelBusy = false;
  async function renderTravelTable(box) {
    if (travelBusy) return;
    travelBusy = true;
    const body = box.querySelector('.nt-body');
    body.textContent = 'Loading…';
    try {
      const cap = Math.max(1, +LS.get('cap', '10') || 10);
      const fee = Math.min(50, Math.max(0, parseFloat(LS.get('fee', '5')) || 0));   // % you pay when selling
      const [mv, txt] = await Promise.all([marketValues(), httpGet('https://yata.yt/api/v1/travel/export/')]);
      const stocks = JSON.parse(txt).stocks || {};
      const rows = [];
      for (const [cc, c] of Object.entries(stocks)) {
        if (!FLIGHT_MIN[cc]) continue;
        let best = null;
        for (const it of c.stocks || []) {
          if (!(it.quantity > 0) || !mv[it.id]) continue;
          const profit = Math.round(mv[it.id] * (1 - fee / 100) - it.cost);   // after the sell fee
          if (!best || profit > best.profit) best = { name: it.name, profit, qty: it.quantity };
        }
        if (!best || best.profit <= 0) continue;
        const perHour = best.profit * Math.min(cap, best.qty) / (2 * FLIGHT_MIN[cc] / 60);
        rows.push({ cc, ...best, perHour, age: Math.round((Date.now() / 1000 - (c.update || 0)) / 60) });
      }
      rows.sort((a, b) => b.perHour - a.perHour);
      body.innerHTML = rows.length ? `<table><tr><th>Where</th><th>Best item</th><th>Profit/ea</th><th>Stock</th><th>Per hour*</th><th>Flight</th></tr>`
        + rows.map(r => `<tr><td>${YATA_CC[r.cc]}</td><td>${r.name}</td><td>${money(r.profit)}</td><td>${r.qty.toLocaleString()}</td>`
          + `<td><b>${money(r.perHour)}</b></td><td>${Math.floor(FLIGHT_MIN[r.cc] / 60)}:${String(FLIGHT_MIN[r.cc] % 60).padStart(2, '0')}</td></tr>`).join('')
        + `</table><div class="nt-note">* after a ${fee}% sell fee, carrying ${cap} items, round trip, standard flight times. Stock from YATA (updated ${Math.min(...rows.map(r => r.age))}–${Math.max(...rows.map(r => r.age))} min ago).</div>`
        : 'No profitable items in stock right now.';
      // colour set on each cell directly: beats any page style (Torn's desktop CSS darkened the text)
      body.querySelectorAll('th, td, td b').forEach(el => {
        el.style.setProperty('color', el.tagName === 'B' ? '#5dff7a' : el.tagName === 'TH' ? '#aaa' : '#eee', 'important');
      });
    } catch (e) {
      body.textContent = '⚠️ Could not load travel data: ' + (e.message || e);
    }
    travelBusy = false;
  }

  function addTravelBox() {
    const onTravel = location.pathname.includes('travelagency.php') || location.href.includes('sid=travel');
    if (!onTravel || document.getElementById('nova-travel')) return;
    const anchor = document.querySelector('.content-title') || document.querySelector('.content-wrapper');
    if (!anchor) return;
    const box = document.createElement('div');
    box.id = 'nova-travel';
    box.innerHTML = `<div class="nt-head">✈️ Best items to bring back
        <label>I can carry <input type="number" min="1" class="nt-cap" value="${LS.get('cap', '10')}"> items</label>
        <label>Sell fee <input type="number" min="0" max="50" step="0.5" class="nt-fee" value="${LS.get('fee', '5')}">%</label>
        <button class="nt-go">↻</button></div><div class="nt-body"></div>`;
    if (anchor.classList.contains('content-title')) anchor.after(box); else anchor.prepend(box);
    box.querySelector('.nt-cap').onchange = e => { LS.set('cap', String(Math.max(1, +e.target.value || 10))); renderTravelTable(box); };
    box.querySelector('.nt-fee').onchange = e => { LS.set('fee', String(Math.min(50, Math.max(0, parseFloat(e.target.value) || 0)))); renderTravelTable(box); };
    box.querySelector('.nt-go').onclick = () => renderTravelTable(box);
    renderTravelTable(box);
  }

  // ---------- 💲 item market price helper ----------
  // On the Item Market / Bazaar "add" pages, adds a "−$1" button next to each
  // price box. Tap it → fills in $1 below the cheapest Item Market listing.
  // It only types the price; you still press Torn's list/add button yourself.
  const UNDERCUT = 1;
  const priceCache = {};   // itemId -> {low, t}

  async function lowestPrice(itemId) {
    const c = priceCache[itemId];
    if (c && Date.now() - c.t < 60000) return c.low;
    const j = await api(`v2/market/${itemId}/itemmarket`);
    const ls = j.itemmarket?.listings || [];
    const low = ls.length ? Math.min(...ls.map(l => l.price ?? l.cost)) : null;
    priceCache[itemId] = { low, t: Date.now() };
    return low;
  }

  // React-friendly way to type into an input
  function typeValue(input, v) {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(input, String(v));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  }

  // The item's picture URL contains its ID: /images/items/123/large.png
  function findItemId(input) {
    for (let el = input; el && el !== document.body; el = el.parentElement) {
      const img = el.querySelector('img[src*="/items/"]');
      if (img) { const m = img.src.match(/\/items\/(\d+)\//); if (m) return m[1]; }
    }
    return null;
  }

  function addPriceButtons() {
    const onMarket = location.href.includes('sid=ItemMarket') || location.pathname.includes('bazaar.php');
    if (!onMarket) return;
    const inputs = document.querySelectorAll(
      'input.input-money, input[placeholder*="rice" i], input[aria-label*="price" i], input[class*="price" i], input[name*="price" i]');
    for (const input of inputs) {
      if (input.type === 'hidden' || input.dataset.novaPx || input.closest('#eht-panel, #eht-card')) continue;
      const itemId = findItemId(input);
      if (!itemId) continue;
      input.dataset.novaPx = '1';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'nova-px';
      b.textContent = `−$${UNDERCUT}`;
      const msg = document.createElement('span');
      msg.className = 'nova-pxmsg';
      b.onclick = async (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        msg.textContent = '…';
        try {
          const low = await lowestPrice(itemId);
          if (low == null) { msg.textContent = 'no listings'; return; }
          const price = Math.max(low - UNDERCUT, 1);
          // fill this box, plus the hidden twin Torn keeps for money inputs
          const group = input.closest('.input-money-group');
          const boxes = group ? group.querySelectorAll('input') : [input];
          boxes.forEach(x => typeValue(x, price));
          msg.textContent = `low $${low.toLocaleString()}`;
        } catch (e) {
          msg.textContent = '⚠️ ' + (e.message || e);
        }
      };
      const anchor = input.closest('.input-money-group') || input;
      anchor.after(b, msg);
    }
  }

  // ---------- loops ----------
  setInterval(() => {
    checkAlerts();
    checkBars();
    if (document.hidden) return;
    renderPanel();
    decorateRows();
    addPriceButtons();
    addTravelBox();
    addGymBox();
    if (panel.style.display === 'block') {
      const miss = enemyList.concat(enemyOkay).map(m => m.id).filter(id => !ffGet(id));
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
} // end of 'only run once'

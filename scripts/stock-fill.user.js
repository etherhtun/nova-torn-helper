// ==UserScript==
// @name         Nova Stock Fill
// @namespace    nova-torn-helper
// @version      1.0
// @description  Adds a "Fill stock" button to your company Stock page. It fills the order boxes by daily sales; you review and press Torn's order button yourself.
// @match        https://www.torn.com/companies.php*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/etherhtun/nova-torn-helper/main/scripts/stock-fill.user.js
// @updateURL    https://raw.githubusercontent.com/etherhtun/nova-torn-helper/main/scripts/stock-fill.user.js
// ==/UserScript==

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
  setInterval(addButton, 1000);
})();

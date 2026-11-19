# Nova Torn Helper

One all-in-one userscript for [Torn City](https://www.torn.com). Works in **Torn PDA** (phone) and **Tampermonkey** (computer).

It only shows information and fills in boxes — **you press every game action yourself** (attack, order, list), so it stays within Torn's scripting rules.

## Install

**Link:**

```
https://raw.githubusercontent.com/etherhtun/nova-torn-helper/main/scripts/nova-torn-helper.user.js
```

**Torn PDA (phone)**
1. Settings → Userscripts → **+** → remote URL → paste the link → save.
2. Reload Torn. PDA gives the script your API key automatically.

**Computer (Chrome + Tampermonkey)**
1. Install the Tampermonkey extension.
2. `chrome://extensions` → Tampermonkey → Details → turn on **Allow User Scripts**.
3. Open the link above → **Install**.
4. Open Torn → click the yellow bar at the top → paste your API key.

**Before you start**
- Use a **Limited** API key (Torn → Settings → API Keys). A Public key won't work for the chain, energy, drug and gym features.
- Register that same key once at [ffscouter.com](https://ffscouter.com), or the FF badges show a red `!`.
- Updates: PDA → **Check for Update**; Tampermonkey updates by itself about once a day.

## Features

### ⚔️ Wars and fighting
- **FF badges** next to player names on any page: they show the **estimated stats** (like `1.35b`), coloured by Fair Fight — 🔵 easy · 🟢 good · 🟠 hard · 🔴 very hard. Hover for the exact FF.
- **Profile pages:** a Fair Fight line at the top with FF and estimated stats.
- **Status column** on faction and war pages: hospital countdowns instead of "Hospital", and the country instead of "Abroad"/"Traveling" (`🇯🇵 JPN`, `✈ 🇲🇽 MEX` flying there, `🇦🇪 ✈ Torn` flying home).
- **🏥 panel** (red button):
  - **🏥 Hosp:** enemies in hospital, soonest out first, with a "≤5 min" filter and a 🔔 beep 20s before one gets out.
  - **✅ Okay:** every enemy you can hit right now, highest FF first, with 🟢 online / 🟡 idle / ⚫ offline.
  - ⚔️ attack link on every row.
- **🎯 Target finder** (green button): a player in your FF range who's ready to fight, for outside hits. **Next ▶** for another.

### ⛓️ Alarms (while Torn is open)
- **Chain timer + alarm:** while your faction chain (10+) runs, a ⛓️ timer shows on screen. Below the warning time it turns yellow and beeps every 10s; under 30s it flashes red and beeps every 3s — until someone hits. Tap the timer to choose when it starts: 1:00 / 1:30 / 2:00 / 3:00.
- **💊 Drug cooldown over** · **⚡ Energy full** · **✈️ Landed** — one beep each.
- Turn all alarms on/off with the 🔔 button in the 🏥 panel. Tap Torn once after opening it so the browser allows sound.

### 💪 Gym page
- Your battle stats, share and **effective stats** (with each bonus/penalty).
- **📊 Check** (like Torn Stats' manual update): shows what you gained since your last check, then saves now as the new last check. Between checks the box previews your gains so far.
- **🎯 Train next:** which stat to train now, from an attacker's plan (Speed 40% · Strength 35% · Defense 15% · top stat 10%), skipping any stat close to your specialty gym limit.
- How high your other stats can go while your top stat keeps its 25% lead for its specialty gym (Elites, Gym 3000, Mr. Isoyama's, Total Rebound).

### ✈️ Travel
- While flying: a ✈️ landing countdown on every page.
- On the Travel Agency page: the best item to bring back from each country, ranked by profit per hour for how many items you can carry, after the sell fee you set (default 5%; use 0 for bazaar sales). Stock from [YATA](https://yata.yt).

### 💰 Money
- **Item Market / Bazaar:** a **−$1** button next to each price box fills in $1 below the cheapest listing.
- **Company Stock page:** a **Fill stock** button fills each order box by daily sales.

## Good to know
- The 🎯 🏥 buttons cover something? **Press and drag them** anywhere — the position is remembered and the panels follow.
- Forgot your key? Torn → Settings → API Keys, or (computer) Tampermonkey menu → 🔑 Set API key shows the saved one.
- Alarms only work while Torn is open on screen (the phone can't beep for a closed app).
- Your API key stays on your own device. It's only sent to Torn's API and FFScouter (for FF), never anywhere else.
- The code is all in one file in this repository — anyone can read it.

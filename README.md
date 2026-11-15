# nova-torn-helper

One all-in-one userscript for [Torn City](https://www.torn.com), for **Torn PDA** and **Tampermonkey**.

## Install

**Link:**

```
https://raw.githubusercontent.com/etherhtun/nova-torn-helper/main/scripts/nova-torn-helper.user.js
```

- **Torn PDA:** Settings → Userscripts → **+** → remote URL → paste the link. Injection time: **End**. PDA fills in your API key automatically.
- **Tampermonkey:** open the link in your browser and press Install. Enter your API key in the 🏥 panel.

When the script changes, raise `@version` — then PDA's **Check for Update** / Tampermonkey picks it up.

## What's inside

### 1. Fair Fight (every page)
- FF (Fair Fight) badge next to player names on any Torn page (faction, war, hospital, bounties, …).
- On a player's profile: a big "Fair Fight: 2.70 · est. stats 1.2b" line at the top.
- Data from [FFScouter](https://ffscouter.com) — register your API key there once, or badges show `?`.

- 🎯 **Target finder** (green button): finds a player in your FF range (default 2.0–3.0, inactive only) who is out of hospital/jail/travel, with an ⚔️ Attack button. **Next ▶** gives another one. You press attack yourself.

### 2. Enemy hospital timer (faction and war pages)
- Hospital countdowns in the Status column.
- 🌍 **Where are they?** "Abroad" / "Traveling" in the Status column becomes the country with its flag: `🇯🇵 JPN`, `✈ 🇲🇽 MEX` (flying there), `🇦🇪 ✈ Torn` (flying home). Hospital abroad shows the flag before the timer.
- 🏥 panel: sort by time or FF, "≤5 min" filter, ⚔️ attack link, and a 🔔 alert 20s before an enemy leaves hospital.

### 3. Stock fill (company Stock page)
- **Fill stock** button fills each order box with that item's share of free storage, by daily sales.
- It never orders anything — you check the numbers and press Torn's order button yourself.

### 4. Chain + energy alerts (every page)
- ⛓️ **Chain alert:** beeps when your faction chain timer drops to 60s and again at 30s (chains of 10+).
- ⚡ **Energy full alert:** beeps once when your energy bar is full.
- Turn all alerts on/off with the 🔔 button in the 🏥 panel. Alerts only work while Torn is open.

### 5. Item Market price helper (Item Market / Bazaar add pages)
- A green **−$1** button next to each price box. Tap it → fills in $1 below the cheapest Item Market listing and shows the lowest price.
- It only types the price — you check it and press Torn's list/add button yourself.

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

### 1. Enemy hospital timer + FF (faction and war pages)
- Hospital countdowns in the Status column.
- FF (Fair Fight) badges from [FFScouter](https://ffscouter.com) — register your API key there once, or badges show `?`.
- 🏥 panel: sort by time or FF, "≤5 min" filter, ⚔️ attack link, and a 🔔 alert 20s before an enemy leaves hospital.

### 2. Stock fill (company Stock page)
- **Fill stock** button fills each order box with that item's share of free storage, by daily sales.
- It never orders anything — you check the numbers and press Torn's order button yourself.

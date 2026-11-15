# nova-torn-helper

Userscripts for [Torn City](https://www.torn.com), usable in **Torn PDA** and **Tampermonkey**.

## Scripts

### Enemy Hospital Timer + FF

Hospital countdowns in the faction/war Status column, FF (Fair Fight) badges from FFScouter, and a 🏥 panel. Read-only.

**Raw link (use this in Torn PDA / Tampermonkey):**

```
https://raw.githubusercontent.com/etherhtun/nova-torn-helper/main/scripts/enemy-hospital-timer.user.js
```

#### Torn PDA

1. Settings → **Userscripts** → **+** (add).
2. Choose **Remote / URL** and paste the raw link above.
3. Injection time: **End**. Save, then reload Torn.
4. PDA fills in your API key automatically (`###PDA-APIKEY###`).

#### Tampermonkey (desktop)

Open the raw link in your browser — Tampermonkey offers to install it. Enter your API key in the 🏥 panel.

#### FF badges

FF values come from [FFScouter](https://ffscouter.com). Register your API key there once, or the badges show `?`.

### Nova Stock Fill

Adds a **Fill stock** button to your company's Stock page. It fills each order box with that item's share of your free storage, based on daily sales (split evenly if nothing has sold yet). It never orders anything — you check the numbers and press Torn's order button yourself.

**Raw link:**

```
https://raw.githubusercontent.com/etherhtun/nova-torn-helper/main/scripts/stock-fill.user.js
```

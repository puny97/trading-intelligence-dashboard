# ⚡ NSE Volume Buzzer — Live Dashboard

A Next.js dashboard that tracks **Volume Buzzers** and **Rapid Movers** in the Indian stock market (NSE).

## Features

- 🔊 **Volume Buzzers** — stocks with volume 2.5× or more above average
- ⚡ **Rapid Movers** — stocks moving fastest in price with speed indicator
- 📈 **Top Gainers** — biggest % gainers of the day
- 📉 **Top Losers** — biggest % losers
- 🔔 **Live Alert Feed** — auto-generated alerts for volume spikes & rapid moves
- 📊 **Index Strip** — Nifty 50, Bank Nifty, Nifty IT, Nifty Mid 50, VIX
- ✅ **IST clock + Market open/closed indicator**
- 🔄 **Auto-refreshes every 30 seconds**

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher
- npm (comes with Node.js)

### Setup

```bash
# 1. Go into the project folder
cd nse-volume-dashboard

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

Then open your browser at: **http://localhost:3000**

### Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
nse-volume-dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx       # Root layout + metadata
│   │   ├── page.tsx         # Entry page
│   │   └── globals.css      # All styles
│   ├── components/
│   │   ├── Dashboard.tsx    # Main client component (state + timers)
│   │   ├── IndexStrip.tsx   # Nifty/VIX index cards
│   │   ├── AlertFeed.tsx    # Live alert feed
│   │   ├── VolumeBuzzers.tsx
│   │   ├── RapidMovers.tsx
│   │   └── GainersLosers.tsx
│   └── lib/
│       └── marketData.ts    # All data types, simulation logic, helpers
├── package.json
├── next.config.js
└── tsconfig.json
```

## Disclaimer

> This dashboard uses simulated market data based on real NSE stock patterns — for **educational and paper-trading practice only**. It is NOT real-time data and NOT financial advice. For actual live data, use [NSEIndia.com](https://nseindia.com), [Screener.in](https://screener.in), [TradingView](https://tradingview.com), or [StockeZee](https://stockezee.com).

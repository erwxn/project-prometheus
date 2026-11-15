const fs = require('node:fs');
const path = require('node:path');

/** Loads optional ignored Gold settings locally without overriding deployment variables. */
function loadGoldLocal(env = process.env) {
  if (env.VERCEL || env.NODE_ENV === 'production') return;
  const filename = path.join(__dirname, '.env.gold.local');
  if (!fs.existsSync(filename)) return;
  const values = require('dotenv').parse(fs.readFileSync(filename));
  for (const [key, value] of Object.entries(values)) if (/^PROMETHEUS_GOLD_[A-Z_]+$/.test(key) && env[key] === undefined) env[key] = value;
}

module.exports = { loadGoldLocal };

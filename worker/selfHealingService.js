const API_URL = process.env.API_URL || "https://lawstudentsunionapi.onrender.com";
const INTERVAL_MS = Number(process.env.HEALTH_INTERVAL_MS || 60000);

async function check() {
  try {
    const res = await fetch(API_URL + "/api/health");
    const text = await res.text();
    if (!res.ok) console.error("[agent] API health failed", res.status, text.slice(0,300));
    else console.log("[agent] API healthy", new Date().toISOString());
  } catch (err) {
    console.error("[agent] health check error:", err.message);
  }
}
console.log("[agent] self-healing monitor started");
await check();
setInterval(check, INTERVAL_MS);

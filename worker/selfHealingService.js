import http from "node:http";

const API_URL = process.env.API_URL || "https://lawstudentsunionapi.onrender.com";
const INTERVAL_MS = Number(process.env.HEALTH_INTERVAL_MS || 60000);
const PORT = Number(process.env.PORT || process.env.WORKER_PORT || 10000);

let lastCheck = { ok: false, at: null, status: null, message: "not checked yet" };

async function check() {
  try {
    const res = await fetch(API_URL + "/api/health");
    const body = await res.text();
    lastCheck = {
      ok: res.ok,
      at: new Date().toISOString(),
      status: res.status,
      message: body.slice(0, 500)
    };
    if (!res.ok) console.error("[agent] API health failed", res.status, body.slice(0, 300));
    else console.log("[agent] API healthy", lastCheck.at);
  } catch (err) {
    lastCheck = {
      ok: false,
      at: new Date().toISOString(),
      status: null,
      message: err.message
    };
    console.error("[agent] health check error", err.message);
  }
}

const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    const payload = {
      ok: true,
      service: "Law Students Union Self-Healing Agent",
      monitor: lastCheck,
      intervalMs: INTERVAL_MS,
      timestamp: new Date().toISOString()
    };
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(payload));
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false, message: "Not found." }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("[agent] self-healing monitor started", {
    api: API_URL,
    intervalMs: INTERVAL_MS,
    port: PORT
  });
});

await check();
setInterval(check, INTERVAL_MS).unref();

function shutdown() {
  server.close(() => process.exit(0));
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

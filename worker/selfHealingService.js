const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 10000;
const GITHUB_REPO = process.env.GITHUB_REPO || "ftwir/LawStudentsUnion";
const GITHUB_REF = process.env.GITHUB_REF || "main";
const EXECUTOR_URL = String(process.env.GEMINI_EXECUTOR_URL || "").replace(/\/$/, "");
const AGENT_CHANNEL_SECRET = process.env.AGENT_CHANNEL_SECRET || "";

const recentEvents = new Map();

function safeText(value, max = 12000) {
  return String(value || "").slice(0, max);
}

function signPayload(body) {
  return crypto.createHmac("sha256", AGENT_CHANNEL_SECRET).update(body).digest("hex");
}

async function sendToGeminiExecutor(payload) {
  if (!EXECUTOR_URL || !AGENT_CHANNEL_SECRET) {
    throw new Error("Gemini executor channel is not configured");
  }
  const body = JSON.stringify(payload);
  const response = await fetch(EXECUTOR_URL + "/internal/agent/execute", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Accept":"application/json",
      "X-Agent-Signature":signPayload(body)
    },
    body
  });
  const data = await response.json().catch(()=>({ok:false,message:"Executor returned invalid JSON"}));
  if (!response.ok) throw new Error(data.message || "Gemini executor rejected the repair");
  return data;
}

app.get("/health", (req, res) => res.json({
  ok:true,
  service:"self-healing-agent",
  mode:"monitor-to-gemini-executor",
  repository:GITHUB_REPO,
  ref:GITHUB_REF,
  executorConfigured:Boolean(EXECUTOR_URL && AGENT_CHANNEL_SECRET),
  timestamp:new Date().toISOString()
}));

app.post("/internal/heal", async (req, res) => {
  const { error, filePath, context } = req.body || {};
  if (!error || !filePath) return res.status(400).json({ok:false,message:"error and filePath are required"});
  if (!/^(backend|public|packages\/manager-app)\//.test(filePath)) {
    return res.status(400).json({ok:false,message:"filePath is outside the allowed application tree"});
  }

  const fingerprint = crypto.createHash("sha256")
    .update(filePath + "\n" + safeText(error, 4000))
    .digest("hex");

  const last = recentEvents.get(fingerprint) || 0;
  if (Date.now() - last < 60000) {
    return res.status(202).json({ok:true,queued:false,deduplicated:true});
  }
  recentEvents.set(fingerprint, Date.now());

  try {
    const result = await sendToGeminiExecutor({
      type:"runtime-error",
      source:"self-healing-monitor",
      error:safeText(error),
      filePath,
      context:{
        ...(context || {}),
        detectedAt:new Date().toISOString(),
        repository:GITHUB_REPO,
        branch:GITHUB_REF
      }
    });

    console.log(JSON.stringify({
      type:"monitor-dispatched-to-gemini",
      filePath,
      commitSha:result.commitSha || null,
      at:new Date().toISOString()
    }));

    return res.status(202).json({
      ok:true,
      queued:true,
      executor:"gemini",
      filePath,
      result
    });
  } catch (agentError) {
    console.error("Monitor dispatch failed:", agentError);
    return res.status(502).json({ok:false,message:agentError.message});
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Self-healing monitor listening on " + PORT);
});

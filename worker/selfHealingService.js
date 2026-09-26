const express = require("express");
const { Octokit } = require("@octokit/rest");

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 10000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || "ftwir/LawStudentsUnion";
const GITHUB_REF = process.env.GITHUB_REF || "main";

function safeText(value, max = 12000) {
  return String(value || "").slice(0, max);
}

function parseRepo(repo) {
  const parts = String(repo).split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("GITHUB_REPO must be owner/repository");
  }
  return { owner: parts[0], repo: parts[1] };
}

async function readGithubFile(filePath) {
  if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is not configured");
  const { owner, repo } = parseRepo(GITHUB_REPO);
  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  const response = await octokit.rest.repos.getContent({
    owner, repo, path: filePath, ref: GITHUB_REF
  });
  if (Array.isArray(response.data) || !response.data.content) {
    throw new Error("GitHub path is not a file");
  }
  return Buffer.from(response.data.content, response.data.encoding || "base64").toString("utf8");
}

async function askOpenAI({ error, filePath, source }) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

  const prompt = [
    "You are the code-repair analyst for the Law Students Union project.",
    "Analyze the runtime error and the affected backend file.",
    "Do not claim that you changed GitHub. Return a review-ready diagnosis and a proposed minimal patch.",
    "Preserve existing behavior and avoid unrelated refactors.",
    "",
    "Repository: " + GITHUB_REPO,
    "Branch: " + GITHUB_REF,
    "Affected file: " + filePath,
    "",
    "Runtime error:",
    safeText(error),
    "",
    "Current file:",
    safeText(source, 50000),
    "",
    "Return JSON with keys: diagnosis, root_cause, patch_strategy, replacement_code, tests.",
    "replacement_code must contain only the proposed complete replacement content for the affected file."
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + OPENAI_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: OPENAI_MODEL, input: prompt })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error("OpenAI API error " + response.status + ": " + body.slice(0, 2000));
  }

  const data = await response.json();
  const outputText =
    data.output_text ||
    (Array.isArray(data.output)
      ? data.output.flatMap(item => Array.isArray(item.content) ? item.content : [])
          .map(item => item.text || "").join("\n")
      : "");

  if (!outputText) throw new Error("OpenAI returned no text output");
  return outputText;
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "self-healing-agent",
    mode: "openai-review-only",
    model: OPENAI_MODEL,
    openaiConfigured: Boolean(OPENAI_API_KEY),
    githubConfigured: Boolean(GITHUB_TOKEN)
  });
});

app.post("/internal/heal", async (req, res) => {
  const { error, filePath } = req.body || {};
  if (!error || !filePath) {
    return res.status(400).json({ ok: false, message: "error and filePath are required" });
  }
  if (!/^backend\//.test(filePath)) {
    return res.status(400).json({ ok: false, message: "filePath must target backend/" });
  }

  try {
    const source = await readGithubFile(filePath);
    const analysis = await askOpenAI({ error, filePath, source });
    console.log(JSON.stringify({
      type: "self-heal-analysis",
      provider: "openai",
      model: OPENAI_MODEL,
      filePath,
      analysis,
      receivedAt: new Date().toISOString()
    }));
    return res.status(202).json({
      ok: true, queued: true, mode: "openai-review-only",
      provider: "openai", model: OPENAI_MODEL, analysis
    });
  } catch (agentError) {
    console.error("Self-healing analysis failed:", agentError);
    return res.status(502).json({ ok: false, message: agentError.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Self-healing agent listening on " + PORT);
});

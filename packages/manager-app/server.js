const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { GoogleGenAI } = require("@google/genai");
const { Octokit } = require("@octokit/rest");

const app = express();
const PORT = process.env.PORT || 10000;
const STUDENT_API_URL = String(process.env.STUDENT_API_URL || "").replace(/\/$/, "");
const GITHUB_REPO = process.env.GITHUB_REPO || "ftwir/LawStudentsUnion";
const GITHUB_REF = process.env.GITHUB_REF || "main";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const AGENT_CHANNEL_SECRET = process.env.AGENT_CHANNEL_SECRET || "";
const MONITOR_AGENT_URL = String(process.env.MONITOR_AGENT_URL || "").replace(/\/$/, "");

app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    next();
});
app.use(express.static(path.join(__dirname, "public")));

function safeEqual(a, b) {
    if (typeof a !== "string" || typeof b !== "string") return false;
    const aa = Buffer.from(a);
    const bb = Buffer.from(b);
    return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function signPayload(body) {
    return crypto.createHmac("sha256", AGENT_CHANNEL_SECRET).update(body).digest("hex");
}

function verifyAgentRequest(req) {
    if (!AGENT_CHANNEL_SECRET) return false;
    const supplied = String(req.headers["x-agent-signature"] || "");
    const raw = JSON.stringify(req.body || {});
    return safeEqual(supplied, signPayload(raw));
}

async function verifyOwnerSession(req) {
    const authorization = req.headers.authorization || "";
    if (!authorization.startsWith("Bearer ") || !STUDENT_API_URL) return false;
    const response = await fetch(STUDENT_API_URL + "/api/owner/status", {
        headers: { Authorization: authorization, Accept: "application/json" }
    });
    return response.ok;
}

async function managerAuth(req, res, next) {
    try {
        const passcode = process.env.OWNER_MASTER_PASSCODE;
        const supplied = req.headers["x-owner-master-passcode"];
        if (passcode && supplied && safeEqual(supplied, passcode)) return next();
        if (await verifyOwnerSession(req)) return next();
        return res.status(401).json({ ok: false, message: "Manager authentication required." });
    } catch (error) {
        console.error(error);
        return res.status(401).json({ ok:false, message:"Manager authentication required." });
    }
}

async function readGithubFile(filePath) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN is not configured");
    const [owner, repo] = GITHUB_REPO.split("/");
    if (!owner || !repo) throw new Error("Invalid GITHUB_REPO");
    const octokit = new Octokit({ auth: token });
    const result = await octokit.rest.repos.getContent({ owner, repo, path:filePath, ref:GITHUB_REF });
    if (Array.isArray(result.data) || !result.data.content) throw new Error("GitHub path is not a file");
    return {
        sha: result.data.sha,
        content: Buffer.from(result.data.content, result.data.encoding || "base64").toString("utf8")
    };
}

function extractJson(text) {
    const cleaned = String(text || "").replace(/^\s*\`\`\`json\s*/i, "").replace(/\s*\`\`\`\s*$/i, "").trim();
    try { return JSON.parse(cleaned); } catch {}
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Gemini did not return valid JSON");
}

async function executeGeminiRepair({ error, filePath, source, context }) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

    const ai = new GoogleGenAI({ apiKey });
    const prompt = [
        "You are the execution agent for the Law Students Union repository.",
        "A monitoring agent detected a runtime error. Produce the smallest safe repair.",
        "You are authorized to edit only the supplied file.",
        "Preserve existing behavior. Do not invent credentials, secrets, dependencies, or unrelated refactors.",
        "Return JSON only with: diagnosis, root_cause, replacement_code, tests.",
        "replacement_code must be the COMPLETE replacement content of the supplied file, with no markdown fences.",
        "",
        "Repository: " + GITHUB_REPO,
        "Branch: " + GITHUB_REF,
        "File: " + filePath,
        "Runtime error: " + String(error || "").slice(0, 12000),
        "Monitor context: " + JSON.stringify(context || {}).slice(0, 12000),
        "",
        "CURRENT FILE:",
        source.slice(0, 80000)
    ].join("\n");

    const response = await ai.models.generateContent({ model: GEMINI_MODEL, contents: prompt });
    return extractJson(response.text);
}

async function commitGithubFile(filePath, source, replacement, sha, message) {
    if (!replacement || typeof replacement !== "string") throw new Error("Gemini returned no replacement code");
    const ext = path.extname(filePath).toLowerCase();
    if ([".js",".mjs",".cjs"].includes(ext)) {
        new Function(replacement);
    }
    const token = process.env.GITHUB_TOKEN;
    const [owner, repo] = GITHUB_REPO.split("/");
    const octokit = new Octokit({ auth: token });
    const result = await octokit.rest.repos.createOrUpdateFileContents({
        owner, repo, path:filePath, message, content:Buffer.from(replacement,"utf8").toString("base64"),
        sha, branch:GITHUB_REF
    });
    return result.data.commit.sha;
}

// Shared owner identity: the ACM never stores a second owner password.
// /api/manager/login always delegates authentication to the main API.
app.post("/api/manager/login", async (req, res) => {
    try {
        if (!STUDENT_API_URL) return res.status(503).json({ok:false,message:"STUDENT_API_URL is not configured."});
        const identifier = String(req.body?.identifier || "").trim();
        const password = String(req.body?.password || "");
        if (!identifier || !password) return res.status(400).json({ok:false,message:"Identifier and password are required."});

        const response = await fetch(STUDENT_API_URL + "/api/auth/login", {
            method:"POST", headers:{"Content-Type":"application/json","Accept":"application/json"},
            body:JSON.stringify({identifier,password})
        });
        const data = await response.json().catch(()=>({ok:false,message:"Student API returned an invalid response."}));
        if (!response.ok || !data.ok || !data.token) return res.status(response.status || 401).json({ok:false,message:data.message || "Invalid login credentials."});
        if (data.user?.role !== "owner") return res.status(403).json({ok:false,message:"This account is not an owner account."});

        res.json({ok:true,token:data.token,user:{id:data.user.id,full_name:data.user.full_name,role:data.user.role}});
    } catch(error) {
        console.error(error);
        res.status(502).json({ok:false,message:"Could not reach Student API."});
    }
});

app.get("/health", (req, res) => res.json({
    ok:true, service:"ACM Manager", sharedAuth:Boolean(STUDENT_API_URL),
    geminiConfigured:Boolean(process.env.GEMINI_API_KEY),
    githubConfigured:Boolean(process.env.GITHUB_TOKEN),
    monitorChannelConfigured:Boolean(AGENT_CHANNEL_SECRET && MONITOR_AGENT_URL),
    timestamp:new Date().toISOString()
}));

// Hidden, HMAC-authenticated monitor -> Gemini execution channel.
app.post("/internal/agent/execute", async (req, res) => {
    if (!verifyAgentRequest(req)) return res.status(401).json({ok:false,message:"Invalid agent signature."});
    const { error, filePath, context } = req.body || {};
    if (!error || !filePath) return res.status(400).json({ok:false,message:"error and filePath are required"});
    if (!/^(backend|public|packages\/manager-app)\//.test(filePath)) {
        return res.status(400).json({ok:false,message:"filePath is outside the allowed application tree"});
    }
    try {
        const current = await readGithubFile(filePath);
        const analysis = await executeGeminiRepair({error,filePath,source:current.content,context});
        const commitSha = await commitGithubFile(
            filePath, current.content, analysis.replacement_code, current.sha,
            "AI repair: " + filePath
        );
        console.log(JSON.stringify({type:"gemini-repair",filePath,commitSha,rootCause:analysis.root_cause}));
        res.json({ok:true,provider:"gemini",model:GEMINI_MODEL,filePath,commitSha,analysis});
    } catch (error) {
        console.error("Gemini executor failed:", error);
        res.status(502).json({ok:false,message:error.message});
    }
});

app.get("/api/manager/github", managerAuth, async (req, res) => {
    try {
        const token = process.env.GITHUB_TOKEN;
        if (!token) return res.status(503).json({ ok:false, message:"GITHUB_TOKEN is not configured." });
        const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits/${encodeURIComponent(GITHUB_REF)}`, {
            headers:{Accept:"application/vnd.github+json",Authorization:`Bearer ${token}`,"X-GitHub-Api-Version":"2022-11-28"}
        });
        const data = await response.json();
        if (!response.ok) return res.status(response.status).json({ok:false,message:data.message || "GitHub request failed."});
        res.json({ok:true,repository:GITHUB_REPO,ref:GITHUB_REF,commit:{sha:data.sha,message:data.commit?.message,date:data.commit?.committer?.date}});
    } catch (error) { console.error(error); res.status(500).json({ok:false,message:"Could not reach GitHub."}); }
});

app.get("/api/manager/owner-status", managerAuth, async (req, res) => {
    if (!STUDENT_API_URL) return res.status(503).json({ok:false,message:"STUDENT_API_URL is not configured."});
    try {
        const response = await fetch(`${STUDENT_API_URL}/api/owner/status`, {headers:{Authorization:req.headers.authorization || "",Accept:"application/json"}});
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) { console.error(error); res.status(502).json({ok:false,message:"Could not reach Student API owner endpoint."}); }
});

app.get("/api/manager/config", managerAuth, (req, res) => res.json({
    ok:true,repository:GITHUB_REPO,ref:GITHUB_REF,studentApiConfigured:Boolean(STUDENT_API_URL),
    githubConfigured:Boolean(process.env.GITHUB_TOKEN),aiProvider:"gemini",
    aiConfigured:Boolean(process.env.GEMINI_API_KEY),monitorChannelConfigured:Boolean(AGENT_CHANNEL_SECRET && MONITOR_AGENT_URL)
}));

app.get("*", (req,res) => res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT, "0.0.0.0", () => console.log(`ACM Manager running on port ${PORT}`));

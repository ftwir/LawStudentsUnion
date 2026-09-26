const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;
const STUDENT_API_URL = String(process.env.STUDENT_API_URL || "").replace(/\/$/, "");
const GITHUB_REPO = process.env.GITHUB_REPO || "ftwir/LawStudentsUnion";
const GITHUB_REF = process.env.GITHUB_REF || "main";

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => { res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate"); res.setHeader("Pragma", "no-cache"); next(); });
app.use(express.static(path.join(__dirname, "public")));

function safeEqual(a, b) {
    if (typeof a !== "string" || typeof b !== "string") return false;
    const aa = Buffer.from(a);
    const bb = Buffer.from(b);
    return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

async function verifyOwnerSession(req) {
    const authorization = req.headers.authorization || "";
    if (!authorization.startsWith("Bearer ")) return false;
    if (!STUDENT_API_URL) return false;

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

        return res.status(401).json({
            ok: false,
            message: "Manager authentication required."
        });
    } catch (error) {
        console.error(error);
        return res.status(401).json({ ok:false, message:"Manager authentication required." });
    }
}

app.post("/api/manager/login", async (req, res) => {
    try {
        if (!STUDENT_API_URL) return res.status(503).json({ok:false,message:"STUDENT_API_URL is not configured."});
        const identifier = String(req.body?.identifier || "").trim();
        const password = String(req.body?.password || "");
        if (!identifier || !password) return res.status(400).json({ok:false,message:"Identifier and password are required."});

        const response = await fetch(STUDENT_API_URL + "/api/auth/login", {
            method:"POST",
            headers:{"Content-Type":"application/json","Accept":"application/json"},
            body:JSON.stringify({identifier,password})
        });
        const data = await response.json().catch(()=>({ok:false,message:"Student API returned an invalid response."}));

        if (!response.ok || !data.ok || !data.token) {
            return res.status(response.status || 401).json({ok:false,message:data.message || "Invalid login credentials."});
        }
        if (data.user?.role !== "owner") {
            return res.status(403).json({ok:false,message:"This account is not an owner account."});
        }

        res.json({
            ok:true,
            token:data.token,
            user:{
                id:data.user.id,
                full_name:data.user.full_name,
                role:data.user.role
            }
        });
    } catch(error) {
        console.error(error);
        res.status(502).json({ok:false,message:"Could not reach Student API."});
    }
}

app.get("/health", (req, res) => {
    res.json({
        ok: true,
        service: "ACM Manager",
        repository: GITHUB_REPO,
        ref: GITHUB_REF,
        timestamp: new Date().toISOString()
    });
});

app.get("/api/manager/github", managerAuth, async (req, res) => {
    try {
        const token = process.env.GITHUB_TOKEN;
        if (!token) return res.status(503).json({ ok:false, message:"GITHUB_TOKEN is not configured." });

        const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits/${encodeURIComponent(GITHUB_REF)}`, {
            headers: {
                Accept: "application/vnd.github+json",
                Authorization: `Bearer ${token}`,
                "X-GitHub-Api-Version": "2022-11-28"
            }
        });
        const data = await response.json();
        if (!response.ok) return res.status(response.status).json({ ok:false, message:data.message || "GitHub request failed." });

        res.json({
            ok:true,
            repository:GITHUB_REPO,
            ref:GITHUB_REF,
            commit:{sha:data.sha, message:data.commit?.message, date:data.commit?.committer?.date}
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ok:false,message:"Could not reach GitHub."});
    }
});

app.get("/api/manager/owner-status", managerAuth, async (req, res) => {
    if (!STUDENT_API_URL) return res.status(503).json({ok:false,message:"STUDENT_API_URL is not configured."});

    try {
        const response = await fetch(`${STUDENT_API_URL}/api/owner/status`, {
            headers: { Authorization: req.headers.authorization || "", Accept: "application/json" }
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error(error);
        res.status(502).json({ok:false,message:"Could not reach Student API owner endpoint."});
    }
});

app.get("/api/manager/config", managerAuth, (req, res) => {
    res.json({
        ok:true,
        repository:GITHUB_REPO,
        ref:GITHUB_REF,
        studentApiConfigured:Boolean(STUDENT_API_URL),
        githubConfigured:Boolean(process.env.GITHUB_TOKEN),
        aiProvider:process.env.AI_PROVIDER || "none",
        aiConfigured:Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY)
    });
});

app.get("*", (req,res) => res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT, "0.0.0.0", () => {
    console.log(`ACM Manager running on port ${PORT}`);
});

const express = require("express");
const crypto = require("crypto");
const { GoogleGenAI } = require("@google/genai");
const { Octokit } = require("@octokit/rest");

function createOwnerRouter(pool) {
    const router = express.Router();
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    async function authenticateOwner(req, res, next) {
        try {
            const masterPasscode = process.env.OWNER_MASTER_PASSCODE;
            const providedPasscode = req.headers["x-owner-master-passcode"] || req.headers["x-owner-passcode"] || req.body?.passcode || req.query?.passcode;
            if (masterPasscode && providedPasscode === masterPasscode) return next();

            const authorization = req.headers.authorization || "";
            if (!authorization.startsWith("Bearer ")) return res.status(401).json({ ok:false, message:"Owner authentication required." });
            const token = authorization.slice(7).trim();
            if (!token) return res.status(401).json({ ok:false, message:"Owner authentication required." });

            const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
            const result = await pool.query(
                "SELECT u.id, u.role, u.is_active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.is_active=TRUE AND u.role='owner' LIMIT 1",
                [tokenHash]
            );
            if (!result.rows.length) return res.status(401).json({ ok:false, message:"Valid owner session required." });
            req.owner = result.rows[0];
            next();
        } catch (error) {
            console.error(error);
            res.status(500).json({ ok:false, message:"Owner authentication failed." });
        }
    }

    router.use(authenticateOwner);

    router.get("/status", async (req,res) => {
        try {
            const users = await pool.query("SELECT COUNT(*)::int AS count FROM users");
            const sessions = await pool.query("SELECT COUNT(*)::int AS count FROM sessions WHERE expires_at>NOW()");
            res.json({ ok:true, ownerId:req.owner?.id || null, database:"connected", metrics:{users:users.rows[0].count, activeSessions:sessions.rows[0].count} });
        } catch(error) {
            console.error(error);
            res.status(500).json({ ok:false, message:"Could not read owner status." });
        }
    });

    router.get("/users", async (req,res) => {
        try {
            const result = await pool.query("SELECT id,full_name,student_id,email,phone,role,is_active,last_login,created_at FROM users ORDER BY id DESC LIMIT 500");
            res.json({ok:true,users:result.rows});
        } catch(error) {
            console.error(error);
            res.status(500).json({ok:false,message:"Could not read users."});
        }
    });

    router.get("/audit", async (req,res) => {
        try {
            const result = await pool.query("SELECT * FROM audit_logs ORDER BY 1 DESC LIMIT 500");
            res.json({ok:true,events:result.rows});
        } catch(error) {
            res.json({ok:true,events:[]});
        }
    });

    router.post("/ai-execute", async (req,res) => {
        const {command,filePath}=req.body||{};
        if(!command||!filePath) return res.status(400).json({ok:false,error:"Command and filePath are required."});
        try {
            const {data:fileData}=await octokit.repos.getContent({owner:"ftwir",repo:"LawStudentsUnion",path:filePath,ref:"main"});
            if(Array.isArray(fileData)||!fileData.content) return res.status(400).json({ok:false,error:"Target is not a readable file."});
            const currentCode=Buffer.from(fileData.content,"base64").toString("utf8");
            const prompt="You are the Executive Owner AI Architect for Law Students Union.\nTarget File: "+filePath+"\nCurrent Code:\n"+currentCode+"\nOwner Command:\n"+command+"\nReturn ONLY valid code without markdown or explanation.";
            const response=await ai.models.generateContent({model:"gemini-2.5-pro",contents:prompt,config:{temperature:0.1}});
            let updatedCode=String(response.text||"").trim();
            updatedCode=updatedCode.replace(/^\`\`\`[a-zA-Z0-9_-]*\s*/,"").replace(/\s*\`\`\`$/,"");
            const commit=await octokit.repos.createOrUpdateFileContents({owner:"ftwir",repo:"LawStudentsUnion",path:filePath,message:"feat(acm-owner): "+String(command).slice(0,50),content:Buffer.from(updatedCode,"utf8").toString("base64"),sha:fileData.sha,branch:"main"});
            res.json({ok:true,status:"success",message:"تم تنفيذ التعديل بنجاح ورفعه على main.",filePath,commitSha:commit.data.commit.sha,commitUrl:commit.data.commit.html_url});
        } catch(error) {
            console.error(error);
            res.status(500).json({ok:false,error:error.message||"AI execution failed."});
        }
    });

    return router;
}

module.exports={createOwnerRouter};

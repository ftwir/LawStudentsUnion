const express = require("express");
const crypto = require("crypto");

function safeEqual(a, b) {
    const left = Buffer.from(String(a || ""));
    const right = Buffer.from(String(b || ""));
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

function createOwnerRouter(pool) {
    const router = express.Router();

    router.use((req, res, next) => {
        const expected = process.env.OWNER_MASTER_PASSCODE;
        const supplied = req.headers["x-owner-master-passcode"];

        if (!expected) {
            return res.status(503).json({
                ok: false,
                message: "OWNER_MASTER_PASSCODE is not configured."
            });
        }

        if (!safeEqual(supplied, expected)) {
            return res.status(401).json({
                ok: false,
                message: "Owner authentication required."
            });
        }

        next();
    });

    router.get("/status", async (req, res) => {
        try {
            const [users, sessions, audit] = await Promise.all([
                pool.query("SELECT COUNT(*)::int AS count FROM users"),
                pool.query("SELECT COUNT(*)::int AS count FROM sessions WHERE expires_at > NOW()"),
                pool.query("SELECT COUNT(*)::int AS count FROM audit_logs")
            ]);

            res.json({
                ok: true,
                service: "Law Students Union Owner API",
                owner: true,
                database: "connected",
                metrics: {
                    users: users.rows[0].count,
                    active_sessions: sessions.rows[0].count,
                    audit_events: audit.rows[0].count
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error("Owner status error:", error);
            res.status(500).json({
                ok: false,
                message: "Could not read owner status."
            });
        }
    });

    router.get("/users", async (req, res) => {
        try {
            const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
            const result = await pool.query(
                `SELECT id, full_name, student_id, email, phone, role, is_active, created_at, last_seen_at
                 FROM users
                 ORDER BY id DESC
                 LIMIT $1`,
                [limit]
            );
            res.json({ ok: true, users: result.rows });
        } catch (error) {
            console.error("Owner users error:", error);
            res.status(500).json({ ok: false, message: "Could not read users." });
        }
    });

    router.get("/audit", async (req, res) => {
        try {
            const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
            const result = await pool.query(
                `SELECT id, actor_user_id, action, target_type, target_id, details, created_at
                 FROM audit_logs
                 ORDER BY id DESC
                 LIMIT $1`,
                [limit]
            );
            res.json({ ok: true, audit: result.rows });
        } catch (error) {
            console.error("Owner audit error:", error);
            res.status(500).json({ ok: false, message: "Could not read audit logs." });
        }
    });

    return router;
}

module.exports = { createOwnerRouter };

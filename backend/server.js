const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const { createOwnerRouter } = require("./routes/ownerRoutes");

app.use(cors());
app.use(express.json({ limit: "12mb" }));

const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not configured.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false
});

app.use("/api/owner", createOwnerRouter(pool));

function hashPassword(password) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString("hex");

        crypto.scrypt(password, salt, 64, (error, derivedKey) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(`${salt}:${derivedKey.toString("hex")}`);
        });
    });
}

function verifyPassword(password, storedHash) {
    return new Promise((resolve, reject) => {
        const parts = storedHash.split(":");

        if (parts.length !== 2) {
            resolve(false);
            return;
        }

        const salt = parts[0];
        const storedKey = Buffer.from(parts[1], "hex");

        crypto.scrypt(password, salt, 64, (error, derivedKey) => {
            if (error) {
                reject(error);
                return;
            }

            if (storedKey.length !== derivedKey.length) {
                resolve(false);
                return;
            }

            resolve(
                crypto.timingSafeEqual(storedKey, derivedKey)
            );
        });
    });
}

function createSessionToken() {
    return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}

app.get("/", (req, res) => {
    res.json({
        ok: true,
        service: "Law Students Union API",
        status: "running"
    });
});

app.get("/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        res.json({
            ok: true,
            database: "connected"
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            ok: false,
            database: "disconnected"
        });
    }
});

app.get("/api/test", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT NOW() AS time"
        );

        res.json({
            ok: true,
            message: "API and database are working.",
            time: result.rows[0].time
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            ok: false,
            message: "Database connection failed."
        });
    }
});

app.post("/api/auth/register", async (req, res) => {
    try {
        const {
            full_name,
            student_id,
            email,
            password,
            phone,
            academic_year,
            bio
        } = req.body;

        if (!full_name || !student_id || !password) {
            return res.status(400).json({
                ok: false,
                message: "Full name, student ID and password are required."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                ok: false,
                message: "Password must contain at least 8 characters."
            });
        }

        const existingUser = await pool.query(
            `SELECT id
             FROM users
             WHERE student_id = $1
                OR ($2::text IS NOT NULL AND email = $2)
             LIMIT 1`,
            [student_id, email || null]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                ok: false,
                message: "A user with this student ID or email already exists."
            });
        }

        const passwordHash = await hashPassword(password);

        const result = await pool.query(
            `INSERT INTO users
                (full_name, student_id, email, phone, academic_year, bio, password_hash)
             VALUES
                ($1, $2, $3, $4, $5, $6, $7)
             RETURNING
                id, full_name, student_id, email, phone, academic_year, bio, role, is_active, created_at`,
            [
                full_name,
                student_id,
                email || null,
                phone || null,
                academic_year || null,
                bio || null,
                passwordHash
            ]
        );

        const createdUser = result.rows[0];
        await pool.query(
            `UPDATE users
             SET profile_slug = 'u-' || id,
                 last_seen_at = NOW()
             WHERE id = $1`,
            [createdUser.id]
        );

        res.status(201).json({
            ok: true,
            message: "Account created successfully.",
            user: {
                ...createdUser,
                profile_slug: `u-${createdUser.id}`,
                privacy_settings: {
                    show_email: false,
                    show_phone: false,
                    show_online: true
                }
            }
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            ok: false,
            message: "Could not create account."
        });
    }
});

app.post("/api/auth/login", async (req, res) => {
    try {
        const {
            identifier,
            password
        } = req.body;

        const normalizedIdentifier = String(identifier || "").trim();

        if (!normalizedIdentifier || !password) {
            return res.status(400).json({
                ok: false,
                message: "Identifier and password are required."
            });
        }

        const result = await pool.query(
            `SELECT
                id,
                full_name,
                student_id,
                email,
                phone,
                academic_year,
                bio,
                avatar_url,
                profile_background_url,
                profile_slug,
                privacy_settings,
                notification_settings,
                password_hash,
                role,
                is_active,
                last_seen_at
             FROM users
             WHERE TRIM(student_id) = $1
                OR LOWER(TRIM(COALESCE(email, ''))) = LOWER($1)
                OR regexp_replace(COALESCE(phone, ''), '[^0-9+]', '', 'g') = regexp_replace($1, '[^0-9+]', '', 'g')
             LIMIT 1`,
            [normalizedIdentifier]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                ok: false,
                message: "Invalid login credentials."
            });
        }

        const user = result.rows[0];

        if (!user.is_active) {
            return res.status(403).json({
                ok: false,
                message: "This account is disabled."
            });
        }

        const passwordCorrect = await verifyPassword(
            password,
            user.password_hash
        );

        if (!passwordCorrect) {
            return res.status(401).json({
                ok: false,
                message: "Invalid login credentials."
            });
        }

        const sessionToken = createSessionToken();
        const tokenHash = hashToken(sessionToken);

        await pool.query(
            `INSERT INTO sessions
                (user_id, token_hash, expires_at)
             VALUES
                ($1, $2, NOW() + INTERVAL '30 days')`,
            [user.id, tokenHash]
        );

        await pool.query(
            `UPDATE users
             SET last_login = NOW(),
                 last_seen_at = NOW(),
                 profile_slug = COALESCE(profile_slug, 'u-' || id)
             WHERE id = $1`,
            [user.id]
        );

        res.json({
            ok: true,
            message: "Login successful.",
            token: sessionToken,
            user: {
                id: user.id,
                full_name: user.full_name,
                student_id: user.student_id,
                email: user.email,
                phone: user.phone,
                academic_year: user.academic_year,
                bio: user.bio,
                avatar_url: user.avatar_url,
                profile_background_url: user.profile_background_url,
                profile_slug: user.profile_slug || `u-${user.id}`,
                privacy_settings: user.privacy_settings || {
                    show_email: false,
                    show_phone: false,
                    show_online: true
                },
                notification_settings: user.notification_settings || {
                    push: true,
                    announcements: true,
                    messages: true
                },
                role: user.role,
                is_active: user.is_active
            }
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            ok: false,
            message: "Login failed."
        });
    }
});app.post("/api/auth/logout", async (req, res) => {
    try {
        const authorization = req.headers.authorization || "";

        if (!authorization.startsWith("Bearer ")) {
            return res.json({
                ok: true,
                message: "Logged out."
            });
        }

        const token = authorization.substring(7);
        const tokenHash = hashToken(token);

        await pool.query(
            `UPDATE users
             SET last_seen_at = NULL
             WHERE id IN (
                SELECT user_id FROM sessions
                WHERE token_hash = $1
             )`,
            [tokenHash]
        );

        await pool.query(
            `DELETE FROM sessions
             WHERE token_hash = $1`,
            [tokenHash]
        );

        res.json({
            ok: true,
            message: "Logged out successfully."
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            ok: false,
            message: "Logout failed."
        });
    }
});function getBearerToken(req) {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
        return null;
    }

    return authorization.substring(7).trim() || null;
}

async function getAuthenticatedUser(req) {
    const token = getBearerToken(req);

    if (!token) {
        return null;
    }

    const tokenHash = hashToken(token);

    const result = await pool.query(
        `SELECT
            u.id,
            u.full_name,
            u.student_id,
            u.email,
            u.phone,
            u.academic_year,
            u.bio,
            u.avatar_url,
            u.profile_background_url,
            u.profile_slug,
            u.privacy_settings,
            u.notification_settings,
            u.role,
            u.is_active,
            u.last_seen_at,
            u.created_at,
            u.last_login
         FROM sessions s
         INNER JOIN users u
            ON u.id = s.user_id
         WHERE s.token_hash = $1
           AND s.expires_at > NOW()
           AND u.is_active = TRUE
         LIMIT 1`,
        [tokenHash]
    );

    return result.rows[0] || null;
}

function publicUser(user) {
    return {
        id: user.id,
        full_name: user.full_name,
        student_id: user.student_id,
        email: user.email,
        phone: user.phone,
        academic_year: user.academic_year,
        bio: user.bio,
        avatar_url: user.avatar_url,
        profile_background_url: user.profile_background_url,
        profile_slug: user.profile_slug || `u-${user.id}`,
        privacy_settings: user.privacy_settings || {
            show_email: false,
            show_phone: false,
            show_online: true
        },
        notification_settings: user.notification_settings || {
            push: true,
            announcements: true,
            messages: true
        },
        role: user.role,
        is_active: user.is_active,
        last_seen_at: user.last_seen_at,
        created_at: user.created_at,
        last_login: user.last_login
    };
}

app.get("/api/auth/me", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);

        if (!user) {
            return res.status(401).json({
                ok: false,
                message: "Authentication required."
            });
        }

        res.json({
            ok: true,
            user: publicUser(user)
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            ok: false,
            message: "Could not verify session."
        });
    }
});


function requireAuth(handler) {
    return async (req, res, next) => {
        try {
            const user = await getAuthenticatedUser(req);

            if (!user) {
                return res.status(401).json({
                    ok: false,
                    message: "Authentication required."
                });
            }

            req.user = user;
            return handler(req, res, next);
        } catch (error) {
            console.error(error);
            res.status(500).json({
                ok: false,
                message: "Authentication check failed."
            });
        }
    };
}

function requireRoles(...roles) {
    return requireAuth(async (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                ok: false,
                message: "You do not have permission to perform this action."
            });
        }
        next();
    });
}

function cleanProfileUser(user, viewer = null) {
    const privacy = user.privacy_settings || {};
    const isSelf = viewer && Number(viewer.id) === Number(user.id);

    // The Owner is a server-level identity. For everyone except the Owner,
    // the public application treats that account as an ordinary member.
    const isHiddenOwner = user.role === "owner" && !isSelf;

    const showEmail = !isHiddenOwner && (isSelf || privacy.show_email === true);
    const showPhone = !isHiddenOwner && (isSelf || privacy.show_phone === true);
    const showOnline = !isHiddenOwner && (isSelf || privacy.show_online !== false);
    const online = !!user.last_seen_at &&
        (Date.now() - new Date(user.last_seen_at).getTime()) <= 90000;

    return {
        id: user.id,
        full_name: isHiddenOwner ? "عضو الاتحاد" : user.full_name,
        student_id: isHiddenOwner ? null : user.student_id,
        email: showEmail ? user.email : null,
        phone: showPhone ? user.phone : null,
        academic_year: user.academic_year,
        bio: isHiddenOwner ? null : user.bio,
        avatar_url: user.avatar_url,
        profile_background_url: user.profile_background_url,
        profile_slug: user.profile_slug || `u-${user.id}`,
        role: isHiddenOwner ? "member" : user.role,
        is_active: user.is_active,
        online: showOnline ? online : false,
        show_online: showOnline,
        created_at: user.created_at
    };
}

app.get("/api/profile/:identifier", async (req, res) => {
    try {
        const viewer = await getAuthenticatedUser(req);
        const identifier = String(req.params.identifier || "");

        const result = await pool.query(
            `SELECT
                id, full_name, student_id, email, phone, academic_year,
                bio, avatar_url, profile_background_url, profile_slug,
                privacy_settings, role, is_active, last_seen_at, created_at
             FROM users
             WHERE id::text = $1 OR profile_slug = $1
             LIMIT 1`,
            [identifier]
        );

        if (result.rows.length === 0 || !result.rows[0].is_active) {
            return res.status(404).json({
                ok: false,
                message: "Profile not found."
            });
        }

        res.json({
            ok: true,
            user: cleanProfileUser(result.rows[0], viewer)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            message: "Could not load profile."
        });
    }
});

app.put("/api/profile", requireAuth(async (req, res) => {
    try {
        const {
            full_name,
            phone,
            academic_year,
            bio,
            email,
            avatar_url,
            cover_url,
            privacy_settings,
            notification_settings,
            password
        } = req.body;

        if (full_name !== undefined && (!String(full_name).trim() || String(full_name).length > 150)) {
            return res.status(400).json({
                ok: false,
                message: "Invalid full name."
            });
        }

        if (avatar_url !== undefined && avatar_url !== null) {
            if (typeof avatar_url !== "string" || avatar_url.length > 3000000) {
                return res.status(400).json({
                    ok: false,
                    message: "Profile image is too large."
                });
            }
            if (!avatar_url.startsWith("data:image/") && !avatar_url.startsWith("http://") && !avatar_url.startsWith("https://")) {
                return res.status(400).json({
                    ok: false,
                    message: "Invalid profile image."
                });
            }
        }

        if (cover_url !== undefined && cover_url !== null) {
            if (typeof cover_url !== "string" || cover_url.length > 3000000) {
                return res.status(400).json({
                    ok: false,
                    message: "Cover image is too large."
                });
            }
            if (!cover_url.startsWith("data:image/") && !cover_url.startsWith("http://") && !cover_url.startsWith("https://")) {
                return res.status(400).json({
                    ok: false,
                    message: "Invalid cover image."
                });
            }
        }

        if (email && !/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({
                ok: false,
                message: "Invalid email address."
            });
        }

        if (password !== undefined && password !== "" && password.length < 8) {
            return res.status(400).json({
                ok: false,
                message: "Password must contain at least 8 characters."
            });
        }

        const existingEmail = email
            ? await pool.query(
                `SELECT id FROM users WHERE email = $1 AND id <> $2 LIMIT 1`,
                [email, req.user.id]
            )
            : { rows: [] };

        if (existingEmail.rows.length) {
            return res.status(409).json({
                ok: false,
                message: "This email is already in use."
            });
        }

        const nextPrivacy = {
            show_email: privacy_settings?.show_email === true,
            show_phone: privacy_settings?.show_phone === true,
            show_online: privacy_settings?.show_online !== false
        };

        const nextNotifications = {
            push: notification_settings?.push !== false,
            announcements: notification_settings?.announcements !== false,
            messages: notification_settings?.messages !== false
        };

        const passwordHash = password
            ? await hashPassword(password)
            : null;

        await pool.query(
            `UPDATE users
             SET full_name = COALESCE($1, full_name),
                 phone = $2,
                 academic_year = $3,
                 bio = $4,
                 email = $5,
                 avatar_url = $6::text,
                 profile_background_url = CASE
                    WHEN $7::boolean THEN $8::text
                    ELSE profile_background_url
                 END,
                 privacy_settings = $9::jsonb,
                 notification_settings = $10::jsonb,
                 password_hash = COALESCE($11, password_hash),
                 profile_slug = COALESCE(profile_slug, 'u-' || id)
             WHERE id = $12`,
            [
                full_name !== undefined ? String(full_name).trim() : null,
                phone || null,
                academic_year || null,
                bio || null,
                email || null,
                avatar_url !== undefined ? avatar_url : req.user.avatar_url,
                cover_url !== undefined,
                cover_url !== undefined ? cover_url : null,
                JSON.stringify(nextPrivacy),
                JSON.stringify(nextNotifications),
                passwordHash,
                req.user.id
            ]
        );

        await pool.query(
            `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details)
             VALUES ($1, 'profile.updated', 'user', $1, $2::jsonb)`,
            [req.user.id, JSON.stringify({ avatar_changed: avatar_url !== undefined, cover_changed: cover_url !== undefined, password_changed: !!password })]
        );

        const updated = await getAuthenticatedUser(req);

        res.json({
            ok: true,
            message: "Profile updated successfully.",
            user: publicUser(updated)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            message: "Could not update profile."
        });
    }
}));

app.post("/api/presence/heartbeat", requireAuth(async (req, res) => {
    await pool.query(
        `UPDATE users SET last_seen_at = NOW(), current_page = $2 WHERE id = $1`,
        [req.user.id, String(req.body?.page || 'home').slice(0,80)]
    );

    res.json({ ok: true, online: true });
}));

app.get("/api/presence/online-hub", requireAuth(async (req,res) => {
    try {
        const result = await pool.query(
            `SELECT id, full_name, avatar_url, profile_slug, current_page, last_seen_at
             FROM users
             WHERE is_active = TRUE
               AND last_seen_at >= NOW() - INTERVAL '90 seconds'
             ORDER BY last_seen_at DESC, full_name ASC
             LIMIT 100`
        );
        res.json({ok:true, users:result.rows.map(u=>({...u,id:Number(u.id),online:true}))});
    } catch(error) {
        console.error(error);
        res.status(500).json({ok:false,message:"Could not load online hub."});
    }
}));

app.get("/api/presence/online-count", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT COUNT(*)::int AS count
             FROM users
             WHERE is_active = TRUE
               AND last_seen_at >= NOW() - INTERVAL '90 seconds'`
        );

        res.json({
            ok: true,
            count: result.rows[0].count
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            message: "Could not load online count."
        });
    }
});

app.get("/api/admin/users", requireRoles("admin", "owner"), async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, full_name, student_id, email, academic_year, role,
                    is_active, last_seen_at, created_at
             FROM users
             WHERE role <> 'owner'
             ORDER BY created_at DESC`
        );

        res.json({ ok: true, users: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            message: "Could not load users."
        });
    }
});

app.patch("/api/admin/users/:id/status", requireRoles("admin", "owner"), async (req, res) => {
    try {
        const targetId = Number(req.params.id);
        const isActive = req.body.is_active === true;

        if (!Number.isInteger(targetId)) {
            return res.status(400).json({ ok: false, message: "Invalid user ID." });
        }

        const target = await pool.query(
            `SELECT id, role FROM users WHERE id = $1 LIMIT 1`,
            [targetId]
        );

        if (!target.rows.length) {
            return res.status(404).json({ ok: false, message: "User not found." });
        }

        if (target.rows[0].role === "owner" && req.user.role !== "owner") {
            return res.status(403).json({
                ok: false,
                message: "Admins cannot change the Owner account."
            });
        }

        if (targetId === Number(req.user.id)) {
            return res.status(403).json({
                ok: false,
                message: "You cannot disable your own account."
            });
        }

        await pool.query(
            `UPDATE users SET is_active = $1 WHERE id = $2`,
            [isActive, targetId]
        );

        await pool.query(
            `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details)
             VALUES ($1, 'user.status_changed', 'user', $2, $3::jsonb)`,
            [req.user.id, targetId, JSON.stringify({ is_active: isActive })]
        );

        res.json({ ok: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not change user status." });
    }
});

app.patch("/api/owner/users/:id/role", requireRoles("owner"), async (req, res) => {
    try {
        const targetId = Number(req.params.id);
        const newRole = String(req.body.role || "");

        if (!Number.isInteger(targetId) || !["member", "admin"].includes(newRole)) {
            return res.status(400).json({
                ok: false,
                message: "Owner can assign only member or admin roles."
            });
        }

        if (targetId === Number(req.user.id)) {
            return res.status(403).json({
                ok: false,
                message: "The Owner role cannot be changed from here."
            });
        }

        const target = await pool.query(
            `SELECT id, role FROM users WHERE id = $1 LIMIT 1`,
            [targetId]
        );

        if (!target.rows.length) {
            return res.status(404).json({ ok: false, message: "User not found." });
        }

        if (target.rows[0].role === "owner") {
            return res.status(403).json({
                ok: false,
                message: "The unique Owner role cannot be reassigned."
            });
        }

        await pool.query(
            `UPDATE users SET role = $1 WHERE id = $2`,
            [newRole, targetId]
        );

        await pool.query(
            `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details)
             VALUES ($1, 'user.role_changed', 'user', $2, $3::jsonb)`,
            [req.user.id, targetId, JSON.stringify({ role: newRole })]
        );

        res.json({ ok: true, role: newRole });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not change user role." });
    }
});

app.get("/api/admin/audit-logs", requireRoles("admin", "owner"), async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT a.id, a.action, a.target_type, a.target_id, a.details,
                    a.created_at, u.full_name AS actor_name, u.role AS actor_role
             FROM audit_logs a
             LEFT JOIN users u ON u.id = a.actor_user_id
             ORDER BY a.created_at DESC
             LIMIT 200`
        );

        res.json({ ok: true, logs: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not load audit logs." });
    }
});


app.get("/api/notifications/settings", requireAuth(async (req, res) => {
    const settings = req.user.notification_settings || {};
    res.json({ ok: true, settings: {
        all_members: settings.all_members !== false,
        administration: settings.administration !== false,
        friends: settings.friends !== false,
        announcements: settings.announcements !== false,
        push: settings.push !== false,
        messages: settings.messages !== false
    }});
}));

app.put("/api/notifications/settings", requireAuth(async (req, res) => {
    const allowed = ["all_members","administration","friends","announcements","push","messages"];
    const current = req.user.notification_settings || {};
    const next = { ...current };
    for (const key of allowed) {
        if (typeof req.body[key] === "boolean") next[key] = req.body[key];
    }
    const result = await pool.query(
        "UPDATE users SET notification_settings = $1::jsonb WHERE id = $2 RETURNING notification_settings",
        [JSON.stringify(next), req.user.id]
    );
    res.json({ ok: true, settings: result.rows[0].notification_settings });
}));

app.get("/api/user-notifications", requireAuth(async (req, res) => {
    const settings = req.user.notification_settings || {};
    const rows = await pool.query(
        `SELECT n.*, u.full_name AS actor_name, u.avatar_url AS actor_avatar
         FROM user_notifications n
         LEFT JOIN users u ON u.id = n.actor_id
         WHERE n.recipient_id = $1
           AND (
             (n.source = 'member' AND $2::boolean)
             OR (n.source = 'admin' AND $3::boolean)
             OR (n.source = 'friend' AND $4::boolean)
             OR (n.source = 'announcement' AND $5::boolean)
           )
         ORDER BY n.created_at DESC LIMIT 100`,
        [req.user.id, settings.all_members !== false, settings.administration !== false, settings.friends !== false, settings.announcements !== false]
    );
    res.json({ ok: true, notifications: rows.rows });
}));

app.put("/api/app-settings", requireRoles("owner"), async (req, res) => {
    const entries = req.body && typeof req.body === "object" ? req.body : {};
    for (const [key, value] of Object.entries(entries)) {
        if (!/^[a-zA-Z0-9_.-]{1,120}$/.test(key)) continue;
        await pool.query(
            `INSERT INTO app_settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
            [key, JSON.stringify(value), req.user.id]
        );
    }
    res.json({ ok: true });
});


/* =========================
   MEMBERSHIP APPLICATIONS + CHAT API
========================= */
app.post("/api/membership/apply", async (req,res)=>{
    try{
        const fullName=String(req.body.full_name||"").trim(),studentId=String(req.body.student_id||"").trim(),phone=String(req.body.phone||"").trim(),academicYear=String(req.body.academic_year||"").trim();
        const email=String(req.body.email||"").trim()||null,note=String(req.body.note||"").trim()||null;
        if(!fullName||!studentId||!phone||!academicYear)return res.status(400).json({ok:false,message:"الاسم ورقم القيد والهاتف والسنة الدراسية مطلوبة."});
        const user=await pool.query("SELECT id FROM users WHERE student_id=$1 OR ($2::text IS NOT NULL AND email=$2) LIMIT 1",[studentId,email]);
        if(user.rows.length)return res.status(409).json({ok:false,message:"يوجد حساب مسجل بهذه البيانات. استخدم تسجيل الدخول."});
        const existing=await pool.query("SELECT id,status FROM registrations WHERE student_id=$1 AND status IN ('pending','approved') ORDER BY id DESC LIMIT 1",[studentId]);
        if(existing.rows.length)return res.status(409).json({ok:false,message:existing.rows[0].status==="approved"?"يوجد طلب مقبول بهذا الرقم. يمكنك تفعيل العضوية.":"يوجد طلب عضوية قيد المراجعة بهذا الرقم."});
        const result=await pool.query(`INSERT INTO registrations(full_name,student_id,academic_year,email,phone,note,status) VALUES($1,$2,$3,$4,$5,$6,'pending') RETURNING id,full_name,student_id,academic_year,email,phone,note,status,created_at`,[fullName,studentId,academicYear,email,phone,note]);
        res.status(201).json({ok:true,message:"تم تسجيل طلب العضوية بنجاح.",application:result.rows[0]});
    }catch(error){console.error(error);res.status(500).json({ok:false,message:"تعذر تسجيل طلب العضوية."});}
});

async function getChatMembership(conversationId,userId){
    const result=await pool.query(`SELECT cm.conversation_id,cm.user_id,cm.role,cm.is_muted,c.type,c.is_private,c.created_by,c.host_user_id,c.messaging_paused FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id WHERE cm.conversation_id=$1 AND cm.user_id=$2`,[conversationId,userId]);
    return result.rows[0]||null;
}
async function getChatSummary(conversationId,userId){
    const result=await pool.query(`SELECT c.id,c.name,c.description,c.cover_image_url,c.hashtags,c.type,c.is_private,c.created_by,c.host_user_id,c.messaging_paused,c.voice_room_active,c.created_at,
      COALESCE((SELECT m.body FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1),'') AS last_message,
      COALESCE((SELECT m.created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1),c.created_at) AS last_message_at,
      COALESCE((SELECT cm2.is_muted FROM conversation_members cm2 WHERE cm2.conversation_id=c.id AND cm2.user_id=$2),false) AS is_muted,
      COALESCE((SELECT json_agg(json_build_object('id',u.id,'full_name',u.full_name,'avatar_url',u.avatar_url,'profile_slug',u.profile_slug,'membership_role',cm3.role) ORDER BY u.id) FROM conversation_members cm3 JOIN users u ON u.id=cm3.user_id WHERE cm3.conversation_id=c.id),'[]'::json) AS members
      FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=$2 WHERE c.id=$1`,[conversationId,userId]);
    return result.rows[0]||null;
}
app.get("/api/chat/conversations",requireAuth(async(req,res)=>{
    const result=await pool.query(`SELECT c.id,c.name,c.description,c.cover_image_url,c.hashtags,c.type,c.is_private,c.created_by,c.host_user_id,c.messaging_paused,c.voice_room_active,c.created_at,
      COALESCE((SELECT m.body FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1),'') AS last_message,
      COALESCE((SELECT m.created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1),c.created_at) AS last_message_at,
      cm.is_muted,
      COALESCE((SELECT json_agg(json_build_object('id',u.id,'full_name',u.full_name,'avatar_url',u.avatar_url,'profile_slug',u.profile_slug,'membership_role',cm2.role) ORDER BY u.id) FROM conversation_members cm2 JOIN users u ON u.id=cm2.user_id WHERE cm2.conversation_id=c.id),'[]'::json) AS members
      FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=$1 ORDER BY last_message_at DESC,c.id DESC`,[req.user.id]);
    res.json({ok:true,conversations:result.rows});
}));
app.get("/api/chat/users",requireAuth(async(req,res)=>{
    const q=String(req.query.q||"").trim(),params=[req.user.id,q||null];
    const result=await pool.query(`SELECT u.id,u.full_name,u.student_id,u.avatar_url,u.profile_slug FROM users u WHERE u.id<>$1 AND u.is_active=TRUE AND (COALESCE($2,'')='' OR u.full_name ILIKE '%'||$2||'%' OR COALESCE(u.student_id,'') ILIKE '%'||$2||'%') ORDER BY u.full_name ASC LIMIT 50`,params);
    res.json({ok:true,users:result.rows});
}));
app.post("/api/chat/conversations",requireAuth(async(req,res)=>{
    const type=String(req.body.type||"direct").trim(),name=String(req.body.name||"").trim()||null,description=String(req.body.description||"").trim()||null;
    const hashtags=Array.isArray(req.body.hashtags)?req.body.hashtags.map(x=>String(x).replace(/^#/,"").trim()).filter(Boolean).slice(0,20):[],cover=String(req.body.cover_image_url||"").trim()||null;
    const memberIds=[...new Set((Array.isArray(req.body.member_ids)?req.body.member_ids:[]).map(Number).filter(Number.isInteger).filter(id=>id>0&&id!==Number(req.user.id)))];
    if(!["direct","group","public"].includes(type))return res.status(400).json({ok:false,message:"نوع الدردشة غير صالح."});
    if(type==="direct"&&memberIds.length!==1)return res.status(400).json({ok:false,message:"اختر عضواً واحداً للمحادثة الخاصة."});
    if(type!=="direct"&&!name)return res.status(400).json({ok:false,message:"اسم الدردشة مطلوب."});
    if(type==="group"&&memberIds.length<1)return res.status(400).json({ok:false,message:"اختر عضواً واحداً على الأقل."});
    if(type==="direct"){
        const existing=await pool.query(`SELECT c.id FROM conversations c JOIN conversation_members a ON a.conversation_id=c.id AND a.user_id=$1 JOIN conversation_members b ON b.conversation_id=c.id AND b.user_id=$2 WHERE c.type='direct' AND (SELECT COUNT(*) FROM conversation_members z WHERE z.conversation_id=c.id)=2 LIMIT 1`,[req.user.id,memberIds[0]]);
        if(existing.rows.length)return res.json({ok:true,conversation:await getChatSummary(existing.rows[0].id,req.user.id)});
    }
    const targetUsers=memberIds.length?await pool.query("SELECT id FROM users WHERE id=ANY($1::bigint[]) AND is_active=TRUE",[memberIds]):{rows:[]};
    if(targetUsers.rows.length!==memberIds.length)return res.status(400).json({ok:false,message:"أحد الأعضاء غير متاح."});
    const client=await pool.connect();
    try{
        await client.query("BEGIN");
        const created=await client.query(`INSERT INTO conversations(name,description,cover_image_url,hashtags,type,is_private,created_by,host_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[name,description,cover,hashtags,type,type!=="public",req.user.id,type==="direct"?null:req.user.id]);
        const id=created.rows[0].id;
        for(const uid of [Number(req.user.id),...memberIds])await client.query(`INSERT INTO conversation_members(conversation_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(conversation_id,user_id) DO NOTHING`,[id,uid,(type!=="direct"&&uid===Number(req.user.id))?"host":"member"]);
        await client.query("COMMIT");
        res.status(201).json({ok:true,conversation:await getChatSummary(id,req.user.id)});
    }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}));
app.get("/api/chat/conversations/:id/messages",requireAuth(async(req,res)=>{
    const id=Number(req.params.id),membership=await getChatMembership(id,req.user.id);
    if(!membership)return res.status(403).json({ok:false,message:"لست عضواً في هذه الدردشة."});
    const result=await pool.query(`SELECT m.id,m.body,m.image_url,m.audio_url,m.created_at,m.is_read,json_build_object('id',u.id,'full_name',u.full_name,'avatar_url',u.avatar_url,'profile_slug',u.profile_slug) AS sender FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=$1 ORDER BY m.created_at ASC,m.id ASC LIMIT 500`,[id]);
    await pool.query("UPDATE messages SET is_read=TRUE WHERE conversation_id=$1 AND sender_id<>$2",[id,req.user.id]);
    res.json({ok:true,messages:result.rows});
}));
app.post("/api/chat/conversations/:id/messages",requireAuth(async(req,res)=>{
    const id=Number(req.params.id),membership=await getChatMembership(id,req.user.id);
    if(!membership)return res.status(403).json({ok:false,message:"لست عضواً في هذه الدردشة."});
    if(membership.messaging_paused&&!["admin","owner"].includes(req.user.role))return res.status(403).json({ok:false,message:"الإرسال متوقف مؤقتاً في هذه الدردشة."});
    const body=String(req.body.body||"").trim(),imageUrl=String(req.body.image_url||"").trim()||null,audioUrl=String(req.body.audio_url||"").trim()||null;
    if(!body&&!imageUrl&&!audioUrl)return res.status(400).json({ok:false,message:"لا يمكن إرسال رسالة فارغة."});
    if(body.length>4000)return res.status(400).json({ok:false,message:"الرسالة طويلة جداً."});
    const result=await pool.query(`INSERT INTO messages(conversation_id,sender_id,body,image_url,audio_url) VALUES($1,$2,$3,$4,$5) RETURNING id,body,image_url,audio_url,created_at,is_read`,[id,req.user.id,body,imageUrl,audioUrl]);
    await pool.query("UPDATE conversation_members SET inbox_position_at=NOW() WHERE conversation_id=$1",[id]);
    res.status(201).json({ok:true,message:{...result.rows[0],sender:{id:req.user.id,full_name:req.user.full_name,avatar_url:req.user.avatar_url,profile_slug:req.user.profile_slug}}});
}));
app.patch("/api/chat/conversations/:id/mute",requireAuth(async(req,res)=>{
    const id=Number(req.params.id),membership=await getChatMembership(id,req.user.id);
    if(!membership)return res.status(403).json({ok:false,message:"لست عضواً في هذه الدردشة."});
    const muted=!!req.body.muted;await pool.query("UPDATE conversation_members SET is_muted=$1 WHERE conversation_id=$2 AND user_id=$3",[muted,id,req.user.id]);res.json({ok:true,is_muted:muted});
}));
app.delete("/api/chat/conversations/:id",requireAuth(async(req,res)=>{
    const id=Number(req.params.id),membership=await getChatMembership(id,req.user.id);
    if(!membership)return res.status(403).json({ok:false,message:"لست عضواً في هذه الدردشة."});
    if(!(req.user.role==="owner"||req.user.role==="admin"||membership.role==="host"||membership.type==="direct"))return res.status(403).json({ok:false,message:"لا تملك صلاحية حذف هذه الدردشة."});
    await pool.query("DELETE FROM conversations WHERE id=$1",[id]);res.json({ok:true});
}));
app.get("/api/chat/conversations/:id/details",requireAuth(async(req,res)=>{
    const id=Number(req.params.id),membership=await getChatMembership(id,req.user.id);
    if(!membership)return res.status(403).json({ok:false,message:"لست عضواً في هذه الدردشة."});
    res.json({ok:true,conversation:await getChatSummary(id,req.user.id)});
}));
app.patch("/api/chat/conversations/:id",requireAuth(async(req,res)=>{
    const id=Number(req.params.id),membership=await getChatMembership(id,req.user.id);
    if(!membership)return res.status(403).json({ok:false,message:"لست عضواً في هذه الدردشة."});
    if(!(req.user.role==="owner"||membership.role==="host"||membership.role==="cohost"))return res.status(403).json({ok:false,message:"لا تملك صلاحية تعديل الدردشة."});
    const fields=[],values=[];let n=1;
    for(const [key,value] of [["name",req.body.name],["description",req.body.description],["cover_image_url",req.body.cover_image_url]])if(value!==undefined){fields.push(key+"=$"+n++);values.push(value===null?null:String(value));}
    if(Array.isArray(req.body.hashtags)){fields.push("hashtags=$"+n++);values.push(req.body.hashtags.map(x=>String(x).replace(/^#/,"").trim()).filter(Boolean).slice(0,20));}
    if(!fields.length)return res.json({ok:true,conversation:await getChatSummary(id,req.user.id)});
    values.push(id);await pool.query("UPDATE conversations SET "+fields.join(", ")+" WHERE id=$"+n,values);res.json({ok:true,conversation:await getChatSummary(id,req.user.id)});
}));
app.patch("/api/chat/conversations/:id/pause",requireAuth(async(req,res)=>{
    const id=Number(req.params.id),membership=await getChatMembership(id,req.user.id);
    if(!membership)return res.status(403).json({ok:false,message:"لست عضواً في هذه الدردشة."});
    if(req.user.role!=="owner"&&membership.role!=="host"&&membership.role!=="cohost")return res.status(403).json({ok:false,message:"لا تملك صلاحية إيقاف الإرسال."});
    const paused=!!req.body.paused;await pool.query("UPDATE conversations SET messaging_paused=$1 WHERE id=$2",[paused,id]);res.json({ok:true,messaging_paused:paused});
}));
app.patch("/api/chat/conversations/:id/voice",requireAuth(async(req,res)=>{
    const id=Number(req.params.id),membership=await getChatMembership(id,req.user.id);
    if(!membership)return res.status(403).json({ok:false,message:"لست عضواً في هذه الدردشة."});
    if(req.user.role!=="owner"&&membership.role!=="host"&&membership.role!=="cohost")return res.status(403).json({ok:false,message:"لا تملك صلاحية إدارة غرفة الصوت."});
    const active=!!req.body.active;await pool.query("UPDATE conversations SET voice_room_active=$1 WHERE id=$2",[active,id]);res.json({ok:true,active});
}));
app.post("/api/chat/conversations/:id/cohosts",requireAuth(async(req,res)=>{
    const id=Number(req.params.id),target=Number(req.body.user_id),membership=await getChatMembership(id,req.user.id);
    if(!membership||membership.role!=="host")return res.status(403).json({ok:false,message:"صلاحية المضيف مطلوبة."});
    await pool.query("UPDATE conversation_members SET role='cohost' WHERE conversation_id=$1 AND user_id=$2",[id,target]);res.json({ok:true});
}));
app.delete("/api/chat/conversations/:id/cohosts/:userId",requireAuth(async(req,res)=>{
    const id=Number(req.params.id),target=Number(req.params.userId),membership=await getChatMembership(id,req.user.id);
    if(!membership||membership.role!=="host")return res.status(403).json({ok:false,message:"صلاحية المضيف مطلوبة."});
    await pool.query("UPDATE conversation_members SET role='member' WHERE conversation_id=$1 AND user_id=$2",[id,target]);res.json({ok:true});
}));
app.delete("/api/chat/conversations/:id/members/:userId",requireAuth(async(req,res)=>{
    const id=Number(req.params.id),target=Number(req.params.userId),membership=await getChatMembership(id,req.user.id),targetMembership=await getChatMembership(id,target);
    if(!membership||!["host","cohost"].includes(membership.role))return res.status(403).json({ok:false,message:"لا تملك صلاحية طرد الأعضاء."});
    if(target===Number(req.user.id)||targetMembership?.role==="host"||(membership.role==="cohost"&&targetMembership?.role==="cohost"))return res.status(403).json({ok:false,message:"لا يمكن تنفيذ هذا الإجراء."});
    await pool.query("DELETE FROM conversation_members WHERE conversation_id=$1 AND user_id=$2",[id,target]);res.json({ok:true});
}));
app.get("/api/app-settings", async (req, res) => {
    const result = await pool.query("SELECT key, value FROM app_settings ORDER BY key");
    const settings = {};
    for (const row of result.rows) settings[row.key] = row.value;
    res.json({ ok: true, settings });
});

require("./community")(app, pool, requireAuth, requireRoles, getAuthenticatedUser);
require("./social")(app, pool, requireAuth);



app.post("/api/polls", requireAuth(async (req,res)=>{
  try{
    const question=String(req.body.question||"").trim();
    const options=Array.isArray(req.body.options)?req.body.options.map(x=>String(x||"").trim()).filter(Boolean).slice(0,12):[];
    const hashtags=Array.isArray(req.body.hashtags)?req.body.hashtags.map(x=>String(x||"").replace(/^#/,"").trim()).filter(Boolean).slice(0,12):[];
    const duration=Number(req.body.duration_minutes);
    const durationMinutes=Number.isInteger(duration)&&duration>=5&&duration<=43200?duration:1440;
    const allowVoteChange=req.body.allow_vote_change!==false;
    const anonymous=req.body.anonymous===true;
    const visibility=["always","after_vote","after_close","never"].includes(String(req.body.results_visibility||"after_vote"))?String(req.body.results_visibility||"after_vote"):"after_vote";
    if(question.length<2||question.length>1000||options.length<2) return res.status(400).json({ok:false,message:"السؤال وخياران على الأقل مطلوبان."});
    if(options.some(x=>x.length>300)) return res.status(400).json({ok:false,message:"أحد خيارات التصويت طويل أكثر من المسموح."});
    const r=await pool.query(
      `INSERT INTO polls(author_id,question,options,hashtags,duration_minutes,closes_at,allow_vote_change,anonymous,results_visibility)
       VALUES($1,$2,$3::jsonb,$4,$5,NOW()+($5 * INTERVAL '1 minute'),$6,$7,$8)
       RETURNING id,question,options,hashtags,duration_minutes,closes_at,allow_vote_change,anonymous,results_visibility,created_at`,
      [req.user.id,question,JSON.stringify(options),hashtags,durationMinutes,allowVoteChange,anonymous,visibility]
    );
    await pool.query(
      `INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,details)
       VALUES($1,'poll.created','poll',$2,$3::jsonb)`,
      [req.user.id,r.rows[0].id,JSON.stringify({duration_minutes:durationMinutes,options_count:options.length,hashtags})]
    );
    res.status(201).json({ok:true,message:"تم نشر الاستفتاء بنجاح.",poll:{...r.rows[0],id:Number(r.rows[0].id)}});
  }catch(error){
    console.error(error);
    res.status(500).json({ok:false,message:"تعذر نشر الاستفتاء."});
  }
}));

app.get("/api/polls", async (req,res)=>{
  try{
    const viewer=await getAuthenticatedUser(req);
    const r=await pool.query(
      `SELECT p.id,p.question,p.options,p.hashtags,p.duration_minutes,p.closes_at,p.allow_vote_change,p.anonymous,p.results_visibility,p.created_at,
              u.id AS author_id,u.full_name AS author_name,u.avatar_url AS author_avatar,
              COALESCE((SELECT COUNT(*)::int FROM poll_votes v WHERE v.poll_id=p.id),0) AS total_votes,
              (SELECT v.option_index FROM poll_votes v WHERE v.poll_id=p.id AND v.user_id=$1 LIMIT 1) AS my_vote
       FROM polls p
       JOIN users u ON u.id=p.author_id
       ORDER BY p.created_at DESC
       LIMIT 100`,
      [viewer?.id||null]
    );
    const polls=[];
    for(const row of r.rows){
      const counts=await pool.query(`SELECT option_index,COUNT(*)::int AS count FROM poll_votes WHERE poll_id=$1 GROUP BY option_index ORDER BY option_index`,[row.id]);
      const total=Number(row.total_votes||0);
      const closed=row.closes_at ? new Date(row.closes_at).getTime()<=Date.now() : false;
      const canSeeResults=String(row.results_visibility)==="always" || closed || (String(row.results_visibility)==="after_vote" && row.my_vote!==null && row.my_vote!==undefined);
      polls.push({
        id:Number(row.id),question:row.question,options:row.options||[],hashtags:row.hashtags||[],duration_minutes:Number(row.duration_minutes||1440),
        closes_at:row.closes_at,allow_vote_change:row.allow_vote_change,anonymous:row.anonymous,results_visibility:row.results_visibility,created_at:row.created_at,
        author:{id:Number(row.author_id),full_name:row.author_name,avatar_url:row.author_avatar},
        total_votes:total,my_vote:row.my_vote===null||row.my_vote===undefined?null:Number(row.my_vote),closed,
        results:canSeeResults?counts.rows.map(x=>({option_index:Number(x.option_index),count:Number(x.count),percentage:total?Math.round(Number(x.count)*1000/total)/10:0})):null
      });
    }
    res.json({ok:true,polls});
  }catch(error){
    console.error(error);
    res.status(500).json({ok:false,message:"تعذر تحميل الاستفتاءات."});
  }
});

app.post("/api/polls/:id/vote", requireAuth(async (req,res)=>{
  try{
    const id=Number(req.params.id), option=Number(req.body.option_index);
    if(!Number.isInteger(id)||!Number.isInteger(option)) return res.status(400).json({ok:false,message:"تصويت غير صالح."});
    const p=await pool.query("SELECT * FROM polls WHERE id=$1",[id]);
    if(!p.rows.length) return res.status(404).json({ok:false,message:"الاستفتاء غير موجود."});
    const poll=p.rows[0];
    if(poll.closes_at && new Date(poll.closes_at).getTime()<=Date.now()) return res.status(409).json({ok:false,message:"انتهت مدة التصويت."});
    if(option<0||option>=poll.options.length) return res.status(400).json({ok:false,message:"الخيار غير موجود."});
    const existing=await pool.query("SELECT option_index FROM poll_votes WHERE poll_id=$1 AND user_id=$2",[id,req.user.id]);
    if(existing.rows.length && !poll.allow_vote_change) return res.status(409).json({ok:false,message:"لا يمكن تغيير التصويت في هذا الاستفتاء."});
    await pool.query(
      `INSERT INTO poll_votes(poll_id,user_id,option_index) VALUES($1,$2,$3)
       ON CONFLICT(poll_id,user_id) DO UPDATE SET option_index=EXCLUDED.option_index,created_at=NOW()`,
      [id,req.user.id,option]
    );
    res.json({ok:true,message:"تم تسجيل تصويتك."});
  }catch(error){
    console.error(error);
    res.status(500).json({ok:false,message:"تعذر تسجيل التصويت."});
  }
}));

app.patch("/api/user-notifications/:id/read", requireAuth(async (req,res)=>{
    const id=Number(req.params.id);
    if(!Number.isInteger(id)) return res.status(400).json({ok:false,message:"Invalid notification."});
    await pool.query("UPDATE user_notifications SET is_read=TRUE WHERE id=$1 AND recipient_id=$2",[id,req.user.id]);
    res.json({ok:true});
}));

app.post("/api/user-notifications/read-all", requireAuth(async (req,res)=>{
    await pool.query("UPDATE user_notifications SET is_read=TRUE WHERE recipient_id=$1",[req.user.id]);
    res.json({ok:true});
}));

app.post("/api/membership/activate", async (req,res)=>{
    try{
        const studentId=String(req.body.student_id||"").trim();
        const phone=String(req.body.phone||"").trim();
        const password=String(req.body.password||"");
        if(!studentId||!phone||password.length<8) return res.status(400).json({ok:false,message:"رقم القيد والهاتف وكلمة مرور من 8 أحرف مطلوبة."});
        const existing=await pool.query("SELECT id FROM users WHERE student_id=$1 LIMIT 1",[studentId]);
        if(existing.rows.length) return res.status(409).json({ok:false,message:"يوجد حساب مفعل بهذا الرقم. استخدم تسجيل الدخول."});
        const r=await pool.query("SELECT * FROM registrations WHERE student_id=$1 AND status='approved' ORDER BY id DESC LIMIT 1",[studentId]);
        if(!r.rows.length) return res.status(404).json({ok:false,message:"لم يتم العثور على عضوية مقبولة بهذا الرقم."});
        const a=r.rows[0];
        const cleanPhone=phone.replace(/[^0-9+]/g,"");
        const registeredPhone=String(a.phone||"").replace(/[^0-9+]/g,"");
        if(cleanPhone!==registeredPhone) return res.status(403).json({ok:false,message:"رقم الهاتف لا يطابق طلب العضوية المقبول."});
        const passwordHash=await hashPassword(password);
        const created=await pool.query(
          `INSERT INTO users(full_name,student_id,email,phone,academic_year,password_hash,role,is_active,profile_slug,last_seen_at)
           VALUES($1,$2,$3,$4,$5,$6,'member',TRUE,'u-'||nextval('users_id_seq'),NULL)
           RETURNING id,full_name,student_id,email,phone,academic_year,bio,avatar_url,profile_background_url,profile_slug,privacy_settings,notification_settings,role,is_active,created_at,last_login,last_seen_at`,
          [a.full_name,a.student_id,a.email||null,a.phone,a.academic_year,passwordHash]
        );
        const user=created.rows[0];
        await pool.query("UPDATE registrations SET user_id=$1 WHERE id=$2",[user.id,a.id]);
        const token=createSessionToken();
        await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')",[user.id,hashToken(token)]);
        res.status(201).json({ok:true,message:"تم تفعيل العضوية وإنشاء الحساب.",token,user:publicUser(user)});
    }catch(error){
        console.error(error);
        res.status(500).json({ok:false,message:"تعذر تفعيل العضوية."});
    }
});

app.get("/api/auth-test", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>اختبار تسجيل الحساب</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 500px;
            margin: 40px auto;
            padding: 20px;
        }

        input,
        button {
            width: 100%;
            box-sizing: border-box;
            padding: 12px;
            margin-bottom: 12px;
            font-size: 16px;
        }

        button {
            cursor: pointer;
        }

        pre {
            white-space: pre-wrap;
            word-break: break-word;
        }
    </style>
</head>

<body>

    <h2>اختبار تسجيل الحساب</h2>

    <form id="registerForm">

        <input
            id="full_name"
            placeholder="الاسم الكامل"
            required
        >

        <input
            id="student_id"
            placeholder="الرقم الجامعي"
            required
        >

        <input
            id="email"
            type="email"
            placeholder="البريد الإلكتروني"
        >

        <input
            id="password"
            type="password"
            placeholder="كلمة المرور"
            required
        >

        <button type="submit">
            إنشاء الحساب
        </button>

    </form>

    <pre id="result"></pre>

    <script>
        document
            .getElementById("registerForm")
            .addEventListener("submit", async function(event) {

                event.preventDefault();

                const result =
                    document.getElementById("result");

                result.textContent =
                    "جارٍ إنشاء الحساب...";

                try {

                    const response = await fetch(
                        "/api/auth/register",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({
                                full_name:
                                    document
                                        .getElementById("full_name")
                                        .value,

                                student_id:
                                    document
                                        .getElementById("student_id")
                                        .value,

                                email:
                                    document
                                        .getElementById("email")
                                        .value || null,

                                password:
                                    document
                                        .getElementById("password")
                                        .value
                            })
                        }
                    );

                    const data =
                        await response.json();

                    result.textContent =
                        JSON.stringify(
                            data,
                            null,
                            2
                        );

                } catch (error) {

                    result.textContent =
                        "حدث خطأ في الاتصال: " +
                        error.message;
                }
            });
    </script>

</body>
</html>
    `);
});


async function processExpiredPolls(){
  try{
    const expired=await pool.query(
      `UPDATE polls SET expiration_notified_at=NOW()
       WHERE closes_at IS NOT NULL AND closes_at<=NOW() AND expiration_notified_at IS NULL
       RETURNING id,question,author_id`
    );
    for(const poll of expired.rows){
      const voters=await pool.query("SELECT DISTINCT user_id FROM poll_votes WHERE poll_id=$1",[poll.id]);
      const recipients=new Set(voters.rows.map(x=>Number(x.user_id)));
      recipients.add(Number(poll.author_id));
      for(const recipientId of recipients){
        await pool.query(
          `INSERT INTO user_notifications(recipient_id,actor_id,kind,title,body,source,reference_type,reference_id)
           VALUES($1,$2,'poll_ended',$3,$4,'poll','poll',$5)`,
          [recipientId,poll.author_id,"انتهى التصويت","انتهت مدة الاستفتاء: "+String(poll.question).slice(0,180),poll.id]
        );
      }
    }
  }catch(error){ console.error("Expired poll processing failed:",error); }
}
setInterval(processExpiredPolls,60000);
processExpiredPolls();

async function initializeDatabase() {
    try {
        const schemaPath =
            path.join(__dirname, "schema.sql");

        const schema =
            fs.readFileSync(
                schemaPath,
                "utf8"
            );

        await pool.query(schema);

        await pool.query(`INSERT INTO conversations(name,type,is_private,created_by)
            SELECT x.name,'public',FALSE,NULL FROM (VALUES
              ('عام الاتحاد'),('الدراسة والمساعدة'),('الأنشطة والفعاليات')
            ) AS x(name)
            WHERE NOT EXISTS (SELECT 1 FROM conversations c WHERE c.type='public' AND c.name=x.name)`);
        console.log("Database schema initialized successfully.");

    } catch (error) {

        console.error(
            "Database initialization failed:"
        );

        console.error(error);

        process.exit(1);
    }
}


async function ensureOwnerAccount() {
    const ownerLogin = process.env.OWNER_LOGIN;
    const ownerPassword = process.env.OWNER_PASSWORD;

    if (!ownerLogin || !ownerPassword) {
        console.warn("OWNER_LOGIN/OWNER_PASSWORD are not configured; owner bootstrap skipped.");
        return;
    }

    if (ownerPassword.length < 8) {
        throw new Error("OWNER_PASSWORD must contain at least 8 characters.");
    }

    const existingOwner = await pool.query(
        `SELECT id, role
         FROM users
         WHERE role = 'owner'
         LIMIT 1`
    );

    const passwordHash = await hashPassword(ownerPassword);

    if (existingOwner.rows.length > 0) {
        const ownerId = existingOwner.rows[0].id;

        await pool.query(
            `UPDATE users
             SET phone = $1,
                 password_hash = $2,
                 is_active = TRUE,
                 profile_slug = COALESCE(profile_slug, 'u-' || id)
             WHERE id = $3`,
            [ownerLogin, passwordHash, ownerId]
        );

        console.log("Owner account credentials synchronized.");
        return;
    }

    const duplicateLogin = await pool.query(
        `SELECT id
         FROM users
         WHERE student_id = $1 OR email = $1 OR phone = $1
         LIMIT 1`,
        [ownerLogin]
    );

    if (duplicateLogin.rows.length > 0) {
        throw new Error("OWNER_LOGIN is already used by another account; owner bootstrap stopped.");
    }

    const result = await pool.query(
        `INSERT INTO users
            (full_name, student_id, phone, password_hash, role, is_active, last_seen_at)
         VALUES
            ('مالك النظام', 'OWNER-' || upper($1), $1, $2, 'owner', TRUE, NULL)
         RETURNING id`,
        [ownerLogin, passwordHash]
    );

    await pool.query(
        `UPDATE users
         SET profile_slug = 'u-' || id
         WHERE id = $1`,
        [result.rows[0].id]
    );

    await pool.query(
        `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details)
         VALUES ($1, 'owner.bootstrap', 'user', $1, $2::jsonb)`,
        [result.rows[0].id, JSON.stringify({ source: "environment_configuration" })]
    );

    console.log("Owner account created successfully.");
}

async function dispatchSelfHealing(error){
    const stack=String(error?.stack||error||'');
    const match=stack.match(/(?:file:\/\/)?([^\\s()]+backend[\\/][^\\s():]+)(?::\\d+)?(?::\\d+)?/i);
    if(!match)return;
    const raw=match[1].replace(/\\\\/g,'/');
    const idx=raw.indexOf('backend/');
    const filePath=idx>=0?raw.slice(idx):null;
    if(!filePath)return;
    const url=process.env.SELF_HEALING_AGENT_URL||'http://self-healing-agent.internal/internal/heal';
    try{
        await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({error:stack,filePath})});
    }catch(dispatchError){
        console.error('Self-healing dispatch failed:',dispatchError.message);
    }
}

process.on('uncaughtException',error=>{
    console.error('UNCAUGHT EXCEPTION:',error);
    dispatchSelfHealing(error).catch(()=>{}).finally(()=>process.exit(1));
});

process.on('unhandledRejection',reason=>{
    console.error('UNHANDLED REJECTION:',reason);
    dispatchSelfHealing(reason instanceof Error?reason:new Error(String(reason))).catch(()=>{});
});

async function startServer() {

    await initializeDatabase();
    await ensureOwnerAccount();

    app.listen(
        PORT,
        "0.0.0.0",
        () => {
            console.log(
                `Law Students Union API running on port ${PORT}`
            );
        }
    );
}

startServer();

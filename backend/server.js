const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());

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

        if (!identifier || !password) {
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
             WHERE student_id = $1
                OR email = $1
                OR phone = $1
             LIMIT 1`,
            [identifier]
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

        if (email && !/^\\S+@\\S+\\.\\S+$/.test(email)) {
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
                 avatar_url = $6,
                 profile_background_url = CASE
                    WHEN $6 IS NOT NULL THEN $6
                    ELSE profile_background_url
                 END,
                 privacy_settings = $7::jsonb,
                 notification_settings = $8::jsonb,
                 password_hash = COALESCE($9, password_hash),
                 profile_slug = COALESCE(profile_slug, 'u-' || id)
             WHERE id = $10`,
            [
                full_name !== undefined ? String(full_name).trim() : null,
                phone || null,
                academic_year || null,
                bio || null,
                email || null,
                avatar_url !== undefined ? avatar_url : req.user.avatar_url,
                JSON.stringify(nextPrivacy),
                JSON.stringify(nextNotifications),
                passwordHash,
                req.user.id
            ]
        );

        await pool.query(
            `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details)
             VALUES ($1, 'profile.updated', 'user', $1, $2::jsonb)`,
            [req.user.id, JSON.stringify({ avatar_changed: avatar_url !== undefined, password_changed: !!password })]
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
        `UPDATE users SET last_seen_at = NOW() WHERE id = $1`,
        [req.user.id]
    );

    res.json({ ok: true, online: true });
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

/* =========================
   INTERACTIVE COMMUNITY CONTENT
========================= */

app.get("/api/posts", async (req, res) => {
    try {
        const section = String(req.query.section || "community");
        const allowed = ["community", "announcements", "activities"];
        const safeSection = allowed.includes(section) ? section : "community";
        const viewer = await getAuthenticatedUser(req);

        const result = await pool.query(
            `SELECT p.id, p.section, p.title, p.body, p.image_url,
                    p.is_pinned, p.created_at, p.updated_at,
                    p.author_id,
                    u.full_name AS author_name,
                    u.avatar_url AS author_avatar,
                    COUNT(DISTINCT l.user_id)::int AS likes_count,
                    COUNT(DISTINCT c.id)::int AS comments_count,
                    CASE WHEN $2::bigint IS NULL THEN FALSE
                         ELSE EXISTS(
                           SELECT 1 FROM post_likes pl
                           WHERE pl.post_id = p.id AND pl.user_id = $2
                         )
                    END AS liked
             FROM posts p
             JOIN users u ON u.id = p.author_id
             LEFT JOIN post_likes l ON l.post_id = p.id
             LEFT JOIN post_comments c ON c.post_id = p.id
             WHERE p.section = $1
               AND p.is_published = TRUE
               AND u.is_active = TRUE
             GROUP BY p.id, u.full_name, u.avatar_url
             ORDER BY p.is_pinned DESC, p.created_at DESC
             LIMIT 100`,
            [safeSection, viewer ? viewer.id : null]
        );

        res.json({ ok: true, posts: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not load posts." });
    }
});

app.post("/api/posts", requireAuth(async (req, res) => {
    try {
        const { section, title, body, image_url } = req.body;
        const safeSection = ["community", "announcements", "activities"].includes(section)
            ? section
            : "community";

        if (!body || !String(body).trim()) {
            return res.status(400).json({ ok: false, message: "Post text is required." });
        }

        if (String(body).length > 5000) {
            return res.status(400).json({ ok: false, message: "Post is too long." });
        }

        if (safeSection !== "community" && !["admin", "owner"].includes(req.user.role)) {
            return res.status(403).json({
                ok: false,
                message: "Only administrators can publish in this section."
            });
        }

        if (image_url && (typeof image_url !== "string" || image_url.length > 3000000)) {
            return res.status(400).json({ ok: false, message: "Invalid image." });
        }

        const result = await pool.query(
            `INSERT INTO posts (author_id, section, title, body, image_url)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, section, title, body, image_url, is_pinned, created_at`,
            [
                req.user.id,
                safeSection,
                title ? String(title).trim().slice(0, 255) : null,
                String(body).trim(),
                image_url || null
            ]
        );

        await pool.query(
            `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details)
             VALUES ($1, 'post.created', 'post', $2, $3::jsonb)`,
            [req.user.id, result.rows[0].id, JSON.stringify({ section: safeSection })]
        );

        res.status(201).json({ ok: true, post: result.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not create post." });
    }
}));

app.post("/api/posts/:id/like", requireAuth(async (req, res) => {
    try {
        const postId = Number(req.params.id);
        if (!Number.isInteger(postId)) {
            return res.status(400).json({ ok: false, message: "Invalid post ID." });
        }

        const existing = await pool.query(
            `SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2`,
            [postId, req.user.id]
        );

        if (existing.rows.length) {
            await pool.query(
                `DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2`,
                [postId, req.user.id]
            );
        } else {
            await pool.query(
                `INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)`,
                [postId, req.user.id]
            );
        }

        const count = await pool.query(
            `SELECT COUNT(*)::int AS count FROM post_likes WHERE post_id = $1`,
            [postId]
        );

        res.json({
            ok: true,
            liked: !existing.rows.length,
            likes_count: count.rows[0].count
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not update like." });
    }
}));

app.get("/api/posts/:id/comments", async (req, res) => {
    try {
        const postId = Number(req.params.id);
        if (!Number.isInteger(postId)) {
            return res.status(400).json({ ok: false, message: "Invalid post ID." });
        }

        const result = await pool.query(
            `SELECT c.id, c.body, c.created_at, c.author_id,
                    u.full_name AS author_name, u.avatar_url AS author_avatar
             FROM post_comments c
             JOIN users u ON u.id = c.author_id
             WHERE c.post_id = $1 AND u.is_active = TRUE
             ORDER BY c.created_at ASC`,
            [postId]
        );

        res.json({ ok: true, comments: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not load comments." });
    }
});

app.post("/api/posts/:id/comments", requireAuth(async (req, res) => {
    try {
        const postId = Number(req.params.id);
        const body = String(req.body.body || "").trim();

        if (!Number.isInteger(postId) || !body) {
            return res.status(400).json({ ok: false, message: "Post and comment are required." });
        }

        if (body.length > 1500) {
            return res.status(400).json({ ok: false, message: "Comment is too long." });
        }

        const post = await pool.query(
            `SELECT id FROM posts WHERE id = $1 AND is_published = TRUE`,
            [postId]
        );

        if (!post.rows.length) {
            return res.status(404).json({ ok: false, message: "Post not found." });
        }

        const result = await pool.query(
            `INSERT INTO post_comments (post_id, author_id, body)
             VALUES ($1, $2, $3)
             RETURNING id, body, created_at`,
            [postId, req.user.id, body]
        );

        res.status(201).json({
            ok: true,
            comment: {
                ...result.rows[0],
                author_id: req.user.id,
                author_name: req.user.full_name,
                author_avatar: req.user.avatar_url
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not add comment." });
    }
}));

app.patch("/api/posts/:id/pin", requireRoles("admin", "owner"), async (req, res) => {
    try {
        const postId = Number(req.params.id);
        const pinned = req.body.pinned === true;

        if (!Number.isInteger(postId)) {
            return res.status(400).json({ ok: false, message: "Invalid post ID." });
        }

        await pool.query(
            `UPDATE posts SET is_pinned = $1, updated_at = NOW() WHERE id = $2`,
            [pinned, postId]
        );

        await pool.query(
            `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details)
             VALUES ($1, 'post.pin_changed', 'post', $2, $3::jsonb)`,
            [req.user.id, postId, JSON.stringify({ pinned })]
        );

        res.json({ ok: true, pinned });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not update pinned state." });
    }
}));

app.delete("/api/posts/:id", requireAuth(async (req, res) => {
    try {
        const postId = Number(req.params.id);
        const target = await pool.query(
            `SELECT author_id FROM posts WHERE id = $1`,
            [postId]
        );

        if (!target.rows.length) {
            return res.status(404).json({ ok: false, message: "Post not found." });
        }

        const canDelete =
            Number(target.rows[0].author_id) === Number(req.user.id) ||
            ["admin", "owner"].includes(req.user.role);

        if (!canDelete) {
            return res.status(403).json({ ok: false, message: "You cannot delete this post." });
        }

        await pool.query(`DELETE FROM posts WHERE id = $1`, [postId]);
        res.json({ ok: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not delete post." });
    }
}));

/* =========================
   MEMBERSHIP APPLICATIONS
========================= */

app.get("/api/membership/status", requireAuth(async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, status, academic_year, phone, created_at,
                    reviewed_at, rejection_reason
             FROM registrations
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [req.user.id]
        );

        res.json({
            ok: true,
            account: {
                full_name: req.user.full_name,
                student_id: req.user.student_id,
                email: req.user.email,
                phone: req.user.phone,
                academic_year: req.user.academic_year,
                role: req.user.role
            },
            application: result.rows[0] || null
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not load membership status." });
    }
}));

app.post("/api/membership/apply", requireAuth(async (req, res) => {
    try {
        const { phone, academic_year, note } = req.body;

        const latest = await pool.query(
            `SELECT id, status FROM registrations
             WHERE user_id = $1
             ORDER BY created_at DESC LIMIT 1`,
            [req.user.id]
        );

        if (latest.rows[0]?.status === "pending") {
            return res.status(409).json({ ok: false, message: "لديك طلب عضوية قيد المراجعة بالفعل." });
        }

        if (req.user.role === "member" || req.user.role === "admin" || req.user.role === "owner") {
            return res.status(409).json({ ok: false, message: "حسابك مسجل بالفعل في النظام." });
        }

        const result = await pool.query(
            `INSERT INTO registrations
                (full_name, student_id, year, academic_year, email, phone, note, user_id)
             VALUES ($1, $2, $3, $3, $4, $5, $6, $7)
             RETURNING id, status, created_at`,
            [
                req.user.full_name,
                req.user.student_id,
                academic_year || req.user.academic_year || null,
                req.user.email,
                phone || req.user.phone,
                note || null,
                req.user.id
            ]
        );

        res.status(201).json({ ok: true, application: result.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not submit membership application." });
    }
}));

app.get("/api/admin/membership/applications", requireRoles("admin", "owner"), async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.*, u.role AS current_role
             FROM registrations r
             LEFT JOIN users u ON u.id = r.user_id
             ORDER BY r.created_at DESC
             LIMIT 300`
        );
        res.json({ ok: true, applications: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not load membership applications." });
    }
}));

app.patch("/api/admin/membership/applications/:id", requireRoles("admin", "owner"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const status = String(req.body.status || "");

        if (!Number.isInteger(id) || !["approved", "rejected"].includes(status)) {
            return res.status(400).json({ ok: false, message: "Invalid application decision." });
        }

        const result = await pool.query(
            `SELECT * FROM registrations WHERE id = $1 LIMIT 1`,
            [id]
        );

        if (!result.rows.length) {
            return res.status(404).json({ ok: false, message: "Application not found." });
        }

        const application = result.rows[0];

        await pool.query(
            `UPDATE registrations
             SET status = $1, reviewed_by = $2, reviewed_at = NOW(),
                 rejection_reason = $3
             WHERE id = $4`,
            [
                status,
                req.user.id,
                status === "rejected" ? String(req.body.rejection_reason || "").trim() || null : null,
                id
            ]
        );

        if (application.user_id && status === "approved") {
            await pool.query(
                `UPDATE users
                 SET role = 'member',
                     academic_year = COALESCE($1, academic_year),
                     phone = COALESCE($2, phone)
                 WHERE id = $3 AND role <> 'owner'`,
                [application.academic_year, application.phone, application.user_id]
            );
        }

        await pool.query(
            `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details)
             VALUES ($1, 'membership.reviewed', 'registration', $2, $3::jsonb)`,
            [req.user.id, id, JSON.stringify({ status })]
        );

        res.json({ ok: true, status });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not review membership application." });
    }
}));

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

        console.log(
            "Database schema initialized successfully."
        );

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

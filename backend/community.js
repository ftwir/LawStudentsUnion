module.exports = function registerCommunityRoutes(app, pool, requireAuth, requireRoles, getAuthenticatedUser) {
function normalizeSection(value) {
    const allowed = ["community", "announcements", "activities", "study"];
    const section = String(value || "community").trim().toLowerCase();
    return allowed.includes(section) ? section : null;
}

function sanitizeRichHTML(value) {
    let html=String(value||"").slice(0,9000000).replace(/<!--[\s\S]*?-->/g,"");
    const allowedTags=new Set(["p","div","br","strong","b","em","i","u","s","h1","h2","h3","blockquote","ul","ol","li","span","font","a","img"]);
    html=html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi,(full,rawTag,rawAttrs)=>{
        const tag=String(rawTag).toLowerCase();
        if(!allowedTags.has(tag)) return "";
        if(full.startsWith("</")) return tag === "img" ? "" : "</"+tag+">";
        if(tag==="br") return "<br>";
        if(tag==="img"){
            const srcMatch=String(rawAttrs||"").match(/(?:^|\s)src\s*=\s*["']([^"']+)["']/i);
            if(!srcMatch) return "";
            const src=srcMatch[1].trim();
            const safeRemote=/^https:\/\/[^\s"'<>]+$/i.test(src);
            if(!validateImageDataUrl(src) && !safeRemote) return "";
            return '<img src="'+src.replace(/&/g,"&amp;").replace(/"/g,"&quot;")+'" loading="lazy" alt="">';
        }
        let attrs="";
        if(tag==="font"){
            const color=String(rawAttrs||"").match(/(?:^|\s)color\s*=\s*["']?(#[0-9a-f]{3,8})["']?/i);
            if(color) attrs=' color="'+color[1].toLowerCase()+'"';
        }else if(tag==="a"){
            const href=String(rawAttrs||"").match(/(?:^|\s)href\s*=\s*["'](https?:\/\/[^"']+)["']/i);
            if(href) attrs=' href="'+href[1].replace(/&/g,"&amp;").replace(/"/g,"&quot;")+'" target="_blank" rel="noopener noreferrer"';
        }else{
            const styleMatch=String(rawAttrs||"").match(/(?:^|\s)style\s*=\s*["']([^"']*)["']/i);
            if(styleMatch){
                const safeDecls=[];
                for(const part of styleMatch[1].split(";")){
                    const m=part.trim().match(/^(text-align|color|font-weight|font-style|text-decoration|font-size)\s*:\s*([^;]+)$/i);
                    if(!m) continue;
                    const property=m[1].toLowerCase();
                    const val=m[2].trim();
                    if(/url\s*\(|expression\s*\(|javascript\s*:/i.test(val)) continue;
                    if(property==="color" && !/^(#[0-9a-f]{3,8}|rgb\([^)]{1,30}\)|rgba\([^)]{1,35}\)|[a-z]+)$/i.test(val)) continue;
                    if(property==="font-size"){
                        const em=val.match(/^([0-9]+(?:\.[0-9]+)?)em$/i);
                        const px=val.match(/^([0-9]+(?:\.[0-9]+)?)px$/i);
                        const safeEm=em && Number(em[1])>=0.6 && Number(em[1])<=2.5;
                        const safePx=px && Number(px[1])>=8 && Number(px[1])<=40;
                        if(!safeEm && !safePx) continue;
                    }
                    safeDecls.push(property+":"+val);
                }
                if(safeDecls.length) attrs=' style="'+safeDecls.join(";")+'"';
            }
        }
        return "<"+tag+attrs+">";
    });
    return html;
}
function normalizeHashtags(value) {
    return [...new Set((Array.isArray(value)?value:[]).map(x=>String(x||"").trim().replace(/^#/,"").replace(/[^\p{L}\p{N}_-]/gu,"").slice(0,40)).filter(Boolean))].slice(0,12);
}

function validateImageDataUrl(value) {
    if (value === undefined || value === null || value === "") return true;
    return typeof value === "string" &&
        value.length <= 7000000 &&
        /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/i.test(value);
}

async function serializePost(row) {
    const comments = await pool.query(`
        SELECT c.id, c.body, c.created_at,
               u.id AS author_id, u.full_name AS author_name,
               u.avatar_url AS author_avatar, u.profile_slug AS author_slug
        FROM post_comments c
        INNER JOIN users u ON u.id = c.author_id
        WHERE c.post_id = $1
        ORDER BY c.created_at ASC
        LIMIT 100
    `, [row.id]);

    return {
        id: Number(row.id),
        section: row.section,
        title: row.title,
        body: row.body,
        body_html: row.body_html || null,
        content_type: row.content_type || "post",
        hashtags: row.hashtags || [],
        image_url: row.image_url,
        is_pinned: row.is_pinned,
        created_at: row.created_at,
        updated_at: row.updated_at,
        author: {
            id: Number(row.author_id),
            full_name: row.author_name,
            avatar_url: row.author_avatar,
            profile_slug: row.author_slug || `u-${row.author_id}`
        },
        likes_count: Number(row.likes_count || 0),
        comments_count: Number(row.comments_count || 0),
        liked_by_me: Number(row.liked_by_me || 0) > 0,
        comments: comments.rows.map(comment => ({
            id: Number(comment.id),
            body: comment.body,
            created_at: comment.created_at,
            author: {
                id: Number(comment.author_id),
                full_name: comment.author_name,
                avatar_url: comment.author_avatar,
                profile_slug: comment.author_slug || `u-${comment.author_id}`
            }
        }))
    };
}

app.get("/api/posts", async (req, res) => {
    try {
        const section = normalizeSection(req.query.section || "community");
        if (!section) return res.status(400).json({ ok: false, message: "Invalid section." });
        const viewer = await getAuthenticatedUser(req);
        if (section === "announcements" && !["admin", "owner"].includes(viewer?.role)) {
            return res.status(403).json({ ok: false, message: "Announcements are restricted." });
        }
        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);

        const result = await pool.query(`
            SELECT p.id, p.section, p.title, p.body, p.body_html, p.content_type, p.hashtags, p.image_url,
                   p.is_pinned, p.created_at, p.updated_at,
                   u.id AS author_id, u.full_name AS author_name,
                   u.avatar_url AS author_avatar, u.profile_slug AS author_slug,
                   COUNT(DISTINCT l.user_id)::int AS likes_count,
                   COUNT(DISTINCT c.id)::int AS comments_count,
                   COUNT(DISTINCT CASE WHEN l.user_id = $2 THEN l.user_id END)::int AS liked_by_me
            FROM posts p
            INNER JOIN users u ON u.id = p.author_id
            LEFT JOIN post_likes l ON l.post_id = p.id
            LEFT JOIN post_comments c ON c.post_id = p.id
            WHERE p.is_published = TRUE AND p.section = $1 AND u.is_active = TRUE
            GROUP BY p.id, u.id
            ORDER BY p.is_pinned DESC, p.created_at DESC
            LIMIT $3
        `, [section, viewer ? viewer.id : null, limit]);

        const posts = [];
        for (const row of result.rows) posts.push(await serializePost(row));
        res.json({ ok: true, posts });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not load posts." });
    }
});

app.delete("/api/admin/registrations/:id", requireRoles("owner"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ ok: false, message: "Invalid application ID." });
        const existing = await pool.query("SELECT id, status, user_id FROM registrations WHERE id = $1 LIMIT 1", [id]);
        if (!existing.rows.length) return res.status(404).json({ ok: false, message: "Application not found." });
        await pool.query("DELETE FROM registrations WHERE id = $1", [id]);
        await pool.query(
            `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details)
             VALUES ($1, 'membership.application_deleted', 'registration', $2, $3::jsonb)`,
            [req.user.id, id, JSON.stringify({ status: existing.rows[0].status, user_id: existing.rows[0].user_id, deleted_by_role: req.user.role })]
        );
        res.json({ ok: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not delete membership application." });
    }
});

app.post("/api/posts", requireAuth(async (req, res) => {
    try {
        const section = normalizeSection(req.body.section || "community");
        const title = req.body.title == null ? null : String(req.body.title).trim();
        const body = String(req.body.body || "").trim();
        const bodyHtml = req.body.body_html ? sanitizeRichHTML(req.body.body_html) : null;
        const contentType = ["post","article"].includes(String(req.body.content_type||"post")) ? String(req.body.content_type||"post") : "post";
        const hashtags = normalizeHashtags(req.body.hashtags);
        const imageUrl = req.body.image_url || null;

        if (!section) return res.status(400).json({ ok: false, message: "Invalid section." });
        if (!body || body.length > 10000) return res.status(400).json({ ok: false, message: "Post text is required." });
        if (title && title.length > 255) return res.status(400).json({ ok: false, message: "Title is too long." });
        if (!validateImageDataUrl(imageUrl)) return res.status(400).json({ ok: false, message: "Invalid or oversized image." });

        const result = await pool.query(`
            INSERT INTO posts (author_id, section, title, body, body_html, content_type, hashtags, image_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
        `, [req.user.id, section, title || null, body, bodyHtml, contentType, hashtags, imageUrl]);

        await pool.query(`
            INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details)
            VALUES ($1, 'post.created', 'post', $2, $3::jsonb)
        `, [req.user.id, result.rows[0].id, JSON.stringify({ section, content_type: contentType, hashtags, has_image: !!imageUrl })]);
        const notificationSource = section === "announcements" ? "announcement" : ((req.user.role === "admin" || req.user.role === "owner") ? "admin" : "member");
        await notifyActiveMembers({
            actorId: req.user.id,
            actorName: req.user.full_name,
            kind: "post",
            title: title || "منشور جديد في مجتمع الاتحاد",
            body,
            source: notificationSource,
            referenceType: "post",
            referenceId: result.rows[0].id
        });

        const postResult = await pool.query(`
            SELECT p.id, p.section, p.title, p.body, p.body_html, p.content_type, p.hashtags, p.image_url,
                   p.is_pinned, p.created_at, p.updated_at,
                   u.id AS author_id, u.full_name AS author_name,
                   u.avatar_url AS author_avatar, u.profile_slug AS author_slug,
                   0::int AS likes_count, 0::int AS comments_count, 0::int AS liked_by_me
            FROM posts p INNER JOIN users u ON u.id = p.author_id
            WHERE p.id = $1
        `, [result.rows[0].id]);

        res.status(201).json({ ok: true, message: "Post published successfully.", post: await serializePost(postResult.rows[0]) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not create post." });
    }
}));

app.post("/api/posts/:id/like", requireAuth(async (req, res) => {
    try {
        const postId = Number(req.params.id);
        if (!Number.isInteger(postId)) return res.status(400).json({ ok: false, message: "Invalid post ID." });

        const post = await pool.query(`SELECT id FROM posts WHERE id = $1 AND is_published = TRUE LIMIT 1`, [postId]);
        if (!post.rows.length) return res.status(404).json({ ok: false, message: "Post not found." });

        const existing = await pool.query(`SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2`, [postId, req.user.id]);
        let liked;
        if (existing.rows.length) {
            await pool.query(`DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2`, [postId, req.user.id]);
            liked = false;
        } else {
            await pool.query(`INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)`, [postId, req.user.id]);
            liked = true;
        }

        const count = await pool.query(`SELECT COUNT(*)::int AS count FROM post_likes WHERE post_id = $1`, [postId]);
        res.json({ ok: true, liked, likes_count: count.rows[0].count });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not update like." });
    }
}));

app.post("/api/posts/:id/comments", requireAuth(async (req, res) => {
    try {
        const postId = Number(req.params.id);
        const body = String(req.body.body || "").trim();
        if (!Number.isInteger(postId) || !body || body.length > 2000) return res.status(400).json({ ok: false, message: "Invalid comment." });

        const post = await pool.query(`SELECT id FROM posts WHERE id = $1 AND is_published = TRUE LIMIT 1`, [postId]);
        if (!post.rows.length) return res.status(404).json({ ok: false, message: "Post not found." });

        const result = await pool.query(`
            INSERT INTO post_comments (post_id, author_id, body)
            VALUES ($1, $2, $3) RETURNING id, body, created_at
        `, [postId, req.user.id, body]);
        const owner = await pool.query("SELECT author_id FROM posts WHERE id = $1", [postId]);
        if (owner.rows.length && Number(owner.rows[0].author_id) !== Number(req.user.id)) {
            await createMemberNotification({ recipientId: owner.rows[0].author_id, actorId: req.user.id, kind: "comment", title: "تعليق جديد على منشورك", body, source: "member", referenceType: "post", referenceId: postId });
        }

        res.status(201).json({
            ok: true,
            comment: {
                id: Number(result.rows[0].id),
                body: result.rows[0].body,
                created_at: result.rows[0].created_at,
                author: {
                    id: Number(req.user.id),
                    full_name: req.user.full_name,
                    avatar_url: req.user.avatar_url,
                    profile_slug: req.user.profile_slug || `u-${req.user.id}`
                }
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not add comment." });
    }
}));

app.post("/api/posts/:id/report", requireAuth(async (req, res) => {
    try {
        const postId = Number(req.params.id);
        const reason = String(req.body.reason || "").trim();

        if (!Number.isInteger(postId) || !reason || reason.length > 500) {
            return res.status(400).json({ ok: false, message: "Invalid report." });
        }

        const post = await pool.query(
            `SELECT id, author_id FROM posts WHERE id = $1 AND is_published = TRUE LIMIT 1`,
            [postId]
        );

        if (!post.rows.length) {
            return res.status(404).json({ ok: false, message: "Post not found." });
        }

        const duplicate = await pool.query(
            `SELECT id
             FROM audit_logs
             WHERE actor_user_id = $1
               AND action = 'post.reported'
               AND target_type = 'post'
               AND target_id = $2
               AND details->>'status' = 'open'
             LIMIT 1`,
            [req.user.id, postId]
        );

        if (duplicate.rows.length) {
            return res.status(409).json({ ok: false, message: "You have already reported this post." });
        }

        const result = await pool.query(
            `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details)
             VALUES ($1, 'post.reported', 'post', $2, $3::jsonb)
             RETURNING id, created_at`,
            [req.user.id, postId, JSON.stringify({ reason, status: "open" })]
        );

        res.status(201).json({
            ok: true,
            report: {
                id: Number(result.rows[0].id),
                post_id: postId,
                status: "open",
                created_at: result.rows[0].created_at
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not submit report." });
    }
}));

app.get("/api/admin/reports", requireRoles("admin", "owner"), async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT a.id, a.target_id AS post_id, a.details, a.created_at,
                   actor.full_name AS reporter_name,
                   p.title AS post_title, p.body AS post_body,
                   author.full_name AS author_name
            FROM audit_logs a
            LEFT JOIN users actor ON actor.id = a.actor_user_id
            LEFT JOIN posts p ON p.id = a.target_id
            LEFT JOIN users author ON author.id = p.author_id
            WHERE a.action = 'post.reported'
            ORDER BY a.created_at DESC
            LIMIT 200
        `);

        const reports = result.rows.map(row => ({
            id: Number(row.id),
            post_id: Number(row.post_id),
            reason: row.details?.reason || "",
            status: row.details?.status || "open",
            reporter_name: row.reporter_name || "عضو",
            post_title: row.post_title,
            post_body: row.post_body,
            author_name: row.author_name || "عضو",
            created_at: row.created_at
        }));

        res.json({ ok: true, reports });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not load reports." });
    }
});

app.patch("/api/admin/reports/:id", requireRoles("admin", "owner"), async (req, res) => {
    try {
        const reportId = Number(req.params.id);
        const status = String(req.body.status || "");

        if (!Number.isInteger(reportId) || !["open", "resolved", "dismissed"].includes(status)) {
            return res.status(400).json({ ok: false, message: "Invalid report status." });
        }

        const report = await pool.query(
            `SELECT id, target_id, details
             FROM audit_logs
             WHERE id = $1 AND action = 'post.reported'
             LIMIT 1`,
            [reportId]
        );

        if (!report.rows.length) {
            return res.status(404).json({ ok: false, message: "Report not found." });
        }

        await pool.query(
            `UPDATE audit_logs
             SET details = details || $1::jsonb
             WHERE id = $2`,
            [JSON.stringify({ status }), reportId]
        );

        await pool.query(
            `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details)
             VALUES ($1, 'post.report_status_changed', 'report', $2, $3::jsonb)`,
            [req.user.id, reportId, JSON.stringify({ status, post_id: report.rows[0].target_id })]
        );

        res.json({ ok: true, status });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not update report." });
    }
});

app.patch("/api/posts/:id/pin", requireRoles("admin", "owner"), async (req, res) => {
    try {
        const postId = Number(req.params.id);
        const pinned = req.body.pinned === true;
        if (!Number.isInteger(postId)) return res.status(400).json({ ok: false, message: "Invalid post ID." });

        const post = await pool.query(`SELECT id FROM posts WHERE id = $1 LIMIT 1`, [postId]);
        if (!post.rows.length) return res.status(404).json({ ok: false, message: "Post not found." });

        await pool.query(`UPDATE posts SET is_pinned = $1, updated_at = NOW() WHERE id = $2`, [pinned, postId]);
        await pool.query(`
            INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details)
            VALUES ($1, 'post.pin_changed', 'post', $2, $3::jsonb)
        `, [req.user.id, postId, JSON.stringify({ pinned })]);

        res.json({ ok: true, is_pinned: pinned });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not update post pin." });
    }
});

app.delete("/api/posts/:id", requireAuth(async (req, res) => {
    try {
        const postId = Number(req.params.id);
        if (!Number.isInteger(postId)) return res.status(400).json({ ok: false, message: "Invalid post ID." });

        const post = await pool.query(`SELECT id, author_id FROM posts WHERE id = $1 LIMIT 1`, [postId]);
        if (!post.rows.length) return res.status(404).json({ ok: false, message: "Post not found." });

        const ownPost = Number(post.rows[0].author_id) === Number(req.user.id);
        const manager = ["admin", "owner"].includes(req.user.role);
        if (!ownPost && !manager) return res.status(403).json({ ok: false, message: "You do not have permission to delete this post." });

        await pool.query(`DELETE FROM posts WHERE id = $1`, [postId]);
        await pool.query(`
            INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details)
            VALUES ($1, 'post.deleted', 'post', $2, $3::jsonb)
        `, [req.user.id, postId, JSON.stringify({ by_manager: manager })]);

        res.json({ ok: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not delete post." });
    }
}));

app.get("/api/announcements", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, title, body, tag, is_published, published_at
             FROM announcements
             WHERE is_published = TRUE
             ORDER BY published_at DESC, id DESC
             LIMIT 100`
        );
        res.json({ ok: true, announcements: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not load announcements." });
    }
});

app.get("/api/activities", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, title, body, tag, event_date, is_published
             FROM activities
             WHERE is_published = TRUE
             ORDER BY event_date ASC NULLS LAST, id DESC
             LIMIT 100`
        );
        res.json({ ok: true, activities: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not load activities." });
    }
});

app.get("/api/notifications", requireAuth(async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, title, body, is_published, published_at
             FROM notifications
             WHERE is_published = TRUE
             ORDER BY published_at DESC, id DESC
             LIMIT 100`
        );
        res.json({ ok: true, notifications: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not load notifications." });
    }
}));

app.get("/api/schedule", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, title, body, day_name, start_time, end_time, room
             FROM schedules
             WHERE is_published = TRUE
             ORDER BY day_name, start_time NULLS LAST, id
             LIMIT 200`
        );
        res.json({ ok: true, schedule: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not load schedule." });
    }
});

app.post("/api/membership/apply", async (req, res) => {
    try {
        const fullName = String(req.body.full_name || "").trim();
        const studentId = String(req.body.student_id || "").trim();
        const phone = String(req.body.phone || "").trim();
        const academicYear = String(req.body.academic_year || "").trim();
        const email = req.body.email ? String(req.body.email).trim() : null;
        const note = req.body.note ? String(req.body.note).trim() : null;

        if (!fullName || !studentId || !phone || !academicYear) {
            return res.status(400).json({ ok: false, message: "الاسم والرقم والهاتف والسنة الدراسية مطلوبة." });
        }
        if (fullName.length > 150 || studentId.length > 50 || phone.length > 40 || academicYear.length > 50 || (email && email.length > 255) || (note && note.length > 3000)) {
            return res.status(400).json({ ok: false, message: "بيانات الطلب طويلة أكثر من المسموح." });
        }

        const existing = await pool.query(
            `SELECT id, status FROM registrations
             WHERE student_id = $1
             ORDER BY id DESC LIMIT 1`,
            [studentId]
        );
        if (existing.rows.length && existing.rows[0].status === "pending") {
            return res.status(409).json({ ok: false, message: "يوجد طلب عضوية قيد المراجعة بهذا الرقم." });
        }

        const result = await pool.query(
            `INSERT INTO registrations
             (full_name, student_id, academic_year, email, phone, note, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending')
             RETURNING id, status, created_at`,
            [fullName, studentId, academicYear, email, phone, note]
        );

        res.status(201).json({ ok: true, application: result.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not submit membership application." });
    }
});

app.get("/api/admin/registrations", requireRoles("admin", "owner"), async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.id, r.full_name, r.student_id, r.academic_year, r.email,
                    r.phone, r.note, r.status, r.rejection_reason,
                    r.created_at, r.reviewed_at, r.archived_at,
                    archive_user.full_name AS archived_by_name,
                    reviewer.full_name AS reviewer_name
             FROM registrations r
             LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
             LEFT JOIN users archive_user ON archive_user.id = r.archived_by
             ORDER BY (r.archived_at IS NULL) DESC, r.created_at DESC
             LIMIT 300`
        );
        res.json({ ok: true, applications: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not load membership applications." });
    }
});

app.patch("/api/admin/registrations/:id", requireRoles("admin", "owner"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const status = String(req.body.status || "");
        const rejectionReason = req.body.rejection_reason ? String(req.body.rejection_reason).trim() : null;

        if (!Number.isInteger(id) || !["approved", "rejected", "pending"].includes(status)) {
            return res.status(400).json({ ok: false, message: "Invalid application status." });
        }

        const application = await pool.query(
            `SELECT * FROM registrations WHERE id = $1 LIMIT 1`,
            [id]
        );
        if (!application.rows.length) return res.status(404).json({ ok: false, message: "Application not found." });

        const a = application.rows[0];
        let linkedUserId = a.user_id;

        if (status === "approved" && !linkedUserId) {
            const existingUser = await pool.query(
                `SELECT id FROM users WHERE student_id = $1 LIMIT 1`,
                [a.student_id]
            );
            linkedUserId = existingUser.rows[0]?.id || null;
        }

        await pool.query(
            `UPDATE registrations
             SET status = $1,
                 rejection_reason = $2,
                 reviewed_by = $3,
                 reviewed_at = NOW(),
                 user_id = $4,
                 archived_at = CASE WHEN $1 IN ('approved','rejected') THEN COALESCE(archived_at, NOW()) ELSE NULL END,
                 archived_by = CASE WHEN $1 IN ('approved','rejected') THEN COALESCE(archived_by, $3) ELSE NULL END
             WHERE id = $5`,
            [status, status === "rejected" ? rejectionReason : null, req.user.id, linkedUserId, id]
        );

        await pool.query(
            `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details)
             VALUES ($1, 'membership.status_changed', 'registration', $2, $3::jsonb)`,
            [req.user.id, id, JSON.stringify({ status, user_id: linkedUserId })]
        );

        res.json({ ok: true, status, user_id: linkedUserId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not update membership application." });
    }
});

async function createMemberNotification({ recipientId, actorId, kind, title, body, source, referenceType, referenceId }) {
    await pool.query(
        `INSERT INTO user_notifications
         (recipient_id, actor_id, kind, title, body, source, reference_type, reference_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [recipientId, actorId || null, kind, title, body || null, source || 'member', referenceType || null, referenceId || null]
    );
}

async function notifyActiveMembers({ actorId, actorName, kind, title, body, source, referenceType, referenceId }) {
    const recipients = await pool.query(
        `SELECT id FROM users WHERE is_active = TRUE AND id <> $1`,
        [actorId]
    );
    for (const row of recipients.rows) {
        await createMemberNotification({ recipientId: row.id, actorId, kind, title, body, source, referenceType, referenceId });
    }
}

async function getOrCreateCommunityConversation() {
    const existing = await pool.query(
        `SELECT id, name, type, is_private
         FROM conversations
         WHERE type = 'community' AND is_private = FALSE
         ORDER BY id ASC
         LIMIT 1`
    );

    if (existing.rows.length) return existing.rows[0];

    const created = await pool.query(
        `INSERT INTO conversations (name, type, is_private)
         VALUES ('مجتمع الاتحاد', 'community', FALSE)
         RETURNING id, name, type, is_private`
    );

    return created.rows[0];
}

app.get("/api/chat/community", requireAuth(async (req, res) => {
    try {
        const conversation = await getOrCreateCommunityConversation();

        const messages = await pool.query(
            `SELECT m.id, m.body, m.created_at, m.sender_id,
                    u.full_name AS sender_name, u.avatar_url AS sender_avatar,
                    u.profile_slug AS sender_slug
             FROM messages m
             INNER JOIN users u ON u.id = m.sender_id
             WHERE m.conversation_id = $1
               AND u.is_active = TRUE
             ORDER BY m.created_at DESC
             LIMIT 100`,
            [conversation.id]
        );

        res.json({
            ok: true,
            conversation,
            messages: messages.rows.reverse().map(m => ({
                id: Number(m.id),
                body: m.body,
                created_at: m.created_at,
                sender: {
                    id: Number(m.sender_id),
                    full_name: m.sender_name,
                    avatar_url: m.sender_avatar,
                    profile_slug: m.sender_slug || `u-${m.sender_id}`
                }
            }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not load community chat." });
    }
}));

app.post("/api/chat/community/messages", requireAuth(async (req, res) => {
    try {
        const body = String(req.body.body || "").trim();
        if (!body || body.length > 2000) {
            return res.status(400).json({ ok: false, message: "Message must contain 1-2000 characters." });
        }

        const conversation = await getOrCreateCommunityConversation();

        const result = await pool.query(
            `INSERT INTO messages (conversation_id, sender_id, body)
             VALUES ($1, $2, $3)
             RETURNING id, body, created_at`,
            [conversation.id, req.user.id, body]
        );

        res.status(201).json({
            ok: true,
            message: {
                id: Number(result.rows[0].id),
                body: result.rows[0].body,
                created_at: result.rows[0].created_at,
                sender: {
                    id: Number(req.user.id),
                    full_name: req.user.full_name,
                    avatar_url: req.user.avatar_url,
                    profile_slug: req.user.profile_slug || `u-${req.user.id}`
                }
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: "Could not send message." });
    }
}));
};

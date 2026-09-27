module.exports = function registerActivityRoutes(app, pool, requireAuth, requireRoles) {
  const allowedPages = new Set([
    "home","announcements","activities","schedule","notifications","login","registration",
    "profile","posts","create","chat","online-hub","assistant","admin","members","applications",
    "content","reports","owner","admins","users","private-chats","logs","settings","about"
  ]);

  app.post("/api/activity/heartbeat", requireAuth(async (req, res) => {
    try {
      const page = String(req.body?.page || "home").trim().slice(0, 120);
      const resourceType = req.body?.resource_type ? String(req.body.resource_type).trim().slice(0, 60) : null;
      const resourceId = req.body?.resource_id == null || req.body.resource_id === "" ? null : Number(req.body.resource_id);
      const eventType = String(req.body?.event_type || "heartbeat").trim().slice(0, 80);
      if (!allowedPages.has(page)) return res.status(400).json({ ok:false, message:"Invalid activity page." });
      if (resourceId !== null && !Number.isInteger(resourceId)) return res.status(400).json({ ok:false, message:"Invalid resource id." });

      const previous = await pool.query(
        "SELECT current_page, resource_type, resource_id, last_activity_at FROM user_activity WHERE user_id=$1",
        [req.user.id]
      );

      await pool.query(
        `INSERT INTO user_activity(user_id,current_page,resource_type,resource_id,last_activity_at,last_seen_at)
         VALUES($1,$2,$3,$4,NOW(),NOW())
         ON CONFLICT(user_id) DO UPDATE SET
           current_page=EXCLUDED.current_page,
           resource_type=EXCLUDED.resource_type,
           resource_id=EXCLUDED.resource_id,
           last_activity_at=NOW(),
           last_seen_at=NOW()`,
        [req.user.id, page, resourceType, resourceId]
      );

      await pool.query(
        "UPDATE users SET current_page=$1,last_seen_at=NOW() WHERE id=$2",
        [page, req.user.id]
      );

      const old = previous.rows[0];
      const changed = !old ||
        old.current_page !== page ||
        old.resource_type !== resourceType ||
        Number(old.resource_id || 0) !== Number(resourceId || 0) ||
        (Date.now() - new Date(old.last_activity_at).getTime()) > 60000;

      if (changed) {
        await pool.query(
          `INSERT INTO activity_events(user_id,page,resource_type,resource_id,event_type,metadata)
           VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
          [req.user.id, page, resourceType, resourceId, eventType, JSON.stringify({
            client_at: req.body?.client_at || null
          })]
        );
      }

      res.json({ ok:true, activity:{ page, resource_type:resourceType, resource_id:resourceId } });
    } catch (error) {
      console.error("activity heartbeat failed", error);
      res.status(500).json({ ok:false, message:"Could not save activity." });
    }
  }));

  app.get("/api/activity/me", requireAuth(async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT current_page,resource_type,resource_id,last_activity_at,last_seen_at FROM user_activity WHERE user_id=$1",
        [req.user.id]
      );
      res.json({ ok:true, activity:result.rows[0] || null });
    } catch (error) {
      console.error("activity read failed", error);
      res.status(500).json({ ok:false, message:"Could not read activity." });
    }
  }));

  app.get("/api/activity/users", requireRoles("admin","owner"), async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT ua.user_id,u.full_name,u.profile_slug,u.avatar_url,
                ua.current_page,ua.resource_type,ua.resource_id,ua.last_activity_at
         FROM user_activity ua
         JOIN users u ON u.id=ua.user_id
         WHERE u.is_active=TRUE
         ORDER BY ua.last_activity_at DESC
         LIMIT 500`
      );
      res.json({ ok:true, users:result.rows.map(x=>({ ...x, user_id:Number(x.user_id), resource_id:x.resource_id===null?null:Number(x.resource_id) })) });
    } catch (error) {
      console.error("activity users failed", error);
      res.status(500).json({ ok:false, message:"Could not read activity." });
    }
  });
};
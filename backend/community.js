module.exports = function registerCommunityRoutes(app, pool, requireAuth, requireRoles, getAuthenticatedUser) {
  app.get("/api/posts", async (req, res) => {
    try {
      const section = String(req.query.section || "community");
      const allowed = ["community", "announcements", "activities"];
      const safeSection = allowed.includes(section) ? section : "community";
      const viewer = await getAuthenticatedUser(req);
      const result = await pool.query(
        "SELECT p.id,p.section,p.title,p.body,p.image_url,p.is_pinned,p.created_at,p.author_id," +
        "u.full_name AS author_name,u.avatar_url AS author_avatar," +
        "COUNT(DISTINCT l.user_id)::int AS likes_count,COUNT(DISTINCT c.id)::int AS comments_count," +
        "CASE WHEN $2::bigint IS NULL THEN FALSE ELSE EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id=p.id AND pl.user_id=$2) END AS liked " +
        "FROM posts p JOIN users u ON u.id=p.author_id LEFT JOIN post_likes l ON l.post_id=p.id LEFT JOIN post_comments c ON c.post_id=p.id " +
        "WHERE p.section=$1 AND p.is_published=TRUE AND u.is_active=TRUE GROUP BY p.id,u.full_name,u.avatar_url " +
        "ORDER BY p.is_pinned DESC,p.created_at DESC LIMIT 100",
        [safeSection, viewer ? viewer.id : null]
      );
      res.json({ok:true,posts:result.rows});
    } catch(error) { console.error(error); res.status(500).json({ok:false,message:"Could not load posts."}); }
  });

  app.post("/api/posts", requireAuth(async (req,res) => {
    try {
      const section=["community","announcements","activities"].includes(req.body.section) ? req.body.section : "community";
      const body=String(req.body.body || "").trim();
      const title=req.body.title ? String(req.body.title).trim().slice(0,255) : null;
      const image=req.body.image_url || null;
      if(!body) return res.status(400).json({ok:false,message:"Post text is required."});
      if(body.length>5000) return res.status(400).json({ok:false,message:"Post is too long."});
      if(section!=="community" && !["admin","owner"].includes(req.user.role)) return res.status(403).json({ok:false,message:"Only administrators can publish in this section."});
      if(image && (typeof image!=="string" || image.length>3000000)) return res.status(400).json({ok:false,message:"Invalid image."});
      const result=await pool.query("INSERT INTO posts (author_id,section,title,body,image_url) VALUES ($1,$2,$3,$4,$5) RETURNING id,section,title,body,image_url,is_pinned,created_at",[req.user.id,section,title,body,image]);
      res.status(201).json({ok:true,post:result.rows[0]});
    } catch(error) { console.error(error); res.status(500).json({ok:false,message:"Could not create post."}); }
  }));

  app.post("/api/posts/:id/like", requireAuth(async (req,res) => {
    try {
      const id=Number(req.params.id);
      const existing=await pool.query("SELECT 1 FROM post_likes WHERE post_id=$1 AND user_id=$2",[id,req.user.id]);
      if(existing.rows.length) await pool.query("DELETE FROM post_likes WHERE post_id=$1 AND user_id=$2",[id,req.user.id]);
      else await pool.query("INSERT INTO post_likes (post_id,user_id) VALUES ($1,$2)",[id,req.user.id]);
      const count=await pool.query("SELECT COUNT(*)::int AS count FROM post_likes WHERE post_id=$1",[id]);
      res.json({ok:true,liked:!existing.rows.length,likes_count:count.rows[0].count});
    } catch(error) { console.error(error); res.status(500).json({ok:false,message:"Could not update like."}); }
  }));

  app.get("/api/posts/:id/comments", async (req,res) => {
    try {
      const result=await pool.query("SELECT c.id,c.body,c.created_at,c.author_id,u.full_name AS author_name,u.avatar_url AS author_avatar FROM post_comments c JOIN users u ON u.id=c.author_id WHERE c.post_id=$1 AND u.is_active=TRUE ORDER BY c.created_at ASC",[Number(req.params.id)]);
      res.json({ok:true,comments:result.rows});
    } catch(error) { console.error(error); res.status(500).json({ok:false,message:"Could not load comments."}); }
  });

  app.post("/api/posts/:id/comments", requireAuth(async (req,res) => {
    try {
      const body=String(req.body.body || "").trim();
      if(!body) return res.status(400).json({ok:false,message:"Comment is required."});
      if(body.length>1500) return res.status(400).json({ok:false,message:"Comment is too long."});
      const result=await pool.query("INSERT INTO post_comments (post_id,author_id,body) VALUES ($1,$2,$3) RETURNING id,body,created_at",[Number(req.params.id),req.user.id,body]);
      res.status(201).json({ok:true,comment:Object.assign({},result.rows[0],{author_id:req.user.id,author_name:req.user.full_name,author_avatar:req.user.avatar_url})});
    } catch(error) { console.error(error); res.status(500).json({ok:false,message:"Could not add comment."}); }
  }));

  app.patch("/api/posts/:id/pin", requireRoles("admin","owner"), async (req,res) => {
    try {
      const pinned=req.body.pinned===true;
      await pool.query("UPDATE posts SET is_pinned=$1,updated_at=NOW() WHERE id=$2",[pinned,Number(req.params.id)]);
      res.json({ok:true,pinned:pinned});
    } catch(error) { console.error(error); res.status(500).json({ok:false,message:"Could not update pinned state."}); }
  });

  app.delete("/api/posts/:id", requireAuth(async (req,res) => {
    try {
      const id=Number(req.params.id);
      const target=await pool.query("SELECT author_id FROM posts WHERE id=$1",[id]);
      if(!target.rows.length) return res.status(404).json({ok:false,message:"Post not found."});
      if(Number(target.rows[0].author_id)!==Number(req.user.id) && !["admin","owner"].includes(req.user.role)) return res.status(403).json({ok:false,message:"You cannot delete this post."});
      await pool.query("DELETE FROM posts WHERE id=$1",[id]);
      res.json({ok:true});
    } catch(error) { console.error(error); res.status(500).json({ok:false,message:"Could not delete post."}); }
  }));
};
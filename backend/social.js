const moduleExports = function(app, pool, requireAuth) {
  const normalizeIds = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger))];

  async function isMember(conversationId, userId) {
    const r = await pool.query("SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2 LIMIT 1", [conversationId, userId]);
    return r.rows.length > 0;
  }

  async function access(conversationId, userId) {
    const r = await pool.query("SELECT id,name,type,is_private,created_by FROM conversations WHERE id=$1 LIMIT 1", [conversationId]);
    if (!r.rows.length) return null;
    const c = r.rows[0];
    if (!c.is_private || ["public","community"].includes(c.type)) return c;
    return await isMember(conversationId, userId) ? c : null;
  }

  app.get("/api/friends", requireAuth(async (req,res)=>{
    const r=await pool.query("SELECT f.user_id,f.friend_id,f.status,f.created_at,u.id,u.full_name,u.avatar_url,u.profile_slug,u.academic_year FROM friendships f JOIN users u ON u.id=f.friend_id WHERE f.user_id=$1 AND f.status='accepted' ORDER BY u.full_name",[req.user.id]);
    res.json({ok:true,friends:r.rows});
  }));

  app.get("/api/friends/status/:userId", requireAuth(async (req,res)=>{
    const target=Number(req.params.userId);
    if(!Number.isInteger(target)||target===Number(req.user.id)) return res.json({ok:true,status:"self"});
    const r=await pool.query("SELECT user_id,friend_id,status FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1) ORDER BY CASE WHEN status='accepted' THEN 0 WHEN status='pending' THEN 1 ELSE 2 END LIMIT 1",[req.user.id,target]);
    if(!r.rows.length) return res.json({ok:true,status:"none"});
    const row=r.rows[0];
    if(row.status==="accepted") return res.json({ok:true,status:"friends"});
    res.json({ok:true,status:Number(row.user_id)===Number(req.user.id)?"pending_sent":"pending_received"});
  }));

  app.post("/api/friends/:userId/request", requireAuth(async (req,res)=>{
    const target=Number(req.params.userId);
    if(!Number.isInteger(target)||target===Number(req.user.id)) return res.status(400).json({ok:false,message:"Invalid friend."});
    const targetUser=await pool.query("SELECT id FROM users WHERE id=$1 AND is_active=TRUE LIMIT 1",[target]);
    if(!targetUser.rows.length) return res.status(404).json({ok:false,message:"Member not found."});
    const existing=await pool.query("SELECT user_id,friend_id,status FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1) LIMIT 1",[req.user.id,target]);
    if(existing.rows.length){
      const row=existing.rows[0];
      if(row.status==="accepted") return res.json({ok:true,status:"friends"});
      if(Number(row.user_id)===target){
        await pool.query("UPDATE friendships SET status='accepted' WHERE user_id=$1 AND friend_id=$2",[target,req.user.id]);
        await pool.query("INSERT INTO friendships(user_id,friend_id,status) VALUES($1,$2,'accepted') ON CONFLICT(user_id,friend_id) DO UPDATE SET status='accepted'",[req.user.id,target]);
        return res.json({ok:true,status:"friends"});
      }
      return res.json({ok:true,status:"pending_sent"});
    }
    await pool.query("INSERT INTO friendships(user_id,friend_id,status) VALUES($1,$2,'pending')",[req.user.id,target]);
    await pool.query("INSERT INTO user_notifications(recipient_id,actor_id,kind,title,body,source,reference_type,reference_id) VALUES($1,$2,'friend_request','طلب صداقة جديد',$3,'friend','user',$2)",[target,req.user.id,req.user.full_name+" أرسل لك طلب صداقة."]);
    res.status(201).json({ok:true,status:"pending_sent"});
  }));

  app.get("/api/friends/requests", requireAuth(async (req,res)=>{
    const r=await pool.query("SELECT f.user_id AS requester_id,u.full_name,u.avatar_url,u.profile_slug,u.academic_year,f.created_at FROM friendships f JOIN users u ON u.id=f.user_id WHERE f.friend_id=$1 AND f.status='pending' ORDER BY f.created_at DESC",[req.user.id]);
    res.json({ok:true,requests:r.rows});
  }));

  app.post("/api/friends/:userId/accept", requireAuth(async (req,res)=>{
    const requester=Number(req.params.userId);
    const r=await pool.query("SELECT 1 FROM friendships WHERE user_id=$1 AND friend_id=$2 AND status='pending'",[requester,req.user.id]);
    if(!r.rows.length) return res.status(404).json({ok:false,message:"Friend request not found."});
    await pool.query("UPDATE friendships SET status='accepted' WHERE user_id=$1 AND friend_id=$2",[requester,req.user.id]);
    await pool.query("INSERT INTO friendships(user_id,friend_id,status) VALUES($1,$2,'accepted') ON CONFLICT(user_id,friend_id) DO UPDATE SET status='accepted'",[req.user.id,requester]);
    res.json({ok:true,status:"friends"});
  }));

  app.post("/api/friends/:userId/reject", requireAuth(async (req,res)=>{
    await pool.query("DELETE FROM friendships WHERE user_id=$1 AND friend_id=$2 AND status='pending'",[Number(req.params.userId),req.user.id]);
    res.json({ok:true,status:"none"});
  }));

  app.delete("/api/friends/:userId", requireAuth(async (req,res)=>{
    const target=Number(req.params.userId);
    await pool.query("DELETE FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)",[req.user.id,target]);
    res.json({ok:true,status:"none"});
  }));

  app.get("/api/chat/users", requireAuth(async (req,res)=>{
    const q=String(req.query.q||"").trim();
    const params=[req.user.id];
    let where="u.is_active=TRUE AND u.id<>$1";
    if(q){params.push("%"+q+"%");where+=" AND (u.full_name ILIKE $2 OR COALESCE(u.student_id,'') ILIKE $2)";}
    const r=await pool.query("SELECT id,full_name,avatar_url,profile_slug,academic_year FROM users u WHERE "+where+" ORDER BY full_name LIMIT 40",params);
    res.json({ok:true,users:r.rows});
  }));

  app.get("/api/chat/conversations", requireAuth(async (req,res)=>{
    const r=await pool.query("SELECT DISTINCT c.id,c.name,c.type,c.is_private,c.created_at,COALESCE((SELECT m.body FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1),'') AS last_message,(SELECT m.created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at FROM conversations c LEFT JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=$1 WHERE (c.is_private=FALSE OR cm.user_id IS NOT NULL) ORDER BY last_message_at DESC NULLS LAST,c.created_at DESC",[req.user.id]);
    const conversations=[];
    for(const c of r.rows){
      const members=await pool.query("SELECT u.id,u.full_name,u.avatar_url,u.profile_slug FROM conversation_members cm JOIN users u ON u.id=cm.user_id WHERE cm.conversation_id=$1 ORDER BY u.full_name",[c.id]);
      conversations.push({...c,id:Number(c.id),members:members.rows});
    }
    res.json({ok:true,conversations});
  }));

  app.post("/api/chat/conversations", requireAuth(async (req,res)=>{
    const type=String(req.body.type||"group");
    const name=String(req.body.name||"").trim();
    const memberIds=normalizeIds(req.body.member_ids).filter(id=>id!==Number(req.user.id));
    if(!["direct","group","public"].includes(type)) return res.status(400).json({ok:false,message:"Invalid chat type."});
    if(type==="direct"&&memberIds.length!==1) return res.status(400).json({ok:false,message:"A private chat needs one other member."});
    if(type==="group"&&memberIds.length<1) return res.status(400).json({ok:false,message:"Choose at least one member."});
    if((type==="group"||type==="public")&&!name) return res.status(400).json({ok:false,message:"Chat name is required."});
    if(memberIds.length>100) return res.status(400).json({ok:false,message:"Too many members."});
    const ids=[Number(req.user.id),...memberIds];
    const valid=await pool.query("SELECT id FROM users WHERE id=ANY($1::bigint[]) AND is_active=TRUE",[ids]);
    if(valid.rows.length!==ids.length) return res.status(400).json({ok:false,message:"One or more members are invalid."});
    if(type==="direct"){
      const existing=await pool.query("SELECT c.id,c.name,c.type,c.is_private FROM conversations c WHERE c.type='direct' AND c.is_private=TRUE AND (SELECT COUNT(*) FROM conversation_members x WHERE x.conversation_id=c.id)=2 AND EXISTS(SELECT 1 FROM conversation_members x WHERE x.conversation_id=c.id AND x.user_id=$1) AND EXISTS(SELECT 1 FROM conversation_members x WHERE x.conversation_id=c.id AND x.user_id=$2) LIMIT 1",[req.user.id,memberIds[0]]);
      if(existing.rows.length) return res.json({ok:true,conversation:existing.rows[0]});
    }
    const created=await pool.query("INSERT INTO conversations(name,type,is_private,created_by) VALUES($1,$2,$3,$4) RETURNING id,name,type,is_private,created_by,created_at",[type==="direct"?null:name,type,type!=="public",req.user.id]);
    const conversation=created.rows[0];
    for(const id of ids) await pool.query("INSERT INTO conversation_members(conversation_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[conversation.id,id]);
    res.status(201).json({ok:true,conversation});
  }));

  app.get("/api/chat/conversations/:id/messages", requireAuth(async (req,res)=>{
    const id=Number(req.params.id);
    if(!Number.isInteger(id)) return res.status(400).json({ok:false,message:"Invalid conversation."});
    const conversation=await access(id,Number(req.user.id));
    if(!conversation) return res.status(403).json({ok:false,message:"You do not have access to this chat."});
    const r=await pool.query("SELECT m.id,m.body,m.created_at,m.sender_id,u.full_name AS sender_name,u.avatar_url AS sender_avatar,u.profile_slug AS sender_slug FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=$1 ORDER BY m.created_at ASC LIMIT 300",[id]);
    await pool.query("UPDATE messages SET is_read=TRUE WHERE conversation_id=$1 AND sender_id<>$2",[id,req.user.id]);
    res.json({ok:true,conversation,messages:r.rows.map(m=>({id:Number(m.id),body:m.body,created_at:m.created_at,sender:{id:Number(m.sender_id),full_name:m.sender_name,avatar_url:m.sender_avatar,profile_slug:m.sender_slug}}))});
  }));

  app.post("/api/chat/conversations/:id/messages", requireAuth(async (req,res)=>{
    const id=Number(req.params.id);
    const body=String(req.body.body||"").trim();
    if(!Number.isInteger(id)||!body||body.length>4000) return res.status(400).json({ok:false,message:"Message must contain 1-4000 characters."});
    const conversation=await access(id,Number(req.user.id));
    if(!conversation) return res.status(403).json({ok:false,message:"You do not have access to this chat."});
    const r=await pool.query("INSERT INTO messages(conversation_id,sender_id,body) VALUES($1,$2,$3) RETURNING id,body,created_at",[id,req.user.id,body]);
    res.status(201).json({ok:true,message:{id:Number(r.rows[0].id),body:r.rows[0].body,created_at:r.rows[0].created_at,sender:{id:Number(req.user.id),full_name:req.user.full_name,avatar_url:req.user.avatar_url,profile_slug:req.user.profile_slug||"u-"+req.user.id}}});
  }));
};

module.exports = moduleExports;

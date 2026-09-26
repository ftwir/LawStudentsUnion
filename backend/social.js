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

  app.get("/api/chat/private-channels", requireAuth(async (req,res)=>{
    if(!["owner","admin"].includes(req.user.role)) return res.status(403).json({ok:false,message:"غير مصرح."});
    const r=await pool.query("SELECT c.id,c.name,c.type,c.is_private,c.created_at,COUNT(cm.user_id)::int AS member_count FROM conversations c LEFT JOIN conversation_members cm ON cm.conversation_id=c.id WHERE c.is_private=TRUE GROUP BY c.id ORDER BY c.created_at DESC");
    res.json({ok:true,conversations:r.rows});
  }));

  app.get("/api/chat/conversations", requireAuth(async (req,res)=>{
    const r=await pool.query("SELECT DISTINCT c.id,c.name,c.description,c.cover_image_url,c.hashtags,c.type,c.is_private,c.created_at,c.host_user_id,c.messaging_paused,c.voice_room_active,COALESCE((SELECT m.body FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1),'') AS last_message,(SELECT m.created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at FROM conversations c LEFT JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=$1 WHERE (c.is_private=FALSE OR cm.user_id IS NOT NULL) ORDER BY last_message_at DESC NULLS LAST,c.created_at DESC",[req.user.id]);
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
    const description=String(req.body.description||"").trim().slice(0,1000);
    const hashtags=[...new Set((Array.isArray(req.body.hashtags)?req.body.hashtags:[]).map(x=>String(x||"").trim().replace(/^#/,'').replace(/[^\p{L}\p{N}_-]/gu,'').slice(0,40)).filter(Boolean))].slice(0,12);
    const coverImage=req.body.cover_image_url||null;
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
    const created=await pool.query("INSERT INTO conversations(name,description,cover_image_url,hashtags,type,is_private,created_by,host_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,name,description,cover_image_url,hashtags,type,is_private,created_by,host_user_id,created_at,messaging_paused,voice_room_active",[type==="direct"?null:name,description||null,coverImage,hashtags,type,type!=="public",req.user.id,type==="direct"?null:req.user.id]);
    const conversation=created.rows[0];
    for(const id of ids) await pool.query("INSERT INTO conversation_members(conversation_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(conversation_id,user_id) DO UPDATE SET role=EXCLUDED.role",[conversation.id,id,type==="direct"?"member":(id===Number(req.user.id)?"host":"member")]);
    res.status(201).json({ok:true,conversation});
  }));

  app.get("/api/chat/conversations/:id/details", requireAuth(async (req,res)=>{
    const id=Number(req.params.id);
    const conversation=await access(id,Number(req.user.id));
    if(!conversation) return res.status(403).json({ok:false,message:"لا تملك صلاحية الوصول إلى هذه الدردشة."});
    const r=await pool.query("SELECT c.id,c.name,c.description,c.cover_image_url,c.hashtags,c.type,c.is_private,c.created_by,c.host_user_id,c.messaging_paused,c.voice_room_active,cm.role AS my_role FROM conversations c LEFT JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=$2 WHERE c.id=$1",[id,req.user.id]);
    if(!r.rows.length) return res.status(404).json({ok:false,message:"الدردشة غير موجودة."});
    const members=await pool.query("SELECT u.id,u.full_name,u.avatar_url,u.profile_slug,cm.role FROM conversation_members cm JOIN users u ON u.id=cm.user_id WHERE cm.conversation_id=$1 ORDER BY CASE cm.role WHEN 'host' THEN 0 WHEN 'cohost' THEN 1 ELSE 2 END,u.full_name",[id]);
    res.json({ok:true,conversation:{...r.rows[0],id:Number(r.rows[0].id),members:members.rows.map(x=>({...x,id:Number(x.id)}))}});
  }));

  async function canManageChat(id,userId){
    const r=await pool.query("SELECT c.*,cm.role AS member_role FROM conversations c LEFT JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=$2 WHERE c.id=$1",[id,userId]);
    if(!r.rows.length) return null;
    const c=r.rows[0];
    const isHost=Number(c.host_user_id)===Number(userId);
    const isCohost=c.member_role==="cohost";
    const privileged=isHost||isCohost||["owner"].includes(String(reqUserRolePlaceholder));
    return {c,isHost,isCohost};
  }

  app.patch("/api/chat/conversations/:id", requireAuth(async (req,res)=>{
    const id=Number(req.params.id);
    if(!Number.isInteger(id)) return res.status(400).json({ok:false,message:"Invalid conversation."});
    const accessRow=await access(id,Number(req.user.id));
    if(!accessRow) return res.status(403).json({ok:false,message:"لا تملك صلاحية الوصول إلى هذه الدردشة."});
    const r=await pool.query("SELECT host_user_id,type FROM conversations WHERE id=$1",[id]);
    const member=await pool.query("SELECT role FROM conversation_members WHERE conversation_id=$1 AND user_id=$2",[id,req.user.id]);
    const isHost=Number(r.rows[0]?.host_user_id)===Number(req.user.id);
    const isCohost=member.rows[0]?.role==="cohost";
    if(!isHost&&!isCohost&&req.user.role!=="owner") return res.status(403).json({ok:false,message:"هذه الصلاحية للمضيف والمضيفين المشاركين فقط."});
    const fields=[];const values=[];let n=1;
    if(req.body.name!==undefined){fields.push("name=$"+n++);values.push(String(req.body.name||"").trim().slice(0,150)||null);}
    if(req.body.description!==undefined){fields.push("description=$"+n++);values.push(String(req.body.description||"").trim().slice(0,1000)||null);}
    if(req.body.cover_image_url!==undefined){fields.push("cover_image_url=$"+n++);values.push(req.body.cover_image_url||null);}
    if(req.body.hashtags!==undefined){const tags=[...new Set((Array.isArray(req.body.hashtags)?req.body.hashtags:[]).map(x=>String(x||"").trim().replace(/^#/,'').replace(/[^\p{L}\p{N}_-]/gu,'').slice(0,40)).filter(Boolean))].slice(0,12);fields.push("hashtags=$"+n++);values.push(tags);}
    if(!fields.length)return res.status(400).json({ok:false,message:"لا توجد تغييرات."});
    values.push(id);
    await pool.query("UPDATE conversations SET "+fields.join(",") +" WHERE id=$"+n,values);
    res.json({ok:true});
  }));

  app.post("/api/chat/conversations/:id/cohosts", requireAuth(async (req,res)=>{
    const id=Number(req.params.id), target=Number(req.body.user_id);
    if(!Number.isInteger(id)||!Number.isInteger(target)) return res.status(400).json({ok:false,message:"بيانات غير صالحة."});
    const c=await pool.query("SELECT host_user_id FROM conversations WHERE id=$1",[id]);
    if(!c.rows.length||Number(c.rows[0].host_user_id)!==Number(req.user.id)) return res.status(403).json({ok:false,message:"المضيف فقط يستطيع ترقية co-hosts."});
    if(target===Number(req.user.id)) return res.status(400).json({ok:false,message:"المضيف لا يحتاج إلى هذه الرتبة."});
    const count=await pool.query("SELECT COUNT(*)::int AS n FROM conversation_members WHERE conversation_id=$1 AND role='cohost'",[id]);
    if(count.rows[0].n>=3) return res.status(400).json({ok:false,message:"الحد الأقصى 3 مضيفين مشاركين."});
    const member=await pool.query("SELECT role FROM conversation_members WHERE conversation_id=$1 AND user_id=$2",[id,target]);
    if(!member.rows.length)return res.status(404).json({ok:false,message:"العضو غير موجود في الدردشة."});
    await pool.query("UPDATE conversation_members SET role='cohost' WHERE conversation_id=$1 AND user_id=$2",[id,target]);
    res.json({ok:true});
  }));

  app.delete("/api/chat/conversations/:id/cohosts/:userId", requireAuth(async (req,res)=>{
    const id=Number(req.params.id), target=Number(req.params.userId);
    const c=await pool.query("SELECT host_user_id FROM conversations WHERE id=$1",[id]);
    if(!c.rows.length||Number(c.rows[0].host_user_id)!==Number(req.user.id)) return res.status(403).json({ok:false,message:"المضيف فقط يستطيع تخفيض رتبة co-host."});
    await pool.query("UPDATE conversation_members SET role='member' WHERE conversation_id=$1 AND user_id=$2 AND role='cohost'",[id,target]);
    res.json({ok:true});
  }));

  app.delete("/api/chat/conversations/:id/members/:userId", requireAuth(async (req,res)=>{
    const id=Number(req.params.id), target=Number(req.params.userId);
    const accessRow=await access(id,Number(req.user.id));
    if(!accessRow)return res.status(403).json({ok:false,message:"لا تملك صلاحية الوصول."});
    const actor=await pool.query("SELECT c.host_user_id,cm.role FROM conversations c LEFT JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=$2 WHERE c.id=$1",[id,req.user.id]);
    if(!actor.rows.length)return res.status(404).json({ok:false,message:"الدردشة غير موجودة."});
    const isHost=Number(actor.rows[0].host_user_id)===Number(req.user.id);
    const isCohost=actor.rows[0].role==="cohost";
    if(!isHost&&!isCohost&&req.user.role!=="owner")return res.status(403).json({ok:false,message:"فقط المضيف أو co-host يستطيع طرد الأعضاء."});
    if(target===Number(req.user.id))return res.status(400).json({ok:false,message:"لا يمكنك طرد نفسك."});
    const targetRow=await pool.query("SELECT role FROM conversation_members WHERE conversation_id=$1 AND user_id=$2",[id,target]);
    if(!targetRow.rows.length)return res.status(404).json({ok:false,message:"العضو غير موجود."});
    if(targetRow.rows[0].role==="host")return res.status(403).json({ok:false,message:"لا يمكن طرد المضيف."});
    if(targetRow.rows[0].role==="cohost" && !isHost && req.user.role!=="owner")return res.status(403).json({ok:false,message:"فقط المضيف يستطيع طرد co-host."});
    await pool.query("DELETE FROM conversation_members WHERE conversation_id=$1 AND user_id=$2",[id,target]);
    res.json({ok:true});
  }));

  app.patch("/api/chat/conversations/:id/pause", requireAuth(async (req,res)=>{
    const id=Number(req.params.id);
    const member=await pool.query("SELECT role FROM conversation_members WHERE conversation_id=$1 AND user_id=$2",[id,req.user.id]);
    const c=await pool.query("SELECT host_user_id FROM conversations WHERE id=$1",[id]);
    const isHost=Number(c.rows[0]?.host_user_id)===Number(req.user.id);
    const isCohost=member.rows[0]?.role==="cohost";
    if(!isHost&&!isCohost&&req.user.role!=="owner")return res.status(403).json({ok:false,message:"هذه الصلاحية للمضيف أو co-host."});
    await pool.query("UPDATE conversations SET messaging_paused=$1 WHERE id=$2",[req.body.paused===true,id]);
    res.json({ok:true,paused:req.body.paused===true});
  }));

  app.patch("/api/chat/conversations/:id/voice", requireAuth(async (req,res)=>{
    const id=Number(req.params.id);
    const member=await pool.query("SELECT role FROM conversation_members WHERE conversation_id=$1 AND user_id=$2",[id,req.user.id]);
    const c=await pool.query("SELECT host_user_id FROM conversations WHERE id=$1",[id]);
    const isHost=Number(c.rows[0]?.host_user_id)===Number(req.user.id);
    const isCohost=member.rows[0]?.role==="cohost";
    if(!isHost&&!isCohost&&req.user.role!=="owner")return res.status(403).json({ok:false,message:"هذه الصلاحية للمضيف أو co-host."});
    await pool.query("UPDATE conversations SET voice_room_active=$1 WHERE id=$2",[req.body.active===true,id]);
    res.json({ok:true,active:req.body.active===true});
  }));

  app.delete("/api/chat/conversations/:id", requireAuth(async (req,res)=>{
    const id=Number(req.params.id);
    if(!Number.isInteger(id)) return res.status(400).json({ok:false,message:"Invalid conversation."});
    const found=await pool.query("SELECT id,type,is_private,created_by,host_user_id FROM conversations WHERE id=$1",[id]);
    if(!found.rows.length) return res.status(404).json({ok:false,message:"الدردشة غير موجودة."});
    const c=found.rows[0];
    const isOwner=req.user.role==="owner";
    const isAdmin=req.user.role==="admin";
    const member=await pool.query("SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2",[id,req.user.id]);
    const isMember=member.rows.length>0;
    const isDirect=c.type==="direct";
    const isHost=Number(c.host_user_id)===Number(req.user.id);
    const allowed=isOwner || (isAdmin && c.type==="public") || (isDirect && isMember) || (c.is_private && isHost);
    if(!allowed) return res.status(403).json({ok:false,message:"لا تملك صلاحية حذف هذه الدردشة."});
    await pool.query("DELETE FROM conversations WHERE id=$1",[id]);
    await pool.query("INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,details) VALUES($1,$2,$3,$4,$5)",[
      req.user.id,"chat_deleted","conversation",id,JSON.stringify({type:c.type,is_private:c.is_private,deleted_by_role:req.user.role})
    ]);
    res.json({ok:true});
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
    if(conversation.messaging_paused && !["owner","admin"].includes(req.user.role)) return res.status(423).json({ok:false,message:"تم إيقاف الإرسال مؤقتاً في هذه الدردشة."});
    const r=await pool.query("INSERT INTO messages(conversation_id,sender_id,body) VALUES($1,$2,$3) RETURNING id,body,created_at",[id,req.user.id,body]);
    res.status(201).json({ok:true,message:{id:Number(r.rows[0].id),body:r.rows[0].body,created_at:r.rows[0].created_at,sender:{id:Number(req.user.id),full_name:req.user.full_name,avatar_url:req.user.avatar_url,profile_slug:req.user.profile_slug||"u-"+req.user.id}}});
  }));
};

module.exports = moduleExports;

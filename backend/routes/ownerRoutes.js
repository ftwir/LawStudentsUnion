const express = require("express");
const crypto = require("crypto");

function createOwnerRouter(pool) {
  const router = express.Router();

  async function authenticateOwner(req,res,next){
    try{
      const authorization=req.headers.authorization||"";
      if(!authorization.startsWith("Bearer ")){
        return res.status(401).json({ok:false,message:"Owner authentication required."});
      }
      const token=authorization.slice(7).trim();
      if(!token)return res.status(401).json({ok:false,message:"Owner authentication required."});
      const tokenHash=crypto.createHash("sha256").update(token).digest("hex");
      const result=await pool.query(
        `SELECT u.id,u.role,u.is_active
         FROM sessions s JOIN users u ON u.id=s.user_id
         WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.is_active=TRUE AND u.role='owner'
         LIMIT 1`,
        [tokenHash]
      );
      if(!result.rows.length)return res.status(401).json({ok:false,message:"Valid owner session required."});
      req.owner=result.rows[0];
      next();
    }catch(error){
      console.error("owner authentication failed",error);
      res.status(500).json({ok:false,message:"Owner authentication failed."});
    }
  }

  router.use(authenticateOwner);

  router.get("/status",async(req,res)=>{
    try{
      const [users,sessions,activities,pending]=await Promise.all([
        pool.query("SELECT COUNT(*)::int AS count FROM users"),
        pool.query("SELECT COUNT(*)::int AS count FROM sessions WHERE expires_at>NOW()"),
        pool.query("SELECT COUNT(*)::int AS count FROM user_activity WHERE last_activity_at>NOW()-INTERVAL '2 minutes'"),
        pool.query("SELECT COUNT(*)::int AS count FROM registrations WHERE status='pending' AND archived_at IS NULL")
      ]);
      res.json({ok:true,ownerId:Number(req.owner.id),database:"connected",metrics:{
        users:users.rows[0].count,
        activeSessions:sessions.rows[0].count,
        activeUsers:activities.rows[0].count,
        pendingRegistrations:pending.rows[0].count
      }});
    }catch(error){
      console.error(error);
      res.status(500).json({ok:false,message:"Could not read owner status."});
    }
  });

  router.get("/users",async(req,res)=>{
    try{
      const result=await pool.query(
        `SELECT id,full_name,student_id,email,phone,role,is_active,last_login,created_at
         FROM users ORDER BY id DESC LIMIT 1000`
      );
      res.json({ok:true,users:result.rows});
    }catch(error){
      console.error(error);
      res.status(500).json({ok:false,message:"Could not read users."});
    }
  });

  router.get("/audit",async(req,res)=>{
    try{
      const result=await pool.query(
        `SELECT a.*,u.full_name AS actor_name,u.role AS actor_role
         FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id
         ORDER BY a.created_at DESC LIMIT 500`
      );
      res.json({ok:true,events:result.rows});
    }catch(error){
      console.error(error);
      res.status(500).json({ok:false,message:"Could not read audit log."});
    }
  });

  router.get("/activity",async(req,res)=>{
    try{
      const result=await pool.query(
        `SELECT ua.user_id,u.full_name,u.profile_slug,u.avatar_url,ua.current_page,
                ua.resource_type,ua.resource_id,ua.last_activity_at
         FROM user_activity ua JOIN users u ON u.id=ua.user_id
         ORDER BY ua.last_activity_at DESC LIMIT 500`
      );
      res.json({ok:true,users:result.rows});
    }catch(error){
      console.error(error);
      res.status(500).json({ok:false,message:"Could not read activity."});
    }
  });

  const dataViews={
    announcements:`SELECT id,title,body,created_at FROM announcements ORDER BY created_at DESC LIMIT $1`,
    activities:`SELECT id,title,body,event_date,created_at FROM activities ORDER BY created_at DESC LIMIT $1`,
    schedules:`SELECT * FROM schedules ORDER BY id DESC LIMIT $1`,
    posts:`SELECT id,author_id,section,title,body,content_type,hashtags,is_published,is_pinned,created_at,updated_at FROM posts ORDER BY created_at DESC LIMIT $1`,
    post_likes:`SELECT id,post_id,user_id,created_at FROM post_likes ORDER BY id DESC LIMIT $1`,
    post_comments:`SELECT id,post_id,author_id,body,created_at FROM post_comments ORDER BY id DESC LIMIT $1`,
    conversations:`SELECT id,name,type,is_private,created_by,host_user_id,messaging_paused,voice_room_active,created_at FROM conversations ORDER BY id DESC LIMIT $1`,
    conversation_members:`SELECT conversation_id,user_id,role,is_muted,inbox_position_at,joined_at FROM conversation_members ORDER BY conversation_id DESC LIMIT $1`,
    messages:`SELECT id,conversation_id,sender_id,body,created_at,is_read FROM messages ORDER BY id DESC LIMIT $1`,
    notifications:`SELECT id,user_id,type,title,body,created_at FROM notifications ORDER BY id DESC LIMIT $1`,
    user_notifications:`SELECT id,recipient_id,actor_id,kind,title,body,source,reference_type,reference_id,is_read,created_at FROM user_notifications ORDER BY id DESC LIMIT $1`,
    friendships:`SELECT user_id,friend_id,status,created_at FROM friendships ORDER BY created_at DESC LIMIT $1`,
    registrations:`SELECT id,user_id,full_name,student_id,academic_year,email,phone,note,status,rejection_reason,created_at FROM registrations ORDER BY id DESC LIMIT $1`,
    registration_checks:`SELECT id,registration_id,risk_level,score,flags,checked_by,created_at FROM registration_checks ORDER BY id DESC LIMIT $1`,
    polls:`SELECT id,author_id,question,options,hashtags,duration_minutes,closes_at,allow_vote_change,anonymous,results_visibility,created_at FROM polls ORDER BY id DESC LIMIT $1`,
    poll_votes:`SELECT poll_id,user_id,option_index,created_at FROM poll_votes ORDER BY poll_id DESC LIMIT $1`,
    audit_logs:`SELECT id,actor_user_id,action,target_type,target_id,details,created_at FROM audit_logs ORDER BY id DESC LIMIT $1`,
    user_activity:`SELECT user_id,current_page,resource_type,resource_id,last_activity_at,last_seen_at FROM user_activity ORDER BY last_activity_at DESC LIMIT $1`,
    activity_events:`SELECT id,user_id,page,resource_type,resource_id,event_type,metadata,created_at FROM activity_events ORDER BY id DESC LIMIT $1`,
    agent_actions:`SELECT id,actor_user_id,action_type,target_type,target_id,status,details,created_at FROM agent_actions ORDER BY id DESC LIMIT $1`,
    app_settings:`SELECT key,value,updated_by,updated_at FROM app_settings ORDER BY key LIMIT $1`,
    users:`SELECT id,full_name,student_id,email,phone,academic_year,bio,avatar_url,profile_background_url,role,is_active,profile_slug,privacy_settings,notification_settings,created_at,last_login,last_seen_at,current_page FROM users ORDER BY id DESC LIMIT $1`
  };

  router.get("/database-summary",async(req,res)=>{
    try{
      const tables=Object.keys(dataViews);
      const counts=await Promise.all(tables.map(async table=>{
        const result=await pool.query("SELECT COUNT(*)::int AS count FROM "+table);
        return [table,result.rows[0].count];
      }));
      res.json({ok:true,tables:Object.fromEntries(counts),protected:["sessions","membership_activation_tokens"]});
    }catch(error){
      console.error(error);
      res.status(500).json({ok:false,message:"Could not read database summary."});
    }
  });

  router.get("/database/:table",async(req,res)=>{
    try{
      const table=String(req.params.table||"");
      const query=dataViews[table];
      if(!query)return res.status(404).json({ok:false,message:"This data view is not available."});
      const requested=Number(req.query.limit||100);
      const limit=Math.min(Math.max(Number.isInteger(requested)?requested:100,1),200);
      const result=await pool.query(query,[limit]);
      res.json({ok:true,table,rows:result.rows});
    }catch(error){
      console.error(error);
      res.status(500).json({ok:false,message:"Could not read data view."});
    }
  });

  router.post("/agent-actions",async(req,res)=>{
    try{
      const {action_type,target_type,target_id,status="completed",details={}}=req.body||{};
      if(!action_type)return res.status(400).json({ok:false,message:"action_type is required."});
      const result=await pool.query(
        `INSERT INTO agent_actions(actor_user_id,action_type,target_type,target_id,status,details)
         VALUES($1,$2,$3,$4,$5,$6::jsonb)
         RETURNING id,created_at`,
        [req.owner.id,String(action_type).slice(0,80),target_type?String(target_type).slice(0,80):null,target_id==null?null:Number(target_id),String(status).slice(0,20),JSON.stringify(details||{})]
      );
      res.status(201).json({ok:true,action:{id:Number(result.rows[0].id),created_at:result.rows[0].created_at}});
    }catch(error){
      console.error(error);
      res.status(500).json({ok:false,message:"Could not record agent action."});
    }
  });

  return router;
}

module.exports={createOwnerRouter};

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

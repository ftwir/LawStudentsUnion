const express = require('express');
const { query, transaction } = require('../db');
const { hash, hashDevice, token, hashPassword, verifyPassword, getToken, setSessionCookie, clearSessionCookie, publicUser } = require('../security');
const { evaluateRegistration, normalizePhone } = require('../services/intelligence');

function makeRouter() {
  const router = express.Router();

  async function userFromToken(rawToken, managerOnly = false) {
    if (!rawToken) return null;
    const result = await query(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.is_active=TRUE
      ${managerOnly ? "AND s.session_type='manager' AND u.role='owner'" : ""} LIMIT 1`, [hash(rawToken)]);
    return result.rows[0] || null;
  }

  async function userFromRequest(req, managerOnly = false) {
    const raw=getToken(req);
    const user = await userFromToken(raw, managerOnly);
    if (user && raw) await query('UPDATE sessions SET last_used_at=NOW() WHERE token_hash=$1', [hash(raw)]).catch(() => {});
    return user;
  }

  function requireAuth(handler, managerOnly = false) {
    return async (req,res,next) => {
      try {
        const user = await userFromRequest(req, managerOnly);
        if (!user) return res.status(managerOnly ? 403 : 401).json({ok:false,message:'Authentication required.'});
        req.user = user;
        return handler(req,res,next);
      } catch (error) {
        console.error('auth middleware:', error.message);
        return res.status(500).json({ok:false,message:'Authentication check failed.'});
      }
    };
  }

  async function createSession(user, sessionType, req, res) {
    const raw = token();
    const deviceId = String(req.headers['x-device-id'] || 'browser');
    await query(`INSERT INTO sessions(user_id,token_hash,session_type,device_hash,expires_at)
      VALUES($1,$2,$3,$4,NOW()+INTERVAL '30 days')`, [user.id,hash(raw),sessionType,hashDevice(deviceId)]);
    setSessionCookie(res, raw);
    return raw;
  }

  async function login(req,res,{managerOnly=false}={}) {
    const identifier = String(req.body?.identifier || '').trim();
    const password = String(req.body?.password || '');
    if (!identifier || !password) return res.status(400).json({ok:false,message:'المعرف وكلمة المرور مطلوبان.'});
    const result = await query(`SELECT * FROM users
      WHERE LOWER(TRIM(COALESCE(student_id,'')))=LOWER($1)
         OR LOWER(TRIM(COALESCE(email,'')))=LOWER($1)
         OR regexp_replace(COALESCE(phone,''),'[^0-9+]','','g')=regexp_replace($1,'[^0-9+]','','g')
      LIMIT 1`, [identifier]);
    const user=result.rows[0];
    if(!user||!user.is_active||(managerOnly&&user.role!=='owner'))return res.status(401).json({ok:false,message:'بيانات الدخول غير صحيحة أو لا تملك الصلاحية.'});
    const deviceHash=hashDevice(String(req.headers['x-device-id']||'browser'));
    const sanction=await query(`SELECT 1 FROM user_sanctions WHERE ((user_id=$1 AND kind='ban') OR (device_hash=$2 AND kind='device_ban')) AND (expires_at IS NULL OR expires_at>NOW()) LIMIT 1`,[user.id,deviceHash]);
    if(sanction.rowCount)return res.status(403).json({ok:false,message:'تم تقييد الوصول لهذا الحساب أو الجهاز.'});
    if(!(await verifyPassword(password,user.password_hash)))return res.status(401).json({ok:false,message:'بيانات الدخول غير صحيحة.'});
    const sessionType=managerOnly?'manager':'member';
    const sessionToken=await createSession(user,sessionType,req,res);
    await query(`UPDATE users SET last_login=NOW(),last_seen_at=NOW(),current_page=$2 WHERE id=$1`,[user.id,managerOnly?'manager':'home']);
    await query(`INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,details) VALUES($1,$2,$3,$4,$5)`,[user.id,managerOnly?'manager_login':'login','user',user.id,JSON.stringify({session_type:sessionType})]);
    return res.json({ok:true,token:sessionToken,user:publicUser(user,user.id)});
  }

  router.post('/register', async (req,res) => {
    try {const input=req.body||{};const full_name=String(input.full_name||'').trim();const student_id=String(input.student_id||'').trim();const password=String(input.password||'');const phone=normalizePhone(input.phone);const email=String(input.email||'').trim().toLowerCase();
      if(full_name.length<4||student_id.length<2||password.length<8)return res.status(400).json({ok:false,message:'أدخل الاسم والرقم الدراسي وكلمة مرور من 8 أحرف على الأقل.'});
      const existing=await query(`SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(student_id)=LOWER($1)) AS student_id_exists,EXISTS(SELECT 1 FROM users WHERE $2<>'' AND LOWER(email)=LOWER($2)) AS email_exists,EXISTS(SELECT 1 FROM users WHERE $3<>'' AND regexp_replace(phone,'[^0-9+]','','g')=$3) AS phone_exists,EXISTS(SELECT 1 FROM registrations WHERE LOWER(student_id)=LOWER($1) AND status='pending') AS pending_exists`,[student_id,email,phone]);
      const db=existing.rows[0];const assessment=evaluateRegistration({full_name,student_id,phone,email},{studentIdExists:db.student_id_exists,emailExists:db.email_exists,phoneExists:db.phone_exists,pendingRegistrationExists:db.pending_exists});
      if(db.student_id_exists||db.email_exists||db.phone_exists||db.pending_exists)return res.status(409).json({ok:false,message:'يوجد حساب أو طلب عضوية مرتبط بهذه البيانات بالفعل.',assessment});
      const password_hash=await hashPassword(password);const created=await transaction(async client=>{const r=await client.query(`INSERT INTO registrations(full_name,student_id,year,academic_year,email,phone,note,password_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,created_at,status`,[full_name,student_id,input.year||input.academic_year||null,input.academic_year||null,email||null,phone||null,String(input.note||'').slice(0,2000),password_hash]);await client.query(`INSERT INTO registration_checks(registration_id,risk_level,score,flags,details) VALUES($1,$2,$3,$4,$5)`,[r.rows[0].id,assessment.risk_level,assessment.score,JSON.stringify(assessment.flags),JSON.stringify(assessment.normalized)]);return r.rows[0]});
      res.status(201).json({ok:true,message:'تم استلام طلب العضوية. بعد اعتماد الطلب ستتمكن من تفعيل الحساب.',registration:created,assessment});
    }catch(error){console.error('register:',error);res.status(500).json({ok:false,message:'تعذر حفظ طلب العضوية.'});}}
  );
  router.get('/registration-status',async(req,res)=>{const studentId=String(req.query.student_id||'').trim();if(!studentId)return res.status(400).json({ok:false,message:'أدخل الرقم الدراسي.'});const result=await query(`SELECT id,status,created_at,reviewed_at,rejection_reason FROM registrations WHERE student_id=$1 ORDER BY id DESC LIMIT 1`,[studentId]);if(!result.rowCount)return res.status(404).json({ok:false,message:'لا يوجد طلب عضوية بهذا الرقم.'});res.json({ok:true,registration:result.rows[0]});});
  router.post('/activate',async(req,res)=>{const student_id=String(req.body?.student_id||'').trim();const password=String(req.body?.password||'');if(!student_id||password.length<8)return res.status(400).json({ok:false,message:'الرقم الدراسي وكلمة المرور مطلوبان.'});try{const created=await transaction(async client=>{const reg=await client.query(`SELECT * FROM registrations WHERE student_id=$1 AND status='approved' AND user_id IS NULL ORDER BY id DESC LIMIT 1`,[student_id]);if(!reg.rowCount)throw Object.assign(new Error('APPROVED_REGISTRATION_NOT_FOUND'),{code:'APPROVED_REGISTRATION_NOT_FOUND'});const r=reg.rows[0];const pwd=r.password_hash||await hashPassword(password);if(r.password_hash&&!(await verifyPassword(password,r.password_hash)))throw Object.assign(new Error('PASSWORD_MISMATCH'),{code:'PASSWORD_MISMATCH'});const user=await client.query(`INSERT INTO users(full_name,student_id,email,phone,academic_year,password_hash,last_seen_at,current_page) VALUES($1,$2,$3,$4,$5,$6,NOW(),'home') RETURNING *`,[r.full_name,r.student_id,r.email,r.phone,r.academic_year,pwd]);await client.query(`UPDATE registrations SET user_id=$1,reviewed_at=COALESCE(reviewed_at,NOW()) WHERE id=$2`,[user.rows[0].id,r.id]);await client.query(`INSERT INTO user_notifications(recipient_id,kind,title,body,reference_type,reference_id) VALUES($1,'registration','تم تفعيل العضوية','تم إنشاء حسابك ويمكنك الآن تسجيل الدخول.','registration',$2)`,[user.rows[0].id,r.id]);return user.rows[0]});const sessionToken=await createSession(created,'member',req,res);res.status(201).json({ok:true,token:sessionToken,user:publicUser(created,created.id)});}catch(error){if(error.code==='APPROVED_REGISTRATION_NOT_FOUND')return res.status(404).json({ok:false,message:'لا يوجد طلب معتمد جاهز للتفعيل.'});if(error.code==='PASSWORD_MISMATCH')return res.status(401).json({ok:false,message:'كلمة المرور لا تطابق الطلب المعتمد.'});if(error.code==='23505')return res.status(409).json({ok:false,message:'الحساب موجود بالفعل.'});console.error('activate:',error);res.status(500).json({ok:false,message:'تعذر تفعيل الحساب.'});}});
  router.post('/login',(req,res)=>login(req,res,{managerOnly:false}));
  router.post('/manager-login',(req,res)=>login(req,res,{managerOnly:true}));
  router.post('/logout',async(req,res)=>{const raw=getToken(req);if(raw)await query('DELETE FROM sessions WHERE token_hash=$1',[hash(raw)]).catch(()=>{});clearSessionCookie(res);res.json({ok:true});});
  router.get('/me',requireAuth(async(req,res)=>res.json({ok:true,user:publicUser(req.user,req.user.id)})));
  router.get('/manager-me',requireAuth(async(req,res)=>res.json({ok:true,user:publicUser(req.user,req.user.id)}),true));
  const requireManager=handler=>requireAuth(handler,true);return{router,requireAuth,requireManager,userFromRequest};
}
module.exports={makeRouter};

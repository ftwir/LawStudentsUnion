const express=require('express');
const {query}=require('../db');
const {answerAssistant}=require('../services/assistant');
const router=express.Router();
function attach(requireAuth){
 router.get('/status',(req,res)=>res.json({ok:true,enabled:Boolean(process.env.GEMINI_API_KEY),mode:'limited-operational'}));
 router.get('/context',requireAuth,async(req,res,next)=>{try{const [a,n,c]=await Promise.all([query('SELECT * FROM user_activity WHERE user_id=$1',[req.user.id]),query('SELECT COUNT(*)::int count FROM user_notifications WHERE recipient_id=$1 AND is_read=FALSE',[req.user.id]),query('SELECT COUNT(*)::int count FROM conversation_members WHERE user_id=$1',[req.user.id])]);res.json({ok:true,context:{activity:a.rows[0]||null,unread_notifications:Number(n.rows[0].count),conversations:Number(c.rows[0].count)}})}catch(e){next(e)}});
 router.post('/chat',requireAuth,async(req,res,next)=>{try{const [a,n,c]=await Promise.all([query('SELECT * FROM user_activity WHERE user_id=$1',[req.user.id]),query('SELECT COUNT(*)::int count FROM user_notifications WHERE recipient_id=$1 AND is_read=FALSE',[req.user.id]),query('SELECT COUNT(*)::int count FROM conversation_members WHERE user_id=$1',[req.user.id])]);const message=await answerAssistant({user:req.user,activity:a.rows[0],unreadNotifications:Number(n.rows[0].count),conversations:Number(c.rows[0].count),message:req.body?.message});res.json({ok:true,message})}catch(e){next(e)}});
 return router;
}
module.exports={router,attach};
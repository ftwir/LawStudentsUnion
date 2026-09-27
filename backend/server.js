const express=require('express');
const cors=require('cors');
const helmet=require('helmet');
const compression=require('compression');
const path=require('path');
const http=require('http');
const crypto=require('crypto');
const {ensureSchema,query}=require('./db');
const {makeRouter}=require('./routes/auth');
const content=require('./routes/content');
const chat=require('./routes/chat');
const activity=require('./routes/activity');
const admin=require('./routes/admin');
const assistant=require('./routes/assistant');
const {attachRealtime}=require('./realtime');

const app=express();
const server=http.createServer(app);
const PORT=Number(process.env.PORT||3000);
const allowedOrigins=String(process.env.CORS_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
const publicDir=path.join(__dirname,'..','public');

app.disable('x-powered-by');
app.set('trust proxy',1);
app.use(helmet({crossOriginEmbedderPolicy:false,contentSecurityPolicy:false}));
app.use(compression());
app.use(cors({origin:(origin,cb)=>{if(!origin||!allowedOrigins.length||allowedOrigins.includes(origin))return cb(null,true);cb(new Error('Origin not allowed'));},credentials:true}));
app.use(express.json({limit:'2mb'}));
app.use((req,res,next)=>{const id=String(req.headers['x-request-id']||crypto.randomUUID());res.setHeader('X-Request-Id',id);req.requestId=id;next();});

const buckets=new Map();
const WINDOW=60_000;
const LIMIT=Number(process.env.RATE_LIMIT_PER_MINUTE||240);
app.use((req,res,next)=>{const key=String(req.ip||'unknown');const now=Date.now();let b=buckets.get(key);if(!b||now-b.at>=WINDOW){b={at:now,count:0};buckets.set(key,b);}b.count++;if(b.count>LIMIT)return res.status(429).json({ok:false,message:'طلبات كثيرة. حاول مرة أخرى بعد قليل.'});next();});
setInterval(()=>{const now=Date.now();for(const [k,b] of buckets)if(now-b.at>WINDOW*2)buckets.delete(k);},WINDOW*2).unref();

const auth=makeRouter();
const getUser=auth.userFromRequest;
const requireAuth=auth.requireAuth;
const requireManager=auth.requireManager;
app.use('/api/auth',auth.router);
content.attach(getUser,requireAuth);
chat.attach(getUser,requireAuth);
activity.attach(requireAuth);
admin.attach(requireAuth,requireManager);
assistant.attach(requireAuth);
app.use('/api',content.router);
app.use('/api',chat.router);
app.use('/api/activity',activity.router);
app.use('/api',admin.router);
app.use('/api/assistant',assistant.router);

app.get('/api/health',async(req,res)=>{try{await query('SELECT 1');res.json({ok:true,service:'Law Students Union Unified API',database:'connected',realtime:true,time:new Date().toISOString()});}catch(e){res.status(503).json({ok:false,database:'disconnected'});}});
app.get('/health',async(req,res)=>{try{await query('SELECT 1');res.json({ok:true,service:'lsu-main',database:'connected'});}catch(e){res.status(503).json({ok:false});}});
app.get('/api',async(req,res)=>res.json({ok:true,service:'Law Students Union Unified API',version:'2.0.0'}));

app.use(express.static(publicDir,{extensions:['html'],index:'index.html',maxAge:'1h'}));
app.get('*',(req,res)=>{if(req.path.startsWith('/api/')||req.path==='/api')return res.status(404).json({ok:false,message:'API route not found.'});res.sendFile(path.join(publicDir,'index.html'));});

app.use((err,req,res,next)=>{console.error(`[${req.requestId||'-'}]`,err);if(res.headersSent)return next(err);if(err.code==='LIMIT_FILE_SIZE')return res.status(413).json({ok:false,message:'الملف أكبر من الحد المسموح.'});res.status(err.status||500).json({ok:false,message:'حدث خطأ داخلي.'});});

async function boot(){await ensureSchema();attachRealtime(server);setInterval(()=>query("DELETE FROM sessions WHERE expires_at<NOW()").catch(e=>console.error('session cleanup:',e.message)),15*60_000).unref();server.listen(PORT,'0.0.0.0',()=>console.log(`LSU main listening on ${PORT}`));}
boot().catch(err=>{console.error('BOOT FAILED:',err);process.exit(1);});

async function shutdown(){try{await new Promise(resolve=>server.close(resolve));}finally{process.exit(0);}}
process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);

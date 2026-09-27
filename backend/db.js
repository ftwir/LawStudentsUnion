const fs=require('fs');
const path=require('path');
const {Pool}=require('pg');
const production=process.env.NODE_ENV==='production';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:Math.max(4,Number(process.env.DB_POOL_MAX||20)),min:Math.max(0,Number(process.env.DB_POOL_MIN||1)),idleTimeoutMillis:Number(process.env.DB_IDLE_TIMEOUT_MS||30000),connectionTimeoutMillis:Number(process.env.DB_CONNECTION_TIMEOUT_MS||7000),statement_timeout:Number(process.env.DB_STATEMENT_TIMEOUT_MS||10000),keepAlive:true,ssl:production?{rejectUnauthorized:false}:false});
pool.on('error',e=>console.error('PostgreSQL pool error:',e.message));
const query=(text,params)=>pool.query(text,params);
async function transaction(fn){const client=await pool.connect();try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result}catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}}
async function ensureSchema(){const sql=fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8');await pool.query(sql)}
async function notify(channel,payload){const safe=String(channel).replace(/[^a-zA-Z0-9_]/g,'').slice(0,40);await pool.query('SELECT pg_notify($1,$2)',[safe,JSON.stringify(payload||{})])}
module.exports={pool,query,transaction,ensureSchema,notify};
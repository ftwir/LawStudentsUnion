const express=require("express");
const path=require("path");
const crypto=require("crypto");
const {GoogleGenAI}=require("@google/genai");
const {Octokit}=require("@octokit/rest");

const app=express();
const PORT=Number(process.env.PORT||10000);
const STUDENT_API_URL=String(process.env.STUDENT_API_URL||"").replace(/\/$/,"");
const GITHUB_REPO=String(process.env.GITHUB_REPO||"ftwir/LawStudentsUnion");
const GITHUB_REF=String(process.env.GITHUB_REF||"main");
const GEMINI_MODEL=String(process.env.GEMINI_MODEL||"gemini-2.5-flash");
const AGENT_CHANNEL_SECRET=String(process.env.AGENT_CHANNEL_SECRET||"");
function managerToken(req){
  const auth=req.headers.authorization||"";
  if(auth.startsWith("Bearer "))return auth.slice(7).trim();
  const cookie=String(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("lsu_manager_token="));
  return cookie?decodeURIComponent(cookie.slice("lsu_manager_token=".length)):"";
}
function setManagerCookie(res,token){
  let value="lsu_manager_token="+encodeURIComponent(token)+"; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000";
  if(process.env.NODE_ENV==="production")value+="; Secure";
  res.setHeader("Set-Cookie",value);
}
function clearManagerCookie(res){
  let value="lsu_manager_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0";
  if(process.env.NODE_ENV==="production")value+="; Secure";
  res.setHeader("Set-Cookie",value);
}

app.disable("x-powered-by");
app.use(express.json({limit:"2mb"}));
app.use((req,res,next)=>{
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Frame-Options","DENY");
  res.setHeader("Referrer-Policy","no-referrer");
  next();
});
app.use(express.static(path.join(__dirname,"public")));

function safeEqual(a,b){
  if(typeof a!=="string"||typeof b!=="string")return false;
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length&&crypto.timingSafeEqual(x,y);
}
function signPayload(body){return AGENT_CHANNEL_SECRET?crypto.createHmac("sha256",AGENT_CHANNEL_SECRET).update(body).digest("hex"):"";}
function verifyAgentRequest(req){
  if(!AGENT_CHANNEL_SECRET)return false;
  const raw=JSON.stringify(req.body||{});
  return safeEqual(String(req.headers["x-agent-signature"]||""),signPayload(raw));
}
async function verifyOwnerSession(req){
  const token=managerToken(req);
  if(!STUDENT_API_URL||!token)return false;
  try{
    const response=await fetch(STUDENT_API_URL+"/api/owner/status",{headers:{Authorization:"Bearer "+token,Accept:"application/json"}});
    return response.ok;
  }catch{return false;}
}
async function managerAuth(req,res,next){
  try{
    if(await verifyOwnerSession(req))return next();
    return res.status(401).json({ok:false,message:"Manager authentication requires a valid owner database session."});
  }catch(error){
    console.error("manager auth failed",error);
    return res.status(401).json({ok:false,message:"Manager authentication required."});
  }
}
async function mainApi(pathName,req,options={}){
  if(!STUDENT_API_URL)throw new Error("STUDENT_API_URL is not configured");
  const token=managerToken(req); const headers={Accept:"application/json",Authorization:token?"Bearer "+token:""};
  if(options.body!==undefined)headers["Content-Type"]="application/json";
  const response=await fetch(STUDENT_API_URL+pathName,{...options,headers});
  const data=await response.json().catch(()=>({ok:false,message:"Main API returned invalid JSON."}));
  return {response,data};
}
async function readGithubFile(filePath){
  const token=process.env.GITHUB_TOKEN;
  if(!token)throw new Error("GITHUB_TOKEN is not configured");
  const [owner,repo]=GITHUB_REPO.split("/");
  const octokit=new Octokit({auth:token});
  const result=await octokit.rest.repos.getContent({owner,repo,path:filePath,ref:GITHUB_REF});
  if(Array.isArray(result.data)||!result.data.content)throw new Error("GitHub target is not a readable file");
  return {sha:result.data.sha,content:Buffer.from(result.data.content,result.data.encoding||"base64").toString("utf8")};
}
function parseAIJson(value){
  const cleaned=String(value||"").replace(/^\s*\x60\x60\x60json\s*/i,"").replace(/\s*\x60\x60\x60\s*$/i,"").trim();
  try{return JSON.parse(cleaned);}catch{}
  const start=cleaned.indexOf("{"),end=cleaned.lastIndexOf("}");
  if(start>=0&&end>start)return JSON.parse(cleaned.slice(start,end+1));
  throw new Error("AI response was not valid JSON");
}
function allowedEditPath(filePath){
  const file=String(filePath||"").replace(/\\/g,"/");
  if(!file||file.startsWith(".")||file.includes(".."))return false;
  return /^(public\/assets\/(app\.js|app\.css)|public\/index\.html|public\/activate\/index\.html|backend\/|packages\/manager-app\/|worker\/)/.test(file);
}
async function generateRepair({error,filePath,source,instruction}){
  const key=process.env.GEMINI_API_KEY;
  if(!key)throw new Error("GEMINI_API_KEY is not configured");
  const ai=new GoogleGenAI({apiKey:key});
  const prompt=[
    "You are the controlled code repair agent for Law Students Union.",
    "The owner requested a repair. Produce the smallest safe production repair.",
    "Do not change unrelated behavior. Do not add credentials. Do not add dependencies unless absolutely required.",
    "Return JSON only with diagnosis, root_cause, replacement_code, tests.",
    "replacement_code must be the complete file content without markdown.",
    "The change will be staged to a dedicated Git branch and pull request; never assume direct production access.",
    "Repository: "+GITHUB_REPO,
    "Base ref: "+GITHUB_REF,
    "File: "+filePath,
    "Owner instruction: "+String(instruction||"").slice(0,6000),
    "Observed error: "+String(error||"").slice(0,12000),
    "",
    "CURRENT FILE:",
    source.slice(0,100000)
  ].join("\n");
  const response=await ai.models.generateContent({model:GEMINI_MODEL,contents:prompt,config:{temperature:0.1}});
  return parseAIJson(response.text);
}
async function stageRepair(filePath,replacement,sha,diagnosis){
  if(!replacement||typeof replacement!=="string")throw new Error("AI returned no replacement code");
  const ext=path.extname(filePath).toLowerCase();
  if([".js",".mjs",".cjs"].includes(ext))new Function(replacement);
  const token=process.env.GITHUB_TOKEN;
  if(!token)throw new Error("GITHUB_TOKEN is not configured");
  const [owner,repo]=GITHUB_REPO.split("/");
  const octokit=new Octokit({auth:token});
  const base=await octokit.rest.repos.getBranch({owner,repo,branch:GITHUB_REF});
  const suffix=String(filePath).replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"");
  const branchName="owner-ai/"+Date.now()+"-"+suffix;
  await octokit.rest.git.createRef({owner,repo,ref:"refs/heads/"+branchName,sha:base.data.commit.sha});
  const commit=await octokit.rest.repos.createOrUpdateFileContents({
    owner,repo,path:filePath,message:"owner-ai repair: "+filePath,content:Buffer.from(replacement,"utf8").toString("base64"),sha,branch:branchName
  });
  const pull=await octokit.rest.pulls.create({
    owner,repo,title:"Owner AI repair: "+filePath,head:branchName,base:GITHUB_REF,
    body:"Controlled owner AI repair.\n\nDiagnosis: "+String(diagnosis||"").slice(0,5000)+"\n\nNo direct write to the production branch was performed."
  });
  return {branch:branchName,commitSha:commit.data.commit.sha,pullRequestNumber:pull.data.number,pullRequestUrl:pull.data.html_url};
}

app.post("/api/manager/login",async(req,res)=>{
  try{
    const identifier=String(req.body?.identifier||"").trim();
    const password=String(req.body?.password||"");
    if(!identifier||!password)return res.status(400).json({ok:false,message:"Identifier and password are required."});
    const result=await fetch(STUDENT_API_URL+"/api/auth/manager-login",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({identifier,password})});
    const data=await result.json().catch(()=>({ok:false,message:"Invalid main API response."}));
    if(!result.ok||!data.ok||!data.token)return res.status(result.status||401).json({ok:false,message:data.message||"Invalid credentials."});
    if(data.user?.role!=="owner")return res.status(403).json({ok:false,message:"Only the owner account can enter the manager."});
    setManagerCookie(res,data.token); res.json({ok:true,user:{id:data.user.id,full_name:data.user.full_name,role:data.user.role}});
  }catch(error){
    console.error(error);
    res.status(502).json({ok:false,message:"Could not reach the main API."});
  }
});

app.get("/health",(req,res)=>res.json({ok:true,service:"Law Students Union Owner Manager",authentication:"database-owner-session",ai:Boolean(process.env.GEMINI_API_KEY),github:Boolean(process.env.GITHUB_TOKEN),timestamp:new Date().toISOString()}));
app.get("/api/manager/me",managerAuth,async(req,res)=>res.json({ok:true,manager:"owner"}));
app.post("/api/manager/logout",(req,res)=>{clearManagerCookie(res);res.json({ok:true})});


app.get("/api/manager/overview",managerAuth,async(req,res)=>{
  try{
    const paths=["/api/owner/status","/api/assistant/status","/api/owner/activity","/api/owner/audit","/api/owner/database-summary"];
    const results=await Promise.all(paths.map(p=>mainApi(p,req)));
    const failed=results.find(x=>!x.response.ok);
    if(failed)return res.status(failed.response.status).json(failed.data);
    res.json({ok:true,status:results[0].data,assistant:results[1].data,activity:results[2].data,audit:results[3].data,database:results[4].data});
  }catch(error){console.error(error);res.status(502).json({ok:false,message:error.message});}
});

const proxyRoutes=[
  ["GET","/api/manager/users","/api/owner/users"],
  ["GET","/api/manager/activity","/api/owner/activity"],
  ["GET","/api/manager/registrations","/api/admin/registrations"],
  ["GET","/api/manager/reports","/api/admin/reports"],
  ["GET","/api/manager/chats","/api/admin/chats"],
  ["GET","/api/manager/private-chats","/api/chat/private-channels"],
  ["GET","/api/manager/settings","/api/app-settings"],
  ["GET","/api/manager/content","/api/posts?section=community&limit=50"],
  ["GET","/api/manager/database-summary","/api/owner/database-summary"]
];
for(const [method,local,upstream] of proxyRoutes){
  app[method.toLowerCase()](local,managerAuth,async(req,res)=>{
    try{
      const {response,data}=await mainApi(upstream,req,{});
      res.status(response.status).json(data);
    }catch(error){console.error(error);res.status(502).json({ok:false,message:error.message});}
  });
}
app.post("/api/manager/content",managerAuth,async(req,res)=>{try{const clean=req.body&&typeof req.body==="object"?{type:req.body.type,title:req.body.title,body:req.body.body,tag:req.body.tag,event_date:req.body.event_date,location:req.body.location}:{};const {response,data}=await mainApi("/api/admin/content",req,{method:"POST",body:JSON.stringify(clean)});res.status(response.status).json(data);}catch(error){res.status(502).json({ok:false,message:error.message});}});
app.patch("/api/manager/chats/:id",managerAuth,async(req,res)=>{
  try{
    const {response,data}=await mainApi("/api/admin/chats/"+encodeURIComponent(req.params.id),req,{
      method:"PATCH",
      body:JSON.stringify({messaging_paused:req.body?.messaging_paused===true})
    });
    res.status(response.status).json(data);
  }catch(error){console.error(error);res.status(502).json({ok:false,message:error.message});}
});

app.get("/api/manager/database/:table",managerAuth,async(req,res)=>{
  try{
    const table=String(req.params.table||"").replace(/[^a-z_]/g,"");
    if(!/^(announcements|activities|schedules|posts|post_likes|post_comments|conversations|conversation_members|messages|notifications|user_notifications|friendships|registrations|registration_checks|polls|poll_votes|audit_logs|user_activity|activity_events|agent_actions|app_settings|users)$/.test(table))return res.status(404).json({ok:false,message:"This data view is not available."});
    const {response,data}=await mainApi("/api/owner/database/"+encodeURIComponent(table)+"?limit=120",req,{});
    res.status(response.status).json(data);
  }catch(error){res.status(502).json({ok:false,message:error.message});}
});

app.patch("/api/manager/users/:id/status",managerAuth,async(req,res)=>{
  try{
    const {response,data}=await mainApi("/api/admin/users/"+encodeURIComponent(req.params.id)+"/status",req,{method:"PATCH",body:JSON.stringify({is_active:req.body?.is_active===true})});
    res.status(response.status).json(data);
  }catch(error){res.status(502).json({ok:false,message:error.message});}
});
app.patch("/api/manager/users/:id/role",managerAuth,async(req,res)=>{
  try{
    const {response,data}=await mainApi("/api/owner/users/"+encodeURIComponent(req.params.id)+"/role",req,{method:"PATCH",body:JSON.stringify({role:req.body?.role})});
    res.status(response.status).json(data);
  }catch(error){res.status(502).json({ok:false,message:error.message});}
});
app.patch("/api/manager/registrations/:id",managerAuth,async(req,res)=>{
  try{
    const {response,data}=await mainApi("/api/admin/registrations/"+encodeURIComponent(req.params.id),req,{method:"PATCH",body:JSON.stringify({status:req.body?.status,rejection_reason:req.body?.rejection_reason||null})});
    res.status(response.status).json(data);
  }catch(error){res.status(502).json({ok:false,message:error.message});}
});
app.delete("/api/manager/registrations/:id",managerAuth,async(req,res)=>{
  try{
    const {response,data}=await mainApi("/api/admin/registrations/"+encodeURIComponent(req.params.id),req,{method:"DELETE"});
    res.status(response.status).json(data);
  }catch(error){res.status(502).json({ok:false,message:error.message});}
});
app.patch("/api/manager/reports/:id",managerAuth,async(req,res)=>{
  try{
    const {response,data}=await mainApi("/api/admin/reports/"+encodeURIComponent(req.params.id),req,{method:"PATCH",body:JSON.stringify({status:req.body?.status})});
    res.status(response.status).json(data);
  }catch(error){res.status(502).json({ok:false,message:error.message});}
});
app.patch("/api/manager/posts/:id/pin",managerAuth,async(req,res)=>{
  try{
    const {response,data}=await mainApi("/api/posts/"+encodeURIComponent(req.params.id)+"/pin",req,{method:"PATCH",body:JSON.stringify({pinned:req.body?.pinned===true})});
    res.status(response.status).json(data);
  }catch(error){res.status(502).json({ok:false,message:error.message});}
});
app.patch("/api/manager/settings",managerAuth,async(req,res)=>{
  try{
    const body=req.body&&typeof req.body==="object"?req.body:{};
    const clean={};
    for(const [key,value] of Object.entries(body))if(/^[a-zA-Z0-9_.-]{1,120}$/.test(key))clean[key]=value;
    const {response,data}=await mainApi("/api/app-settings",req,{method:"PUT",body:JSON.stringify(clean)});
    res.status(response.status).json(data);
  }catch(error){res.status(502).json({ok:false,message:error.message});}
});

app.post("/api/manager/ai/repair",managerAuth,async(req,res)=>{
  const filePath=String(req.body?.filePath||"");
  if(!allowedEditPath(filePath))return res.status(400).json({ok:false,message:"That file is outside the controlled application tree."});
  try{
    const current=await readGithubFile(filePath);
    const analysis=await generateRepair({error:req.body?.error||"",filePath,source:current.content,instruction:req.body?.instruction||""});
    const staged=await stageRepair(filePath,analysis.replacement_code,current.sha,analysis.root_cause||analysis.diagnosis||"Owner requested repair.");
    const action=await mainApi("/api/owner/agent-actions",req,{method:"POST",body:JSON.stringify({
      action_type:"owner_ai_repair",
      target_type:"file",
      details:{filePath,branch:staged.branch,pullRequestUrl:staged.pullRequestUrl,rootCause:analysis.root_cause||null}
    })});
    res.json({ok:true,analysis,staged,action:action.data});
  }catch(error){
    console.error("owner AI repair failed",error);
    res.status(502).json({ok:false,message:error.message});
  }
});

app.post("/internal/agent/execute",async(req,res)=>{
  if(!verifyAgentRequest(req))return res.status(401).json({ok:false,message:"Invalid agent signature."});
  const filePath=String(req.body?.filePath||"");
  if(!allowedEditPath(filePath))return res.status(400).json({ok:false,message:"File path is outside the controlled application tree."});
  try{
    const current=await readGithubFile(filePath);
    const analysis=await generateRepair({error:req.body?.error||"",filePath,source:current.content,instruction:"Automated self-healing request."});
    const staged=await stageRepair(filePath,analysis.replacement_code,current.sha,analysis.root_cause||"Automated repair");
    res.json({ok:true,analysis,staged});
  }catch(error){console.error("internal repair failed",error);res.status(502).json({ok:false,message:error.message});}
});

app.get("/api/manager/github",managerAuth,async(req,res)=>{
  try{
    const token=process.env.GITHUB_TOKEN;if(!token)return res.status(503).json({ok:false,message:"GITHUB_TOKEN is not configured."});
    const [owner,repo]=GITHUB_REPO.split("/");
    const octokit=new Octokit({auth:token});
    const response=await octokit.rest.repos.getBranch({owner,repo,branch:GITHUB_REF});
    res.json({ok:true,repository:GITHUB_REPO,ref:GITHUB_REF,commit:{sha:response.data.commit.sha}});
  }catch(error){res.status(502).json({ok:false,message:error.message});}
});

app.get("/api/manager/config",managerAuth,(req,res)=>res.json({
  ok:true,repository:GITHUB_REPO,ref:GITHUB_REF,
  mainApiConfigured:Boolean(STUDENT_API_URL),githubConfigured:Boolean(process.env.GITHUB_TOKEN),
  geminiConfigured:Boolean(process.env.GEMINI_API_KEY)
}));

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
const server=app.listen(PORT,"0.0.0.0",()=>console.log("Owner Manager running on "+PORT));
function shutdown(){server.close(()=>process.exit(0));}
process.once("SIGTERM",shutdown);process.once("SIGINT",shutdown);

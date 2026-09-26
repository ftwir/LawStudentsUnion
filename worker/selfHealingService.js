const express=require("express");
const app=express();
app.use(express.json({limit:"2mb"}));
const PORT=process.env.PORT||10000;
app.get("/health",(req,res)=>res.json({ok:true,service:"self-healing-agent",mode:"review-only"}));
app.post("/internal/heal",(req,res)=>{
  const {error,filePath}=req.body||{};
  if(!error||!filePath)return res.status(400).json({ok:false,message:"error and filePath are required"});
  if(!/^backend\//.test(filePath))return res.status(400).json({ok:false,message:"filePath must target backend/"});
  console.log(JSON.stringify({type:"self-heal-request",filePath,error:String(error).slice(0,12000),receivedAt:new Date().toISOString()}));
  res.status(202).json({ok:true,queued:true,mode:"review-only"});
});
app.listen(PORT,"0.0.0.0",()=>console.log("Self-healing agent listening on "+PORT));

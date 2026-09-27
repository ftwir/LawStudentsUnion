const tokenKey="acm_owner_token";
const state={token:sessionStorage.getItem(tokenKey)||"",user:null,tab:"overview",data:{}};
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
function saveToken(value){state.token=value||"";value?sessionStorage.setItem(tokenKey,value):sessionStorage.removeItem(tokenKey);}
async function api(path,options={}){
  const headers=new Headers(options.headers||{});
  headers.set("Accept","application/json");
  if(options.body!==undefined)headers.set("Content-Type","application/json");
  if(state.token)headers.set("Authorization","Bearer "+state.token);
  const response=await fetch(path,{...options,headers,cache:"no-store"});
  const data=await response.json().catch(()=>({ok:false,message:"استجابة غير صالحة."}));
  if(response.status===401){saveToken("");showLogin();throw new Error("انتهت جلسة المالك.");}
  if(!response.ok||data.ok===false)throw new Error(data.message||"تعذر تنفيذ العملية.");
  return data;
}
function setStatus(message,error=false){const el=$("#loginStatus")||$("#panelStatus");if(el){el.textContent=message||"";el.style.color=error?"#ff9da5":"var(--muted)";}}
function showLogin(){const login=$("#loginView"),dash=$("#dashboardView");login.hidden=false;dash.hidden=true;}
function showDashboard(){const login=$("#loginView"),dash=$("#dashboardView");login.hidden=true;dash.hidden=false;}

async function login(identifier,password){
  const data=await api("/api/manager/login",{method:"POST",body:JSON.stringify({identifier,password})});
  saveToken(data.token);state.user=data.user;showDashboard();$("#ownerName").textContent=data.user.full_name;await loadTab("overview");
}
async function bootstrap(){
  if(!state.token){showLogin();return;}
  try{
    const data=await api("/api/manager/owner-status");
    state.user={id:data.ownerId,role:"owner"};showDashboard();await loadTab("overview");
  }catch{showLogin();}
}
function panelTitle(title,sub=""){return '<div class="panel-title"><div><h2>'+esc(title)+'</h2><p>'+esc(sub)+'</p></div></div>';}
function metric(label,value){return '<article class="card metric"><b>'+esc(value)+'</b><small>'+esc(label)+'</small></article>';}

async function loadTab(tab){
  state.tab=tab;
  document.querySelectorAll("#tabs button").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  const panel=$("#panel");panel.innerHTML='<div class="card">جارٍ تحميل البيانات...</div>';
  try{
    let data;
    if(tab==="overview")data=await api("/api/manager/overview");
    else if(tab==="users")data=await api("/api/manager/users");
    else if(tab==="database")data=await api("/api/manager/database-summary");
    else if(tab==="registrations")data=await api("/api/manager/registrations");
    else if(tab==="content")data=await api("/api/manager/content");
    else if(tab==="activity")data=await api("/api/manager/activity");
    else if(tab==="chats")data=await api("/api/manager/private-chats");
    else if(tab==="audit")data=await api("/api/manager/overview");
    else if(tab==="settings")data=await api("/api/manager/settings");
    else if(tab==="ai"){renderAI();return;}
    state.data[tab]=data;
    render(tab,data);
  }catch(error){panel.innerHTML='<article class="card danger"><strong>تعذر تحميل القسم</strong><p>'+esc(error.message)+'</p></article>';}
}

function render(tab,data){
  const p=$("#panel");
  if(tab==="overview"){
    const s=data.status?.metrics||{},a=data.assistant||{};
    p.innerHTML=panelTitle("النظرة العامة","حالة حية من التطبيق الأساسي وقاعدة البيانات")+
      '<section class="grid">'+metric("المستخدمون",s.users||0)+metric("الجلسات النشطة",s.activeSessions||0)+metric("النشطون الآن",s.activeUsers??a.active_members??0)+metric("طلبات معلقة",s.pendingRegistrations??a.pending_registrations??0)+'</section>'+
      '<section class="card" style="margin-top:12px"><h3>LSU Guardian</h3><p class="muted">حالة المساعد: '+esc(a.bot?.state||"unknown")+' · الوضع: '+esc(a.bot?.mode||"unknown")+'</p></section>'+
      '<section class="card" style="margin-top:12px"><h3>آخر نشاط للأعضاء</h3><div class="activity-feed">'+(data.activity?.users||[]).slice(0,18).map(u=>'<div class="activity"><b>'+esc(u.full_name)+'</b><small>'+esc(u.current_page||"")+' · '+esc(new Date(u.last_activity_at).toLocaleString("ar-LY"))+'</small></div>').join("")+'</div></section>';
    return;
  }
  if(tab==="audit"){
    const events=data.audit?.events||[];
    p.innerHTML=panelTitle("سجل النظام","العمليات المسجلة من المنظومة")+
      '<div class="list">'+events.map(e=>'<article class="row"><div class="row-main"><strong>'+esc(e.action)+'</strong><small>'+esc(e.actor_name||"النظام")+' · '+esc(e.target_type||"")+'</small></div><small>'+esc(new Date(e.created_at).toLocaleString("ar-LY"))+'</small></article>').join("")+'</div>';
    return;
  }
  if(tab==="users"){
    const users=data.users||[];
    p.innerHTML=panelTitle("المستخدمون","إدارة حالة الحساب والرتبة")+
      '<div class="card"><input id="searchUsers" placeholder="بحث"><div id="userList" class="list" style="margin-top:12px"></div></div>';
    const list=$("#userList"),search=$("#searchUsers");
    const draw=()=>{
      const q=(search.value||"").trim().toLowerCase();
      list.innerHTML=users.filter(u=>!q||[u.full_name,u.student_id,u.email,u.phone].some(v=>String(v||"").toLowerCase().includes(q))).map(u=>
        '<article class="row"><div class="row-main"><strong>'+esc(u.full_name)+'</strong><small>'+esc(u.student_id||"")+' · '+esc(u.email||"")+'</small></div><span class="pill">'+esc(u.role)+'</span><span class="pill">'+esc(u.is_active?"نشط":"موقوف")+'</span><div class="row-actions">'+
        (Number(u.id)!==Number(state.user?.id)?'<select data-role="'+u.id+'"><option value="member" '+(u.role==="member"?"selected":"")+'>عضو</option><option value="admin" '+(u.role==="admin"?"selected":"")+'>Admin</option></select><button class="secondary" data-status="'+u.id+'">'+(u.is_active?"تعطيل":"تفعيل")+'</button>':"")+
        '</div></article>'
      ).join("")||'<div class="card">لا توجد نتائج.</div>';
      list.querySelectorAll("[data-status]").forEach(b=>b.onclick=async()=>{try{await api("/api/manager/users/"+b.dataset.status+"/status",{method:"PATCH",body:JSON.stringify({is_active:b.textContent.includes("تفعيل")})});await loadTab("users");}catch(e){setPanelError(e.message);}});
      list.querySelectorAll("[data-role]").forEach(s=>s.onchange=async()=>{try{await api("/api/manager/users/"+s.dataset.role+"/role",{method:"PATCH",body:JSON.stringify({role:s.value})});await loadTab("users");}catch(e){setPanelError(e.message);}});
    };
    search.oninput=draw;draw();return;
  }
  if(tab==="registrations"){
    const rows=data.applications||[];
    p.innerHTML=panelTitle("طلبات العضوية","فحص آلي + مراجعة المالك")+'<div class="list">'+(rows.map(a=>'<article class="row"><div class="row-main"><strong>'+esc(a.full_name)+'</strong><small>'+esc(a.student_id)+' · '+esc(a.academic_year||"")+' · '+esc(a.phone||"")+'</small></div><span class="pill">'+esc(a.status)+'</span><div class="row-actions"><select data-reg="'+a.id+'"><option value="pending" '+(a.status==="pending"?"selected":"")+'>معلق</option><option value="approved" '+(a.status==="approved"?"selected":"")+'>مقبول</option><option value="rejected" '+(a.status==="rejected"?"selected":"")+'>مرفوض</option></select><button class="danger" data-del-reg="'+a.id+'">حذف</button></div></article>').join("")||'<div class="card">لا توجد طلبات.</div>')+'</div>';
    p.querySelectorAll("[data-reg]").forEach(s=>s.onchange=async()=>{try{const reason=s.value==="rejected"?prompt("سبب الرفض:")||null:null;await api("/api/manager/registrations/"+s.dataset.reg,{method:"PATCH",body:JSON.stringify({status:s.value,rejection_reason:reason})});await loadTab("registrations");}catch(e){setPanelError(e.message);}});
    p.querySelectorAll("[data-del-reg]").forEach(b=>b.onclick=async()=>{if(!confirm("حذف الطلب؟"))return;try{await api("/api/manager/registrations/"+b.dataset.delReg,{method:"DELETE"});await loadTab("registrations");}catch(e){setPanelError(e.message);}});
    return;
  }
  if(tab==="content"){
    const posts=data.posts||[];
    p.innerHTML=panelTitle("المحتوى","مراجعة منشورات المجتمع")+'<div class="list">'+(posts.map(post=>'<article class="row"><div class="row-main"><strong>'+esc(post.title||"منشور بلا عنوان")+'</strong><small>'+esc(post.author?.full_name||"عضو")+' · '+esc(new Date(post.created_at).toLocaleString("ar-LY"))+'</small><p>'+esc(post.body||"").slice(0,240)+'</p></div><div class="row-actions"><button class="secondary" data-pin="'+post.id+'">'+(post.is_pinned?"إلغاء التثبيت":"تثبيت")+'</button><a class="secondary" href="https://lawstudentsunion.onrender.com/posts/?id='+encodeURIComponent(post.id)+'" target="_blank" rel="noopener">فتح</a></div></article>').join("")||'<div class="card">لا توجد منشورات.</div>')+'</div>';
    p.querySelectorAll("[data-pin]").forEach(b=>b.onclick=async()=>{try{await api("/api/manager/posts/"+b.dataset.pin+"/pin",{method:"PATCH",body:JSON.stringify({pinned:!b.textContent.includes("إلغاء")})});await loadTab("content");}catch(e){setPanelError(e.message);}});return;
  }
  if(tab==="activity"){
    const users=data.users||[];
    p.innerHTML=panelTitle("نشاط الأعضاء","آخر صفحة وموضع محفوظ لكل مستخدم")+'<div class="activity-feed">'+users.map(u=>'<article class="activity"><b>'+esc(u.full_name)+'</b><div>'+esc(u.current_page||"")+(u.resource_id?" · "+esc(u.resource_type)+" #"+esc(u.resource_id):"")+'</div><small>'+esc(new Date(u.last_activity_at).toLocaleString("ar-LY"))+'</small></article>').join("")+'</div>';return;
  }
  if(tab==="chats"){
    const chats=data.conversations||[];
    p.innerHTML=panelTitle("القنوات الخاصة","الوصول الإداري إلى بيانات القنوات")+'<div class="list">'+(chats.map(c=>'<article class="row"><div class="row-main"><strong>'+esc(c.name||"دردشة خاصة")+'</strong><small>'+esc(c.type)+' · '+esc(c.member_count||0)+' أعضاء</small></div><a class="secondary" href="https://lawstudentsunion.onrender.com/chat/?id='+encodeURIComponent(c.id)+'" target="_blank" rel="noopener">فتح</a></article>').join("")||'<div class="card">لا توجد قنوات خاصة.</div>')+'</div>';return;
  }
  if(tab==="settings"){
    const s=data.settings||{};
    p.innerHTML=panelTitle("إعدادات النظام","المفاتيح العامة للمحتوى والإعدادات")+
      '<form class="card form-grid" id="settingsForm"><label class="full">عنوان الصفحة<input name="home_title" value="'+esc(s.home_title||"اتحاد طلبة كلية القانون")+'"></label><label class="full">وصف الصفحة<textarea name="home_intro">'+esc(s.home_intro||"")+'</textarea></label><label class="full">عن المجتمع<textarea name="about_body">'+esc(s.about_body||"")+'</textarea></label><button class="primary">حفظ التغييرات</button><div id="settingsStatus" class="status"></div></form>';
    $("#settingsForm").onsubmit=async event=>{event.preventDefault();try{await api("/api/manager/settings",{method:"PATCH",body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries()))});$("#settingsStatus").textContent="تم الحفظ."; }catch(e){$("#settingsStatus").textContent=e.message;}};return;
  }
}
function setPanelError(message){const p=$("#panel");p.insertAdjacentHTML("afterbegin",'<div class="card danger" id="panelStatus">'+esc(message)+'</div>');}
function renderAI(){
  const p=$("#panel");
  p.innerHTML=panelTitle("الذكاء والإصلاح","الوكيل الذكي يقترح تعديلات فقط؛ النتيجة تُرفع إلى فرع وPull Request.")+
    '<form id="aiForm" class="card form-grid"><label>مسار الملف<input name="filePath" placeholder="app.js" required></label><label>الخطأ الحالي<input name="error" placeholder="مثلاً: missing function"></label><label class="full">تعليمات المالك<textarea name="instruction" placeholder="صف التعديل المطلوب بدقة."></textarea></label><button class="primary">تحليل وإعداد إصلاح</button><div id="aiStatus" class="status"></div></form><article id="aiResult" class="card" style="margin-top:12px;display:none"></article>';
  $("#aiForm").onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget,button=form.querySelector("button"),status=$("#aiStatus"),result=$("#aiResult");
    button.disabled=true;status.textContent="جارٍ تحليل الملف وإعداد فرع آمن...";
    try{
      const data=await api("/api/manager/ai/repair",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(form).entries()))});
      status.textContent="تم إعداد الإصلاح دون الكتابة المباشرة على main.";
      result.style.display="block";
      result.innerHTML='<h3>نتيجة الوكيل</h3><p>'+esc(data.analysis?.diagnosis||"")+'</p><p>'+esc(data.analysis?.root_cause||"")+'</p><p><a class="primary" href="'+esc(data.staged.pullRequestUrl||"#")+'" target="_blank" rel="noopener">فتح Pull Request</a></p><p class="muted">Branch: '+esc(data.staged.branch||"")+'</p>';
    }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
  };
}

$("#loginForm").onsubmit=async event=>{
  event.preventDefault();
  const form=event.currentTarget,button=form.querySelector("button[type=submit]");
  button.disabled=true;setStatus("جارٍ التحقق من حساب المالك...");
  try{await login(form.identifier.value,form.password.value);}catch(error){setStatus(error.message,true);}finally{button.disabled=false;}
};
$("#logout").onclick=()=>{saveToken("");state.user=null;showLogin();};
$("#tabs").querySelectorAll("button").forEach(button=>button.onclick=()=>loadTab(button.dataset.tab));
bootstrap();

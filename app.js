const API = "https://lawstudentsunionapi.onrender.com";
const tokenKey = "lsu_token";

const state = {
  user: null,
  conversation: null,
  pollTimer: null,
  chatTimer: null,
  activityTimer: null
};

const pageName = document.body?.dataset?.page || "home";

function token(){ return localStorage.getItem(tokenKey) || ""; }
function saveToken(value){ value ? localStorage.setItem(tokenKey, value) : localStorage.removeItem(tokenKey); }

function esc(value){
  return String(value ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function role(){ return state.user?.role || "guest"; }
function isManager(){ return ["admin","owner"].includes(role()); }

function go(path, params = {}){
  const query = new URLSearchParams(params);
  const clean = String(path).replace(/\/+$/,"") || "/";
  location.href = clean + (query.toString() ? "?" + query : "");
}

function profileUrl(userOrId){
  const id = typeof userOrId === "object" ? (userOrId?.profile_slug || userOrId?.id) : userOrId;
  return "/profile/?id=" + encodeURIComponent(id || "");
}

async function api(path, options = {}){
  const headers = new Headers(options.headers || {});
  if(options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")){
    headers.set("Content-Type","application/json");
  }
  if(token()) headers.set("Authorization","Bearer " + token());
  headers.set("Accept","application/json");
  const response = await fetch(API + path, {
    ...options, headers, cache:"no-store", credentials:"omit"
  });
  const data = await response.json().catch(()=>({ok:false,message:"استجابة غير صالحة من الخادم."}));
  if(response.status === 401 && pageName !== "login" && pageName !== "registration" && pageName !== "activate"){
    saveToken(); state.user=null; go("/login/");
  }
  if(!response.ok || data.ok === false) throw new Error(data.message || "تعذر تنفيذ الطلب.");
  return data;
}

async function loadUser(){
  if(!token()) return null;
  try{
    const data = await api("/api/auth/me");
    state.user = data.user || null;
  }catch{ state.user = null; saveToken(); }
  return state.user;
}

async function login(identifier,password){
  const data = await api("/api/auth/login",{
    method:"POST",
    body:JSON.stringify({identifier:String(identifier||"").trim(),password:String(password||"")})
  });
  saveToken(data.token);
  state.user=data.user;
  return data.user;
}

async function logout(){
  try{ if(token()) await api("/api/auth/logout",{method:"POST"}); }catch{}
  saveToken(); state.user=null; go("/");
}

function notify(message, type="info"){
  const host=document.querySelector("#toastHost") || document.body.appendChild(Object.assign(document.createElement("div"),{id:"toastHost"}));
  const toast=document.createElement("div");
  toast.className="toast "+type;
  toast.textContent=message;
  host.appendChild(toast);
  setTimeout(()=>toast.remove(),3200);
}

async function activity(page, resourceType=null, resourceId=null, eventType="heartbeat"){
  if(!token()) return;
  try{
    await api("/api/activity/heartbeat",{
      method:"POST",
      body:JSON.stringify({
        page, resource_type:resourceType, resource_id:resourceId,
        event_type:eventType, client_at:new Date().toISOString()
      })
    });
  }catch{}
}

function setupActivity(){
  clearInterval(state.activityTimer);
  activity(pageName);
  state.activityTimer=setInterval(()=>activity(pageName,state.conversation?"conversation":null,state.conversation?.id||null),30000);
}

function setUserShell(){
  const userName=document.querySelector("[data-user-name]");
  const userRole=document.querySelector("[data-user-role]");
  const avatar=document.querySelector("[data-user-avatar]");
  const loginLinks=document.querySelectorAll("[data-auth-guest]");
  const memberLinks=document.querySelectorAll("[data-auth-member]");
  if(userName) userName.textContent=state.user?.full_name || "زائر";
  if(userRole) userRole.textContent=state.user ? (state.user.role==="owner"?"مالك النظام":state.user.role==="admin"?"Admin":"عضو") : "Guest";
  if(avatar) avatar.innerHTML=state.user?.avatar_url ? '<img src="'+esc(state.user.avatar_url)+'" alt="">' : "⚖";
  loginLinks.forEach(x=>x.hidden=!!state.user);
  memberLinks.forEach(x=>x.hidden=!state.user);
  document.querySelectorAll("[data-manager-only]").forEach(x=>x.hidden=!isManager());
  document.querySelectorAll("[data-owner-only]").forEach(x=>x.hidden=role()!=="owner");
  document.querySelectorAll("[data-page-link]").forEach(a=>a.classList.toggle("active",a.dataset.pageLink===pageName));
}

function shellEvents(){
  document.querySelector("#menu")?.addEventListener("click",()=>document.querySelector("#drawer")?.classList.add("open"));
  document.querySelector("#closeDrawer")?.addEventListener("click",()=>document.querySelector("#drawer")?.classList.remove("open"));
  document.querySelector("#shade")?.addEventListener("click",()=>document.querySelector("#drawer")?.classList.remove("open"));
  document.querySelector("#logout")?.addEventListener("click",logout);
  document.querySelector("#notificationDot") && refreshNotificationDot();
  document.querySelectorAll("[data-page-link]").forEach(a=>a.addEventListener("click",()=>document.querySelector("#drawer")?.classList.remove("open")));
  document.querySelectorAll("[data-open-create]").forEach(b=>b.addEventListener("click",()=>go("/create/")));
}

async function refreshNotificationDot(){
  const dot=document.querySelector("#notificationDot");
  if(!dot || !state.user) return;
  try{
    const data=await api("/api/user-notifications");
    dot.hidden=!(data.notifications||[]).some(x=>!x.is_read);
  }catch{ dot.hidden=true; }
}

function empty(title="لا توجد بيانات"){
  return '<div class="empty"><strong>'+esc(title)+'</strong><span>ستظهر هنا البيانات عندما يتم إنشاؤها.</span></div>';
}

function sectionHeader(title,sub="",action=""){
  return '<div class="section-title"><div><h1>'+esc(title)+'</h1>'+(sub?'<p>'+esc(sub)+'</p>':'')+'</div>'+action+'</div>';
}

function postCard(post){
  const author=post.author||{};
  const media=post.image_url ? '<figure class="post-media"><img src="'+esc(post.image_url)+'" alt="صورة المنشور" loading="lazy"><button type="button" data-download="'+post.id+'">تنزيل</button></figure>' : "";
  const comments=(post.comments||[]).slice(-5).map(c=>'<div class="comment"><a href="'+profileUrl(c.author)+'"><strong>'+esc(c.author?.full_name||"عضو")+'</strong></a><span>'+esc(c.body)+'</span></div>').join("");
  const own=Number(state.user?.id)===Number(author.id);
  const manage=isManager();
  return '<article class="post card" data-post="'+post.id+'">'+
    '<header class="post-head"><a class="post-author" href="'+profileUrl(author)+'"><span class="avatar">'+(author.avatar_url?'<img src="'+esc(author.avatar_url)+'" alt="">':"👤")+'</span><span><b>'+esc(author.full_name||"عضو الاتحاد")+'</b><small>'+esc(new Date(post.created_at).toLocaleString("ar-LY"))+'</small></span></a>'+(post.is_pinned?'<span class="tag">مثبت</span>':'')+'</header>'+
    '<div class="post-content">'+(post.title?'<h2>'+esc(post.title)+'</h2>':"")+(post.content_type==="article"&&post.body_html?post.body_html:'<p>'+esc(post.body).replaceAll("\\n","<br>")+'</p>')+(post.hashtags?.length?'<div class="hashtags">'+post.hashtags.map(x=>'<span>#'+esc(x)+'</span>').join(" ")+'</div>':"")+media+'</div>'+
    '<div class="post-actions">'+
      '<button type="button" data-like="'+post.id+'" class="'+(post.liked_by_me?"active":"")+'">♥ <span>'+Number(post.likes_count||0)+'</span></button>'+
      '<button type="button" data-comment="'+post.id+'">💬 <span>'+Number(post.comments_count||0)+'</span></button>'+
      '<button type="button" data-share="'+post.id+'">↗ مشاركة</button>'+
      (manage?'<button type="button" data-pin="'+post.id+'">'+(post.is_pinned?"إلغاء التثبيت":"تثبيت")+'</button>':"")+
      ((own||manage)?'<button type="button" data-delete-post="'+post.id+'" class="danger-text">حذف</button>':"")+
      '<button type="button" data-report="'+post.id+'">⚑</button>'+
    '</div>'+
    '<div class="comments">'+comments+
      (state.user?'<form data-comment-form="'+post.id+'"><input name="body" maxlength="2000" placeholder="اكتب تعليقاً..." required><button>إرسال</button></form>':'<span class="muted">سجل الدخول للتعليق والتفاعل.</span>')+
    '</div></article>';
}

async function loadPosts(section="community",target="#feed"){
  const host=document.querySelector(target);
  if(!host) return;
  host.innerHTML='<div class="loading">جارٍ تحميل المنشورات...</div>';
  try{
    const data=await api("/api/posts?section="+encodeURIComponent(section)+"&limit=30");
    host.innerHTML=(data.posts||[]).length?(data.posts||[]).map(postCard).join(""):empty("لا توجد منشورات بعد.");
    bindPosts(host,section);
  }catch(error){ host.innerHTML='<div class="empty error-box"><strong>تعذر تحميل المنشورات</strong><span>'+esc(error.message)+'</span></div>'; }
}

function bindPosts(host,section){
  host.querySelectorAll("[data-like]").forEach(btn=>btn.onclick=async()=>{
    if(!state.user){go("/login/");return;}
    btn.disabled=true;
    try{
      const data=await api("/api/posts/"+btn.dataset.like+"/like",{method:"POST"});
      btn.classList.toggle("active",data.liked);
      btn.querySelector("span").textContent=data.likes_count;
    }catch(e){notify(e.message,"error");}finally{btn.disabled=false;}
  });
  host.querySelectorAll("[data-comment]").forEach(btn=>btn.onclick=()=>host.querySelector('[data-comment-form="'+btn.dataset.comment+'"] input')?.focus());
  host.querySelectorAll("[data-share]").forEach(btn=>btn.onclick=async()=>{
    const url=location.origin+"/posts/?id="+encodeURIComponent(btn.dataset.share);
    try{if(navigator.share) await navigator.share({title:"اتحاد طلبة كلية القانون",url});else{await navigator.clipboard.writeText(url);notify("تم نسخ رابط المنشور.","success");}}catch{}
  });
  host.querySelectorAll("[data-download]").forEach(btn=>btn.onclick=async()=>{
    const img=host.querySelector('[data-post="'+btn.dataset.download+'"] .post-media img');
    if(!img?.src) return;
    try{
      const response=await fetch(img.src,{cache:"no-store"});
      const blob=await response.blob();
      const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="lsu-post-"+btn.dataset.download;
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    }catch{ window.open(img.src,"_blank","noopener"); }
  });
  host.querySelectorAll("[data-pin]").forEach(btn=>btn.onclick=async()=>{
    try{await api("/api/posts/"+btn.dataset.pin+"/pin",{method:"PATCH",body:JSON.stringify({pinned:btn.textContent.includes("تثبيت")&&!btn.textContent.includes("إلغاء")})});await loadPosts(section,"#"+host.id);}catch(e){notify(e.message,"error");}
  });
  host.querySelectorAll("[data-delete-post]").forEach(btn=>btn.onclick=async()=>{
    if(!confirm("حذف المنشور نهائياً؟")) return;
    try{await api("/api/posts/"+btn.dataset.deletePost,{method:"DELETE"});await loadPosts(section,"#"+host.id);}catch(e){notify(e.message,"error");}
  });
  host.querySelectorAll("[data-report]").forEach(btn=>btn.onclick=async()=>{
    if(!state.user){go("/login/");return;}
    const reason=prompt("سبب البلاغ:");
    if(!reason?.trim()) return;
    try{await api("/api/posts/"+btn.dataset.report+"/report",{method:"POST",body:JSON.stringify({reason:reason.trim()})});notify("تم إرسال البلاغ.","success");}
    catch(e){notify(e.message,"error");}
  });
  host.querySelectorAll("[data-comment-form]").forEach(form=>form.onsubmit=async e=>{
    e.preventDefault();
    const input=form.elements.body;
    if(!input.value.trim()) return;
    try{await api("/api/posts/"+form.dataset.commentForm+"/comments",{method:"POST",body:JSON.stringify({body:input.value.trim()})});input.value="";await loadPosts(section,"#"+host.id);}
    catch(e){notify(e.message,"error");}
  });
}

async function renderHome(){
  const host=document.querySelector("#feed");
  if(host) await loadPosts("community","#feed");
  const count=document.querySelector("#onlineCount");
  if(count){try{count.textContent=(await api("/api/presence/online-count")).count||0;}catch{count.textContent="0";}}
}

async function renderSimpleData(endpoint,target,mapFn,title){
  const host=document.querySelector(target); if(!host) return;
  host.innerHTML='<div class="loading">جارٍ التحميل...</div>';
  try{
    const data=await api(endpoint);
    const rows=mapFn(data);
    host.innerHTML=rows.length?rows.join(""):empty("لا توجد عناصر منشورة.");
  }catch(e){host.innerHTML='<div class="empty error-box"><strong>تعذر التحميل</strong><span>'+esc(e.message)+'</span></div>';}
}

async function renderAnnouncements(){
  await renderSimpleData("/api/announcements","#announcementList",d=>(d.announcements||[]).map(x=>'<article class="card content-card"><span class="tag">'+esc(x.tag||"عام")+'</span><h2>'+esc(x.title)+'</h2><p>'+esc(x.body)+'</p><small>'+esc(new Date(x.published_at||Date.now()).toLocaleString("ar-LY"))+'</small></article>');
}

async function renderActivities(){
  await renderSimpleData("/api/activities","#activityList",d=>(d.activities||[]).map(x=>'<article class="card content-card"><span class="tag">'+esc(x.tag||"فعالية")+'</span><h2>'+esc(x.title)+'</h2><p>'+esc(x.body)+'</p><div class="activity-meta"><b>'+esc(x.event_date?new Date(x.event_date).toLocaleDateString("ar-LY"):"موعد يحدد لاحقاً")+'</b></div></article>');
}

async function renderSchedule(){
  await renderSimpleData("/api/schedule","#scheduleList",d=>(d.schedule||[]).map(x=>'<article class="card schedule-row"><div><h3>'+esc(x.title)+'</h3><p>'+esc(x.body||"")+'</p></div><div><b>'+esc(x.day_name||"")+'</b><span>'+esc((x.start_time||"").slice(0,5))+(x.end_time?" — "+esc(x.end_time.slice(0,5)):"")+'</span><small>'+esc(x.room||"")+'</small></div></article>'));
}

async function renderNotifications(){
  const list=document.querySelector("#notificationList"); if(!list||!state.user){go("/login/");return;}
  const data=await api("/api/user-notifications");
  list.innerHTML=(data.notifications||[]).length?(data.notifications||[]).map(n=>'<article class="card notification"><div><strong>'+esc(n.title)+'</strong><p>'+esc(n.body||"")+'</p></div><small>'+esc(new Date(n.created_at).toLocaleString("ar-LY"))+'</small></article>').join(""):empty("لا توجد إشعارات.");
  document.querySelector("#readAll")?.addEventListener("click",async()=>{await api("/api/user-notifications/read-all",{method:"POST"});await refreshNotificationDot();await renderNotifications();});
  await api("/api/notifications/settings").then(settings=>{
    const box=document.querySelector("#notificationSettings");
    if(box) box.innerHTML='<label><input type="checkbox" data-setting="all_members" '+(settings.settings?.all_members!==false?"checked":"")+'> إشعارات المجتمع</label><label><input type="checkbox" data-setting="administration" '+(settings.settings?.administration!==false?"checked":"")+'> الإدارة</label><label><input type="checkbox" data-setting="friends" '+(settings.settings?.friends!==false?"checked":"")+'> الأصدقاء</label><label><input type="checkbox" data-setting="announcements" '+(settings.settings?.announcements!==false?"checked":"")+'> الإعلانات</label>';
    box?.querySelectorAll("[data-setting]").forEach(i=>i.addEventListener("change",async()=>{
      const payload={};box.querySelectorAll("[data-setting]").forEach(x=>payload[x.dataset.setting]=x.checked);
      try{await api("/api/notifications/settings",{method:"PUT",body:JSON.stringify(payload)});refreshNotificationDot();}catch(e){notify(e.message,"error");}
    }));
  }).catch(()=>{});
}

async function renderLogin(){
  const form=document.querySelector("#loginForm"); if(!form) return;
  form.onsubmit=async e=>{
    e.preventDefault(); const button=form.querySelector("button[type=submit]"); const status=form.querySelector(".form-status");
    button.disabled=true; status.textContent="جارٍ التحقق...";
    try{await login(form.identifier.value,form.password.value);go("/");}catch(error){status.textContent=error.message;button.disabled=false;}
  };
}

async function renderRegistration(){
  const form=document.querySelector("#membershipForm"); if(!form) return;
  form.onsubmit=async e=>{
    e.preventDefault();
    const status=form.querySelector(".form-status"),btn=form.querySelector("button[type=submit]");
    btn.disabled=true;status.textContent="جارٍ التحقق وحفظ الطلب...";
    try{
      const payload=Object.fromEntries(new FormData(form).entries());
      const data=await api("/api/membership/apply",{method:"POST",body:JSON.stringify(payload)});
      status.innerHTML='<span class="success-text">تم حفظ الطلب رقم '+esc(data.application.id)+'. حالة الفحص الآلي: '+esc(data.verification?.summary||"مراجعة إدارية")+'</span>';
      form.reset();
    }catch(error){status.textContent=error.message;btn.disabled=false;}
  };
}

async function renderActivate(){
  const form=document.querySelector("#activateForm"); if(!form) return;
  form.onsubmit=async e=>{
    e.preventDefault(); const status=form.querySelector(".form-status"),btn=form.querySelector("button[type=submit]");
    if(form.password.value!==form.confirm.value){status.textContent="كلمتا المرور غير متطابقتين.";return;}
    btn.disabled=true;
    try{
      const data=await api("/api/membership/activate",{method:"POST",body:JSON.stringify({
        student_id:form.student_id.value.trim(),phone:form.phone.value.trim(),password:form.password.value
      })});
      saveToken(data.token);state.user=data.user;go("/");
    }catch(error){status.textContent=error.message;btn.disabled=false;}
  };
}

function fileToDataURL(file,maxBytes){
  return new Promise((resolve,reject)=>{
    if(!file){resolve(null);return;}
    if(file.size>maxBytes) return reject(new Error("حجم الملف أكبر من المسموح."));
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(new Error("تعذر قراءة الملف."));
    reader.readAsDataURL(file);
  });
}

async function renderCreate(){
  if(!state.user){go("/login/");return;}
  const root=document.querySelector("#createRoot"); if(!root)return;
  const tabs=root.querySelectorAll("[data-create-type]"),box=root.querySelector("#createFormBox");
  const renderType=type=>{
    tabs.forEach(x=>x.classList.toggle("active",x.dataset.createType===type));
    if(type==="poll"){
      box.innerHTML='<form class="form" id="pollForm"><label>السؤال<textarea name="question" required></textarea></label><div id="pollOptions"><input name="option" required placeholder="الخيار 1"><input name="option" required placeholder="الخيار 2"></div><button type="button" class="btn secondary" id="addOption">+ إضافة خيار</button><label>الهاشتاقات<input name="hashtags"></label><button class="btn" type="submit">نشر الاستفتاء</button><div class="form-status"></div></form>';
      document.querySelector("#addOption").onclick=()=>{const wrap=document.querySelector("#pollOptions");if(wrap.children.length<8){const i=document.createElement("input");i.name="option";i.placeholder="خيار جديد";wrap.appendChild(i);}};
      document.querySelector("#pollForm").onsubmit=async e=>{
        e.preventDefault();const form=e.currentTarget,btn=form.querySelector("button[type=submit]"),status=form.querySelector(".form-status");
        const fd=new FormData(form);const options=fd.getAll("option").map(x=>String(x).trim()).filter(Boolean);
        btn.disabled=true;
        try{await api("/api/polls",{method:"POST",body:JSON.stringify({question:fd.get("question"),options,hashtags:String(fd.get("hashtags")||"").split(/[,\s]+/).filter(Boolean),duration_minutes:1440,allow_vote_change:true,anonymous:false,results_visibility:"after_vote"})});notify("تم نشر الاستفتاء.","success");go("/");}
        catch(err){status.textContent=err.message;btn.disabled=false;}
      };
      return;
    }
    box.innerHTML='<form class="form" id="postForm"><label>المساحة<select name="section"><option value="community">مجتمع الطلبة</option><option value="activities">الأنشطة والفعاليات</option><option value="study">الدراسة</option></select></label><label>العنوان<input name="title" maxlength="255"></label><label>المحتوى<textarea name="body" rows="9" maxlength="10000" required></textarea></label><label>الهاشتاقات<input name="hashtags" placeholder="#قانون #دراسة"></label><label class="file-picker">إضافة صورة<input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif"></label><div id="uploadStatus"></div><button class="btn" type="submit">'+(type==="article"?"نشر المقال":"نشر المنشور")+'</button><div class="form-status"></div></form>';
    const form=document.querySelector("#postForm");
    form.onsubmit=async e=>{
      e.preventDefault();const btn=form.querySelector("button[type=submit]"),status=form.querySelector(".form-status");btn.disabled=true;status.textContent="جارٍ النشر...";
      try{
        const fd=new FormData(form),file=form.image.files?.[0],image=await fileToDataURL(file,2*1024*1024);
        await api("/api/posts",{method:"POST",body:JSON.stringify({section:fd.get("section"),title:fd.get("title"),body:fd.get("body"),body_html:null,content_type:type==="article"?"article":"post",hashtags:String(fd.get("hashtags")||"").split(/[,\s]+/).filter(Boolean),image_url:image})});
        go("/");
      }catch(err){status.textContent=err.message;btn.disabled=false;}
    };
  };
  tabs.forEach(x=>x.onclick=()=>renderType(x.dataset.createType));
  renderType("post");
}

async function renderProfile(){
  const root=document.querySelector("#profileRoot");if(!root)return;
  const requested=new URLSearchParams(location.search).get("id");
  const id=requested || state.user?.profile_slug || state.user?.id;
  if(!id){go("/login/");return;}
  try{
    const data=await api("/api/profile/"+encodeURIComponent(id));
    const u=data.user, own=Number(u.id)===Number(state.user?.id);
     root.innerHTML=`<section class="profile-hero" ${u.profile_background_url ? 'style="background-image:url(\''+esc(u.profile_background_url)+'\')"' : ""}><div class="profile-avatar-xl">${u.avatar_url?'<img src="'+esc(u.avatar_url)+'" alt="">':"👤"}</div><div><h1>${esc(u.full_name)}</h1><span class="tag">${esc(u.role==="admin"&&!own?"Admin":"عضو")}</span></div></section><article class="card profile-details"><div class="profile-actions"><button class="btn" id="copyProfile">نسخ رابط الملف</button>${own?'<button class="btn secondary" id="editProfile">تعديل الملف</button>':'<button class="btn" id="friendBtn">إضافة صديق</button>'}</div><div class="detail-grid"><div><small>السنة الدراسية</small><strong>${esc(u.academic_year||"غير محددة")}</strong></div><div><small>الحالة</small><strong>${u.online?"متصل الآن":"غير متصل"}</strong></div></div><div class="bio"><small>السيرة</small><p>${esc(u.bio||"لم تتم إضافة سيرة ذاتية.")}</p></div></article>`;
    document.querySelector("#copyProfile")?.addEventListener("click",async()=>{const url=location.origin+profileUrl(u);try{await navigator.clipboard.writeText(url);notify("تم نسخ الرابط.","success");}catch{prompt("انسخ الرابط",url);}});
    document.querySelector("#editProfile")?.addEventListener("click",()=>openProfileEditor(u));
    document.querySelector("#friendBtn")?.addEventListener("click",()=>friendAction(u));
  }catch(error){root.innerHTML='<div class="empty error-box"><strong>تعذر تحميل الملف</strong><span>'+esc(error.message)+'</span></div>';}
}

function openProfileEditor(u){
  const root=document.querySelector("#profileRoot");
  root.insertAdjacentHTML("beforeend",'<div class="modal open" id="profileModal"><div class="modal-card"><button class="modal-close" id="closeProfileModal">×</button><h2>تعديل الملف</h2><form class="form" id="profileForm"><label>الاسم<input name="full_name" value="'+esc(u.full_name)+'"></label><label>الهاتف<input name="phone" value="'+esc(u.phone||"")+'"></label><label>السنة الدراسية<input name="academic_year" value="'+esc(u.academic_year||"")+'"></label><label>السيرة<textarea name="bio">'+esc(u.bio||"")+'</textarea></label><label>البريد<input name="email" type="email" value="'+esc(u.email||"")+'"></label><label>الصورة<input name="avatar" type="file" accept="image/png,image/jpeg,image/webp"></label><label>الغلاف<input name="cover" type="file" accept="image/png,image/jpeg,image/webp"></label><button class="btn">حفظ</button><div class="form-status"></div></form></div></div>');
  document.querySelector("#closeProfileModal").onclick=()=>document.querySelector("#profileModal")?.remove();
  document.querySelector("#profileForm").onsubmit=async e=>{
    e.preventDefault();const form=e.currentTarget,status=form.querySelector(".form-status"),btn=form.querySelector("button[type=submit]");btn.disabled=true;
    try{
      const avatar=await fileToDataURL(form.avatar.files?.[0],1500000),cover=await fileToDataURL(form.cover.files?.[0],1500000);
      await api("/api/profile",{method:"PUT",body:JSON.stringify({full_name:form.full_name.value,phone:form.phone.value,academic_year:form.academic_year.value,bio:form.bio.value,email:form.email.value||null,avatar_url:avatar,cover_url:cover})});
      notify("تم حفظ الملف.","success");location.reload();
    }catch(err){status.textContent=err.message;btn.disabled=false;}
  };
}

async function friendAction(u){
  try{
    const s=await api("/api/friends/status/"+u.id);
    if(s.status==="accepted"){await api("/api/friends/"+u.id,{method:"DELETE"});notify("تمت إزالة الصداقة.","success");return;}
    if(s.status==="pending_sent"){notify("طلب الصداقة قيد المراجعة.");return;}
    if(s.status==="pending_received"){await api("/api/friends/"+u.id+"/accept",{method:"POST"});notify("تم قبول الطلب.","success");return;}
    await api("/api/friends/"+u.id+"/request",{method:"POST"});notify("تم إرسال طلب الصداقة.","success");
  }catch(e){notify(e.message,"error");}
}

async function renderOnlineHub(){
  if(!state.user){go("/login/");return;}
  const list=document.querySelector("#onlineList");if(!list)return;
  async function load(){
    try{
      const data=await api("/api/presence/online-hub");
      const labels={home:"الرئيسية",announcements:"الإعلانات",activities:"الأنشطة",schedule:"الجدول",chat:"الدردشة",posts:"المنشورات",create:"الإنشاء",profile:"الملف الشخصي"};
      list.innerHTML=(data.users||[]).length?(data.users||[]).map(u=>'<a class="online-user card" href="'+profileUrl(u)+'"><span class="avatar">'+(u.avatar_url?'<img src="'+esc(u.avatar_url)+'" alt="">':"👤")+'</span><span><strong>'+esc(u.full_name)+'</strong><small>نشط في '+esc(labels[u.current_page]||"التطبيق")+'</small></span><span>‹</span></a>').join(""):empty("لا يوجد أعضاء نشطون الآن.");
    }catch{}
  }
  await load();clearInterval(state.chatTimer);state.chatTimer=setInterval(()=>document.visibilityState==="visible"&&load(),10000);
}

async function renderChat(){
  if(!state.user){go("/login/");return;}
  const list=document.querySelector("#chatList"),messages=document.querySelector("#chatMessages"),form=document.querySelector("#chatForm");if(!list||!messages||!form)return;
  async function loadList(){
    try{
      const data=await api("/api/chat/conversations");
      list.innerHTML=(data.conversations||[]).map(c=>'<button type="button" class="chat-item '+(state.conversation?.id===c.id?"active":"")+'" data-open-chat="'+c.id+'"><span class="avatar">💬</span><span><strong>'+esc(c.name||"محادثة")+'</strong><small>'+esc(c.last_message||"لا توجد رسائل بعد")+'</small></span></button>').join("")||empty("لا توجد محادثات.");
      list.querySelectorAll("[data-open-chat]").forEach(b=>b.onclick=()=>openChat(Number(b.dataset.openChat)));
    }catch(error){list.innerHTML='<div class="empty error-box">'+esc(error.message)+'</div>';}
  }
  async function openChat(id){
    try{
      const data=await api("/api/chat/conversations/"+id+"/messages");
      state.conversation=data.conversation;setupActivity();
      document.querySelector("#chatTitle").textContent=data.conversation?.name||"محادثة";
      document.querySelector("#chatSubtitle").textContent=(data.conversation?.members||[]).length+" أعضاء";
      messages.innerHTML=(data.messages||[]).map(m=>'<article class="message '+(Number(m.sender?.id)===Number(state.user.id)?"mine":"")+'"><div class="message-body">'+(m.body?'<p>'+esc(m.body).replaceAll("\\n","<br>")+'</p>':"")+(m.image_url?'<img src="'+esc(m.image_url)+'" alt="">':"")+(m.audio_url?'<audio controls src="'+esc(m.audio_url)+'"></audio>':"")+'</div><small>'+esc(new Date(m.created_at).toLocaleTimeString("ar-LY",{hour:"2-digit",minute:"2-digit"}))+'</small></article>').join("")||empty("ابدأ المحادثة.");
      messages.scrollTop=messages.scrollHeight;
      await loadList();
    }catch(error){notify(error.message,"error");}
  }
  const requested=Number(new URLSearchParams(location.search).get("id")||0);
  await loadList();
  if(requested) await openChat(requested);
  form.onsubmit=async e=>{
    e.preventDefault();if(!state.conversation){notify("اختر محادثة أولاً.");return;}
    const input=form.elements.body, file=form.elements.image, btn=form.querySelector("button[type=submit]");
    if(!input.value.trim()&&!file.files?.[0])return;
    btn.disabled=true;
    try{
      const image=await fileToDataURL(file.files?.[0],1500000);
      await api("/api/chat/conversations/"+state.conversation.id+"/messages",{method:"POST",body:JSON.stringify({body:input.value.trim(),image_url:image,audio_url:null})});
      input.value="";file.value="";await openChat(state.conversation.id);
    }catch(err){notify(err.message,"error");}finally{btn.disabled=false;}
  };
  clearInterval(state.chatTimer);state.chatTimer=setInterval(()=>{if(state.conversation&&document.visibilityState==="visible")openChat(state.conversation.id);},5000);
}

function renderAdmin(){
  const root=document.querySelector("#adminRoot");if(!root)return;
  const target=pageName;
  const endpoints={admin:"/api/owner/status",members:"/api/owner/users",users:"/api/owner/users",admins:"/api/owner/users",logs:"/api/owner/audit"};
  const title={admin:"لوحة الإدارة",members:"الأعضاء",users:"المستخدمون",admins:"Admins",logs:"سجل النظام"}[target]||"الإدارة";
  root.innerHTML='<div class="loading">جارٍ تحميل لوحة الإدارة...</div>';
  if(!isManager()){go("/");return;}
  api(endpoints[target]||"/api/owner/status").then(data=>{
    if(target==="admin"){
      root.innerHTML=sectionHeader(title,"بيانات مباشرة من خادم الاتحاد")+'<div class="stats-grid"><div class="stat card"><b>'+esc(data.metrics?.users||0)+'</b><span>مستخدم</span></div><div class="stat card"><b>'+esc(data.metrics?.activeSessions||0)+'</b><span>جلسات نشطة</span></div></div><article class="card"><h2>حالة النظام</h2><p>قاعدة البيانات: متصلة.</p><p>وكيل النشاط: مفعل.</p></article>';
      return;
    }
    if(target==="logs"){root.innerHTML=sectionHeader(title)+((data.events||[]).map(x=>'<article class="card admin-row"><b>'+esc(x.action)+'</b><span>'+esc(x.target_type||"")+'</span><small>'+esc(new Date(x.created_at).toLocaleString("ar-LY"))+'</small></article>').join("")||empty("لا توجد سجلات."));return;}
    const rows=data.users||[];
    root.innerHTML=sectionHeader(title,"إدارة الحسابات")+'<div class="card"><input id="adminSearch" placeholder="بحث بالاسم أو الرقم"><div id="adminRows">'+rows.map(u=>'<div class="admin-row"><div><strong>'+esc(u.full_name)+'</strong><small>'+esc(u.student_id||"")+'</small></div><span class="tag">'+esc(u.role)+'</span><span class="'+(u.is_active?"status-online":"status-offline")+'">'+(u.is_active?"نشط":"موقوف")+'</span>'+(role()==="owner"?'<select data-role-change="'+u.id+'"><option value="member" '+(u.role==="member"?"selected":"")+'>عضو</option><option value="admin" '+(u.role==="admin"?"selected":"")+'>Admin</option></select>':"")+'<button type="button" class="btn secondary" data-user-status="'+u.id+'">'+(u.is_active?"تعطيل":"تفعيل")+'</button></div>').join("")+'</div></div>';
    const applySearch=()=>{const q=(document.querySelector("#adminSearch")?.value||"").toLowerCase();document.querySelectorAll("#adminRows .admin-row").forEach(r=>r.hidden=q&&!r.textContent.toLowerCase().includes(q));};
    document.querySelector("#adminSearch")?.addEventListener("input",applySearch);
    root.querySelectorAll("[data-user-status]").forEach(b=>b.onclick=async()=>{try{await api("/api/admin/users/"+b.dataset.userStatus+"/status",{method:"PATCH",body:JSON.stringify({is_active:b.textContent.includes("تفعيل")})});renderAdmin();}catch(e){notify(e.message,"error");}});
    root.querySelectorAll("[data-role-change]").forEach(s=>s.onchange=async()=>{try{await api("/api/owner/users/"+s.dataset.roleChange+"/role",{method:"PATCH",body:JSON.stringify({role:s.value})});renderAdmin();}catch(e){notify(e.message,"error");}});
  }).catch(error=>root.innerHTML='<div class="empty error-box"><strong>تعذر فتح لوحة الإدارة</strong><span>'+esc(error.message)+'</span></div>');
}

async function renderApplications(){
  if(!isManager()){go("/");return;}
  const root=document.querySelector("#applicationsRoot");if(!root)return;
  try{
    const data=await api("/api/admin/registrations");
    const rows=data.applications||[];
    root.innerHTML=sectionHeader("طلبات العضوية","الفحص الآلي والمراجعة الإدارية")+"<div class=\"stack\">"+(rows.length?rows.map(a=>'<article class="card application-row"><div><strong>'+esc(a.full_name)+'</strong><p>'+esc(a.student_id)+' · '+esc(a.academic_year||"")+' · '+esc(a.phone||"")+'</p><small>'+esc(a.note||"")+'</small></div><div class="application-actions"><span class="tag">'+esc(a.status)+'</span><select data-application="'+a.id+'"><option value="pending" '+(a.status==="pending"?"selected":"")+'>قيد المراجعة</option><option value="approved" '+(a.status==="approved"?"selected":"")+'>مقبول</option><option value="rejected" '+(a.status==="rejected"?"selected":"")+'>مرفوض</option></select>'+(role()==="owner"?'<button type="button" class="btn secondary" data-delete-application="'+a.id+'">حذف</button>':"")+'</div></article>').join(""):empty("لا توجد طلبات.")+"</div>";
    root.querySelectorAll("[data-application]").forEach(s=>s.onchange=async()=>{try{await api("/api/admin/registrations/"+s.dataset.application,{method:"PATCH",body:JSON.stringify({status:s.value,rejection_reason:s.value==="rejected"?prompt("سبب الرفض:")||null:null})});renderApplications();}catch(e){notify(e.message,"error");}});
    root.querySelectorAll("[data-delete-application]").forEach(b=>b.onclick=async()=>{if(confirm("حذف الطلب؟")){try{await api("/api/admin/registrations/"+b.dataset.deleteApplication,{method:"DELETE"});renderApplications();}catch(e){notify(e.message,"error");}}});
  }catch(error){root.innerHTML='<div class="empty error-box"><strong>تعذر تحميل الطلبات</strong><span>'+esc(error.message)+'</span></div>';}
}

async function renderReports(){
  if(!isManager()){go("/");return;}
  const root=document.querySelector("#reportsRoot");if(!root)return;
  try{
    const data=await api("/api/admin/reports");
    root.innerHTML=sectionHeader("البلاغات")+(data.reports||[]).map(r=>'<article class="card report-row"><div><strong>'+esc(r.post_title||"منشور")+'</strong><p>'+esc(r.reason)+'</p><small>المبلغ: '+esc(r.reporter_name||"عضو")+'</small></div><select data-report="'+r.id+'"><option value="open" '+(r.status==="open"?"selected":"")+'>مفتوح</option><option value="resolved" '+(r.status==="resolved"?"selected":"")+'>تمت المعالجة</option><option value="dismissed" '+(r.status==="dismissed"?"selected":"")+'>مرفوض</option></select></article>').join("")||empty("لا توجد بلاغات.");
    root.querySelectorAll("[data-report]").forEach(s=>s.onchange=async()=>{try{await api("/api/admin/reports/"+s.dataset.report,{method:"PATCH",body:JSON.stringify({status:s.value})});renderReports();}catch(e){notify(e.message,"error");}});
  }catch(error){root.innerHTML='<div class="empty error-box">'+esc(error.message)+'</div>';}
}

async function renderOwnerSettings(){
  if(role()!=="owner"){go("/");return;}
  const root=document.querySelector("#settingsRoot");if(!root)return;
  try{
    const data=await api("/api/app-settings"),s=data.settings||{};
    root.innerHTML=sectionHeader("إعدادات النظام","تعديل المحتوى الأساسي")+'<form class="card form" id="settingsForm"><label>عنوان الصفحة الرئيسية<input name="home_title" value="'+esc(s.home_title||"اتحاد طلبة كلية القانون")+'"></label><label>وصف الصفحة الرئيسية<textarea name="home_intro">'+esc(s.home_intro||"")+'</textarea></label><label>عن المجتمع<textarea name="about_body">'+esc(s.about_body||"")+'</textarea></label><button class="btn">حفظ</button><div class="form-status"></div></form>';
    root.querySelector("#settingsForm").onsubmit=async e=>{e.preventDefault();const status=e.currentTarget.querySelector(".form-status");try{await api("/api/app-settings",{method:"PUT",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget).entries()))});status.textContent="تم الحفظ.";notify("تم حفظ الإعدادات.","success");}catch(err){status.textContent=err.message;}};
  }catch(error){root.innerHTML='<div class="empty error-box">'+esc(error.message)+'</div>';}
}

async function mount(){
  await loadUser();
  setUserShell();
  shellEvents();
  setupActivity();
  if(pageName==="home") await renderHome();
  else if(pageName==="announcements") await renderAnnouncements();
  else if(pageName==="activities") await renderActivities();
  else if(pageName==="schedule") await renderSchedule();
  else if(pageName==="notifications") await renderNotifications();
  else if(pageName==="login") await renderLogin();
  else if(pageName==="registration") await renderRegistration();
  else if(pageName==="activate") await renderActivate();
  else if(pageName==="create") await renderCreate();
  else if(pageName==="profile") await renderProfile();
  else if(pageName==="online-hub") await renderOnlineHub();
  else if(pageName==="chat") await renderChat();
  else if(["admin","members","users","admins","logs"].includes(pageName)) renderAdmin();
  else if(pageName==="applications") renderApplications();
  else if(pageName==="reports") renderReports();
  else if(pageName==="settings") renderOwnerSettings();
  else if(pageName==="posts") await loadPosts("community","#postFeed");
  else if(pageName==="content") await loadPosts("community","#contentFeed");
}

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",mount,{once:true}); else mount();

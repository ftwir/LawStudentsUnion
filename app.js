const API = 'https://lawstudentsunionapi.onrender.com';

const app = document.querySelector('#app');

let currentUser = null;

const demo = {
  announcements: [
    {
      title: 'مرحباً بكم في مجتمع اتحاد الطلبة',
      body: 'هذا هو المجتمع الرسمي لطلبة كلية القانون. تابع الأخبار والمناقشات والأنشطة والفعاليات.',
      tag: 'مثبت',
      date: 'اليوم'
    }
  ],

  activities: [
    {
      title: 'ندوة القانون الدستوري',
      body: 'ندوة طلابية مفتوحة حول المبادئ الدستورية وتطبيقاتها.',
      tag: 'ندوة',
      date: 'قريباً'
    }
  ],

  schedule: [
    {
      title: 'الجدول الدراسي',
      body: 'سيتم تحديث الجداول عند اعتمادها.',
      day_name: 'الفصل الحالي',
      start_time: '',
      end_time: '',
      room: ''
    }
  ]
};


/* =========================
   AUTH
========================= */

function getToken(){
  return localStorage.getItem('lsu_token') || '';
}

function setToken(token){
  if(token){
    localStorage.setItem('lsu_token', token);
  }else{
    localStorage.removeItem('lsu_token');
  }
}

async function loadCurrentUser(){

  const token = getToken();

  if(!token){
    currentUser = null;
    updateDrawer();
    return null;
  }

  try{

    const response = await fetch(
      `${API}/api/auth/me`,
      {
        headers:{
          Authorization:`Bearer ${token}`
        },
        cache:'no-store'
      }
    );

    const result = await response.json();

    if(result.ok){

      currentUser = result.user;

      updateDrawer();

      return currentUser;
    }

    setToken('');
    currentUser = null;

  }catch(error){

    /*
      إذا كان الخادم غير متاح،
      نبقي المستخدم Guest بدلاً
      من منعه من دخول التطبيق.
    */

    currentUser = null;
  }

  updateDrawer();

  return null;
}


async function login(identifier,password){

  const response = await fetch(
    `${API}/api/auth/login`,
    {
      method:'POST',

      headers:{
        'Content-Type':'application/json'
      },

      body:JSON.stringify({
        identifier,
        password
      })
    }
  );

  const result = await response.json();

  if(!result.ok){

    throw new Error(
      result.message ||
      'بيانات تسجيل الدخول غير صحيحة.'
    );
  }

  setToken(result.token);

  currentUser = result.user;

  updateDrawer();

  return currentUser;
}


async function logout(){

  const token = getToken();

  try{

    if(token){

      await fetch(
        `${API}/api/auth/logout`,
        {
          method:'POST',

          headers:{
            Authorization:`Bearer ${token}`
          }
        }
      );
    }

  }catch(error){}

  setToken('');

  currentUser = null;

  updateDrawer();

  page('home');
}


/* =========================
   HELPERS
========================= */

function role(){

  if(!currentUser){
    return 'guest';
  }

  return currentUser.role || 'member';
}


function escapeHTML(value){

  return String(value ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}


async function getData(action,fallback){

  try{

    const response = await fetch(
      `${API}?action=${action}`,
      {
        cache:'no-store'
      }
    );

    const result = await response.json();

    return result.ok
      ? result.data
      : fallback;

  }catch(error){

    return fallback;
  }
}


/* =========================
   DRAWER
========================= */

function updateDrawer(){

  const name =
    document.querySelector('#drawerName');

  const roleText =
    document.querySelector('#drawerRole');

  const content =
    document.querySelector('#drawerContent');

  if(!name || !roleText || !content){
    return;
  }

  const r = role();

  const names = {
    guest:'زائر',
    member:'عضو',
    admin:'Admin',
    owner:'Owner'
  };

  name.textContent =
    currentUser?.full_name ||
    names[r];

  roleText.textContent =
    names[r];

  let html = `

    <div class="drawer-section">
      COMMUNITY
    </div>

    <button class="drawer-item" data-page="home">
      <span class="drawer-icon">⌂</span>
      <span>الرئيسية</span>
    </button>

    <button class="drawer-item" data-page="announcements">
      <span class="drawer-icon">📢</span>
      <span>الإعلانات</span>
    </button>

    <button class="drawer-item" data-page="activities">
      <span class="drawer-icon">◈</span>
      <span>الأنشطة والفعاليات</span>
    </button>

    <button class="drawer-item" data-page="schedule">
      <span class="drawer-icon">📅</span>
      <span>الجدول الدراسي</span>
    </button>

    <button class="drawer-item" data-page="notifications">
      <span class="drawer-icon">🔔</span>
      <span>الإشعارات</span>
    </button>

  `;


  if(r === 'guest'){

    html += `

      <div class="drawer-divider"></div>

      <div class="drawer-section">
        ACCOUNT
      </div>

      <button class="drawer-item" data-page="login">
        <span class="drawer-icon">🔐</span>
        <span>تسجيل الدخول</span>
      </button>

      <button class="drawer-item" data-page="registration">
        <span class="drawer-icon">📝</span>
        <span>طلب العضوية</span>
      </button>

    `;

  }else{

    html += `

      <div class="drawer-divider"></div>

      <div class="drawer-section">
        MEMBER
      </div>

      <button class="drawer-item" data-page="profile">
        <span class="drawer-icon">👤</span>
        <span>ملفي الشخصي</span>
      </button>

      <button class="drawer-item" data-page="chat">
        <span class="drawer-icon">💬</span>
        <span>الدردشة</span>
      </button>

    `;
  }


  if(r === 'admin' || r === 'owner'){

    html += `

      <div class="drawer-divider"></div>

      <div class="drawer-section">
        MANAGEMENT
      </div>

      <button class="drawer-item admin"
              data-page="admin">
        <span class="drawer-icon">🛡️</span>
        <span>لوحة الإدارة</span>
      </button>

      <button class="drawer-item admin"
              data-page="members">
        <span class="drawer-icon">👥</span>
        <span>إدارة الأعضاء</span>
      </button>

      <button class="drawer-item admin"
              data-page="applications">
        <span class="drawer-icon">📋</span>
        <span>طلبات العضوية</span>
      </button>

      <button class="drawer-item admin"
              data-page="content">
        <span class="drawer-icon">✏️</span>
        <span>إدارة المحتوى</span>
      </button>

      <button class="drawer-item admin"
              data-page="reports">
        <span class="drawer-icon">🚨</span>
        <span>البلاغات</span>
      </button>

    `;
  }


  if(r === 'owner'){

    html += `

      <div class="drawer-divider"></div>

      <div class="drawer-section">
        OWNER
      </div>

      <button class="drawer-item owner"
              data-page="owner">
        <span class="drawer-icon">👑</span>
        <span>مركز المالك</span>
      </button>

      <button class="drawer-item owner"
              data-page="admins">
        <span class="drawer-icon">🛡️</span>
        <span>إدارة الـAdmins</span>
      </button>

      <button class="drawer-item owner"
              data-page="users">
        <span class="drawer-icon">👥</span>
        <span>جميع المستخدمين</span>
      </button>

      <button class="drawer-item owner"
              data-page="private-chats">
        <span class="drawer-icon">🔒</span>
        <span>القنوات الخاصة</span>
      </button>

      <button class="drawer-item owner"
              data-page="logs">
        <span class="drawer-icon">📜</span>
        <span>سجل النظام</span>
      </button>

      <button class="drawer-item owner"
              data-page="settings">
        <span class="drawer-icon">⚙️</span>
        <span>إعدادات النظام</span>
      </button>

    `;
  }


  html += `

    <div class="drawer-divider"></div>

    <button class="drawer-item"
            data-page="about">
      <span class="drawer-icon">ℹ️</span>
      <span>عن المجتمع</span>
    </button>

  `;


  if(currentUser){

    html += `

      <button class="drawer-item"
              id="logoutButton">
        <span class="drawer-icon">↪</span>
        <span>تسجيل الخروج</span>
      </button>

    `;
  }


  content.innerHTML = html;


  content
    .querySelectorAll('[data-page]')
    .forEach(button => {

      button.onclick = () => {

        page(button.dataset.page);

        drawer(false);
      };

    });


  const logoutButton =
    document.querySelector('#logoutButton');

  if(logoutButton){

    logoutButton.onclick = () => {

      drawer(false);

      logout();
    };
  }
}


/* =========================
   COMMUNITY HOME
========================= */

async function fetchPosts(section){
  const response=await fetch(API+'/api/posts?section='+encodeURIComponent(section||'community')+'&limit=30',{cache:'no-store'});
  const result=await response.json();
  if(!response.ok||!result.ok) throw new Error(result.message||'تعذر تحميل المنشورات.');
  return result.posts||[];
}

function postHTML(post){
  const avatar=post.author&&post.author.avatar_url?'<img src="'+escapeHTML(post.author.avatar_url)+'" alt="">':'👤';
  const comments=(post.comments||[]).slice(-3).map(c=>'<div class="comment"><strong>'+escapeHTML(c.author?.full_name||'عضو')+'</strong><span>'+escapeHTML(c.body)+'</span></div>').join('');
  const manager=['admin','owner'].includes(role());
  const own=currentUser&&Number(currentUser.id)===Number(post.author?.id);
  return '<article class="post" data-post-id="'+post.id+'">'+
    '<div class="post-head"><button class="post-author-link" data-profile="'+escapeHTML(post.author?.profile_slug||post.author?.id||'')+'"><span class="post-avatar">'+avatar+'</span><span class="post-author"><strong>'+escapeHTML(post.author?.full_name||'عضو الاتحاد')+'</strong><small>'+escapeHTML(new Date(post.created_at).toLocaleString('ar-LY'))+'</small></span></button>'+(post.is_pinned?'<span class="tag">مثبت</span>':'')+'</div>'+
    '<div class="post-body">'+(post.title?'<h3>'+escapeHTML(post.title)+'</h3>':'')+'<p>'+escapeHTML(post.body).replaceAll('\\n','<br>')+'</p>'+(post.image_url?'<img class="post-image" src="'+escapeHTML(post.image_url)+'" alt="صورة المنشور" loading="lazy">':'')+'</div>'+
    '<div class="post-actions"><button data-action="like" class="'+(post.liked_by_me?'active':'')+'">♥ <span>'+post.likes_count+'</span></button><button data-action="focus-comment">💬 <span>'+post.comments_count+'</span></button><button data-action="share">↗ مشاركة</button>'+(manager?'<button data-action="pin">'+(post.is_pinned?'إلغاء التثبيت':'تثبيت')+'</button>':'')+((own||manager)?'<button data-action="delete">حذف</button>':'')+'</div>'+
    '<div class="comments">'+comments+(currentUser?'<form class="comment-form"><input name="body" maxlength="2000" placeholder="اكتب تعليقاً..." required><button>إرسال</button></form>':'<small>سجل الدخول للتعليق والإعجاب.</small>')+'</div></article>';
}

async function refreshPostsIn(container,section){
  if(!container)return;
  try{
    const posts=await fetchPosts(section);
    container.innerHTML=posts.length?posts.map(postHTML).join(''):'<div class="empty">لا توجد منشورات هنا بعد. كن أول من يشارك.</div>';
    bindPostEvents(container,section);
  }catch(error){container.innerHTML='<div class="empty">'+escapeHTML(error.message)+'</div>';}
}

function bindPostEvents(container,section){
  container.querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>openProfile(b.dataset.profile));
  container.querySelectorAll('.post').forEach(post=>{
    const id=post.dataset.postId;
    post.querySelector('[data-action="like"]')?.addEventListener('click',async()=>{
      if(!currentUser){page('login');return;}
      const r=await fetch(API+'/api/posts/'+id+'/like',{method:'POST',headers:{Authorization:'Bearer '+getToken()}});
      const x=await r.json(); if(!r.ok||!x.ok){alert(x.message||'تعذر تحديث الإعجاب.');return;}
      const b=post.querySelector('[data-action="like"]');b.classList.toggle('active',x.liked);b.querySelector('span').textContent=x.likes_count;
    });
    post.querySelector('[data-action="focus-comment"]')?.addEventListener('click',()=>post.querySelector('.comment-form input')?.focus());
    post.querySelector('[data-action="share"]')?.addEventListener('click',async()=>{
      const url=location.origin+location.pathname+'#post/'+id;
      try{if(navigator.share)await navigator.share({title:'اتحاد طلبة كلية القانون',text:'منشور من مجتمع الاتحاد',url});else{await navigator.clipboard.writeText(url);alert('تم نسخ رابط المنشور.');}}catch(e){}
    });
    post.querySelector('[data-action="pin"]')?.addEventListener('click',async()=>{
      const pinned=!post.querySelector('[data-action="pin"]').textContent.includes('إلغاء');
      const r=await fetch(API+'/api/posts/'+id+'/pin',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({pinned})});
      const x=await r.json();if(!r.ok||!x.ok){alert(x.message||'تعذر تحديث التثبيت.');return;}if(section==='__management__'){await renderManagementPage('content');}else{await refreshPostsIn(container,section);}
    });
    post.querySelector('[data-action="delete"]')?.addEventListener('click',async()=>{
      if(!confirm('هل تريد حذف هذا المنشور؟'))return;
      const r=await fetch(API+'/api/posts/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+getToken()}});
      const x=await r.json();if(!r.ok||!x.ok){alert(x.message||'تعذر حذف المنشور.');return;}if(section==='__management__'){await renderManagementPage('content');}else{await refreshPostsIn(container,section);}
    });
    post.querySelector('.comment-form')?.addEventListener('submit',async e=>{
      e.preventDefault();const input=e.currentTarget.elements.body;if(!input.value.trim())return;
      const r=await fetch(API+'/api/posts/'+id+'/comments',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({body:input.value.trim()})});
      const x=await r.json();if(!r.ok||!x.ok){alert(x.message||'تعذر إضافة التعليق.');return;}input.value='';await refreshPostsIn(container,section);
    });
  });
}

async function renderHome(){
  app.innerHTML='<section class="community-cover"></section><section class="community-info"><div class="community-avatar">⚖</div><h1>اتحاد طلبة كلية القانون</h1><p>المجتمع الطلابي الرسمي للتواصل، الأخبار، الأنشطة والمناقشات بين طلبة كلية القانون.</p><div class="community-stats"><div><strong>Community</strong><span>المجتمع الرسمي</span></div><div><strong>Public</strong><span>متاح للجميع</span></div><div><strong id="onlineCount">—</strong><span>متصل الآن</span></div></div></section><div class="community-tabs"><button class="active" data-section="community">الرئيسية</button><button data-section="announcements">الإعلانات</button><button data-section="activities">الأنشطة</button><button data-section="study">الدراسة</button></div><div class="section-title"><h2>مساحات الاتحاد</h2><span>Sections</span></div><div class="community-grid"><div class="community-box" data-page="announcements"><div class="box-icon">📢</div><strong>الإعلانات</strong><span>أخبار الاتحاد والتنبيهات الرسمية</span></div><div class="community-box" data-page="activities"><div class="box-icon">🎓</div><strong>الأنشطة والفعاليات</strong><span>الندوات والبرامج والأنشطة</span></div><div class="community-box" data-page="schedule"><div class="box-icon">📚</div><strong>الدراسة</strong><span>الجداول والمعلومات الدراسية</span></div><div class="community-box" data-page="posts"><div class="box-icon">💬</div><strong>مجتمع الطلبة</strong><span>منشورات ومناقشات الأعضاء</span></div></div><div class="section-title"><h2>آخر منشورات المجتمع</h2><span>Community Feed</span></div><div class="feed" id="homePosts"><div class="empty">جارٍ تحميل المنشورات...</div></div>';
  app.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>page(b.dataset.page));
  app.querySelectorAll('[data-section]').forEach(b=>b.onclick=async()=>{app.querySelectorAll('[data-section]').forEach(x=>x.classList.remove('active'));b.classList.add('active');await refreshPostsIn(document.querySelector('#homePosts'),b.dataset.section);});
  const count=await getOnlineCount();const el=document.querySelector('#onlineCount');if(el)el.textContent=count;
  await refreshPostsIn(document.querySelector('#homePosts'),'community');
}


async function heartbeat(){
  const token = getToken();
  if(!token) return;

  try{
    await fetch(`${API}/api/presence/heartbeat`,{
      method:'POST',
      headers:{Authorization:`Bearer ${token}`},
      cache:'no-store'
    });
  }catch(error){}
}

async function getOnlineCount(){
  try{
    const response = await fetch(`${API}/api/presence/online-count`,{
      cache:'no-store'
    });
    const result = await response.json();
    return result.ok ? Number(result.count || 0) : 0;
  }catch(error){
    return 0;
  }
}

function profileLink(user){
  const slug = user?.profile_slug || `u-${user?.id || ''}`;
  return `${location.origin}${location.pathname}#profile/${encodeURIComponent(slug)}`;
}

async function openProfile(identifier){
  if(!identifier) return;
  location.hash = `profile/${encodeURIComponent(identifier)}`;
  await page('profile', identifier);
}

async function copyProfileLink(user){
  const link = profileLink(user);
  try{
    await navigator.clipboard.writeText(link);
    alert('تم نسخ رابط الملف الشخصي.');
  }catch(error){
    prompt('انسخ رابط الملف الشخصي:', link);
  }
}

async function loadPublicProfile(identifier){
  const response = await fetch(
    `${API}/api/profile/${encodeURIComponent(identifier)}`,
    {cache:'no-store'}
  );
  const result = await response.json();

  if(!response.ok || !result.ok){
    throw new Error(result.message || 'تعذر تحميل الملف الشخصي.');
  }

  return result.user;
}

async function renderPostsPage(){
  app.innerHTML='<div class="section-title"><h2>منشورات المجتمع</h2><span>Community</span></div><div class="feed" id="postsPageFeed"><div class="empty">جارٍ تحميل المنشورات...</div></div>';
  await refreshPostsIn(document.querySelector('#postsPageFeed'),'community');
}

async function renderCreatePost(){
  if(!currentUser){page('login');return;}
  app.innerHTML='<div class="section-title"><h2>إنشاء منشور</h2><span>Community</span></div><article class="card"><form class="form" id="createPostForm"><label>المساحة<select name="section"><option value="community">مجتمع الطلبة</option><option value="announcements">الإعلانات</option><option value="activities">الأنشطة والفعاليات</option><option value="study">الدراسة</option></select></label><label>العنوان (اختياري)<input name="title" maxlength="255"></label><label>محتوى المنشور<textarea name="body" maxlength="10000" rows="7" required placeholder="شارك شيئاً مع مجتمع الاتحاد..."></textarea></label><label>صورة<input id="postImageInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><div id="postImagePreview"></div><button class="btn" id="publishPostButton">نشر المنشور</button><div id="postCreateStatus"></div></form></article>';
  let imageData=null;
  document.querySelector('#postImageInput').onchange=e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>5000000){alert('الصورة يجب ألا تتجاوز 5MB.');e.target.value='';return;}const reader=new FileReader();reader.onload=()=>{imageData=reader.result;document.querySelector('#postImagePreview').innerHTML='<img class="post-image" src="'+escapeHTML(imageData)+'" alt="معاينة الصورة">';};reader.readAsDataURL(file);};
  document.querySelector('#createPostForm').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,data=Object.fromEntries(new FormData(form)),button=document.querySelector('#publishPostButton'),status=document.querySelector('#postCreateStatus');button.disabled=true;status.textContent='جارٍ نشر المنشور...';try{const r=await fetch(API+'/api/posts',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({section:data.section,title:data.title,body:data.body,image_url:imageData})});const x=await r.json();if(!r.ok||!x.ok)throw new Error(x.message||'تعذر نشر المنشور.');page('posts');}catch(error){status.textContent=error.message;button.disabled=false;}};
}


/* =========================
   PAGE ROUTER
========================= */


async function adminFetch(path, options = {}) {
  const headers = {
    ...(options.body ? {'Content-Type':'application/json'} : {}),
    ...(options.headers || {}),
    Authorization: 'Bearer ' + getToken()
  };
  const response = await fetch(API + path, {...options, headers, cache:'no-store'});
  const result = await response.json().catch(() => ({ok:false,message:'استجابة غير صالحة من الخادم.'}));
  if(!response.ok || !result.ok) throw new Error(result.message || 'تعذر تنفيذ العملية.');
  return result;
}

function managementGuard(target) {
  if(['admin','members','applications','content','reports'].includes(target) && !['admin','owner'].includes(role())) return false;
  if(['owner','admins','users','private-chats','logs','settings'].includes(target) && role() !== 'owner') return false;
  return true;
}

async function renderManagementPage(target){
  if(!managementGuard(target)){ page('home'); return; }

  const titles = {
    admin:'لوحة الإدارة',
    members:'إدارة الأعضاء',
    content:'إدارة المحتوى',
    reports:'البلاغات',
    owner:'مركز المالك',
    admins:'إدارة الـAdmins',
    users:'جميع المستخدمين',
    'private-chats':'القنوات الخاصة',
    logs:'سجل النظام',
    settings:'إعدادات النظام',
    applications:'طلبات العضوية'
  };

  app.innerHTML = '<div class="section-title"><h2>'+escapeHTML(titles[target] || 'الإدارة')+'</h2><span>Management</span></div><div class="card"><div class="empty">جارٍ تحميل البيانات...</div></div>';

  try{
    if(target === 'applications'){
      app.innerHTML = '<div class="section-title"><h2>طلبات العضوية</h2><span>Membership</span></div><article class="card"><h3>طلبات العضوية</h3><p>نظام التسجيل الحالي ينشئ حساب العضو مباشرة بعد نجاح التسجيل، لذلك لا توجد طلبات معلقة منفصلة في قاعدة البيانات الحالية.</p></article>';
      return;
    }

    if(target === 'members' || target === 'users' || target === 'admins'){
      const data = await adminFetch('/api/admin/users');
      const users = data.users || [];
      const onlyAdmins = target === 'admins';
      const visible = onlyAdmins ? users.filter(u => u.role === 'admin') : users;
      app.innerHTML =
        '<div class="section-title"><h2>'+escapeHTML(titles[target])+'</h2><span>'+visible.length+' حساب</span></div>'+
        '<div class="card admin-table-wrap"><div class="admin-toolbar"><input id="userSearch" placeholder="بحث بالاسم أو الرقم الجامعي..."></div><div id="usersList"></div></div>';

      const renderUsers = () => {
        const q=(document.querySelector('#userSearch')?.value||'').trim().toLowerCase();
        const filtered=visible.filter(u => !q || [u.full_name,u.student_id,u.email,u.academic_year].some(v=>String(v||'').toLowerCase().includes(q)));
        document.querySelector('#usersList').innerHTML = filtered.length ? filtered.map(u =>
          '<div class="admin-user-row">'+
            '<div><strong>'+escapeHTML(u.full_name)+'</strong><small>'+escapeHTML(u.student_id||'—')+' · '+escapeHTML(u.academic_year||'غير محددة')+'</small></div>'+
            '<div class="admin-user-meta"><span class="tag">'+escapeHTML(u.role)+'</span><span class="status-dot '+(u.is_active?'on':'off')+'">'+(u.is_active?'نشط':'موقوف')+'</span></div>'+
            '<div class="admin-user-actions">'+
              (role()==='owner' ? '<select data-role="'+u.id+'"><option value="member" '+(u.role==='member'?'selected':'')+'>عضو</option><option value="admin" '+(u.role==='admin'?'selected':'')+'>Admin</option></select>' : '')+
              '<button class="btn secondary" data-status="'+u.id+'" data-active="'+u.is_active+'">'+(u.is_active?'تعطيل':'تفعيل')+'</button>'+
            '</div></div>'
        ).join('') : '<div class="empty">لا توجد نتائج.</div>';

        document.querySelectorAll('[data-status]').forEach(btn=>btn.onclick=async()=>{
          try{
            await adminFetch('/api/admin/users/'+btn.dataset.status+'/status',{method:'PATCH',body:JSON.stringify({is_active:btn.dataset.active!=='true'})});
            await renderManagementPage(target);
          }catch(e){alert(e.message);}
        });
        document.querySelectorAll('[data-role]').forEach(select=>select.onchange=async()=>{
          try{
            await adminFetch('/api/owner/users/'+select.dataset.role+'/role',{method:'PATCH',body:JSON.stringify({role:select.value})});
            await renderManagementPage(target);
          }catch(e){alert(e.message);await renderManagementPage(target);}
        });
      };
      document.querySelector('#userSearch').oninput=renderUsers;
      renderUsers();
      return;
    }

    if(target === 'content'){
      const sections=['community','announcements','activities','study'];
      const groups=await Promise.all(sections.map(s=>fetchPosts(s).then(posts=>posts.map(p=>({...p,section:s})))));
      const posts=groups.flat().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
      app.innerHTML='<div class="section-title"><h2>إدارة المحتوى</h2><span>'+posts.length+' منشور</span></div><div class="feed" id="managementFeed"></div>';
      const box=document.querySelector('#managementFeed');
      box.innerHTML=posts.length?posts.map(postHTML).join(''):'<div class="empty">لا توجد منشورات.</div>';
      bindPostEvents(box,'__management__');
      return;
    }

    if(target === 'logs'){
      const data=await adminFetch('/api/admin/audit-logs');
      app.innerHTML='<div class="section-title"><h2>سجل النظام</h2><span>'+((data.logs||[]).length)+' عملية</span></div><div class="card admin-log-list">'+((data.logs||[]).map(log =>
        '<div class="admin-log-row"><strong>'+escapeHTML(log.action)+'</strong><span>'+escapeHTML(log.actor_name||'النظام')+'</span><small>'+escapeHTML(new Date(log.created_at).toLocaleString('ar-LY'))+'</small></div>'
      ).join('')||'<div class="empty">لا توجد سجلات بعد.</div>')+'</div>';
      return;
    }

    if(target === 'private-chats'){
      app.innerHTML='<div class="section-title"><h2>القنوات الخاصة</h2><span>Owner</span></div><article class="card"><h3>القنوات الخاصة</h3><p>هذه المساحة محجوزة للقنوات الإدارية الخاصة. سيتم تفعيلها عندما يتم ربط نظام الدردشة الخاص بالاتحاد بالـAPI.</p></article>';
      return;
    }

    if(target === 'settings'){
      app.innerHTML='<div class="section-title"><h2>إعدادات النظام</h2><span>Owner</span></div><article class="card"><h3>إعدادات النظام</h3><p>الإعدادات الحساسة تبقى في بيئة الخادم. لا يتم عرض أسرار الاتصال أو بيانات المالك داخل واجهة الأعضاء.</p></article>';
      return;
    }

    const data=await adminFetch('/api/admin/users');
    const users=data.users||[];
    const active=users.filter(u=>u.is_active).length;
    const admins=users.filter(u=>u.role==='admin').length;
    app.innerHTML='<div class="section-title"><h2>'+escapeHTML(titles[target])+'</h2><span>Live</span></div>'+
      '<div class="community-grid admin-stats">'+
      '<div class="community-box"><strong>'+users.length+'</strong><span>حسابات ظاهرة للإدارة</span></div>'+
      '<div class="community-box"><strong>'+active+'</strong><span>حسابات نشطة</span></div>'+
      '<div class="community-box"><strong>'+admins+'</strong><span>Admins</span></div>'+
      '<div class="community-box"><strong>'+((await Promise.all(['community','announcements','activities','study'].map(s=>fetchPosts(s).catch(()=>[])))).flat().length)+'</strong><span>منشورات المجتمع</span></div>'+
      '</div>'+
      '<article class="card"><h3>'+escapeHTML(target==='owner'?'مركز المالك':'لوحة الإدارة')+'</h3><p>الصلاحيات تُفرض من الخادم، وهذه الواجهة تعرض البيانات الفعلية بدلاً من صفحات تجريبية.</p></article>';
  }catch(error){
    app.innerHTML='<div class="empty"><h3>تعذر تحميل هذه الصفحة</h3><p>'+escapeHTML(error.message)+'</p><button class="btn" onclick="page(\''+escapeHTML(target)+'\')">إعادة المحاولة</button></div>';
  }
}

async function page(p, profileIdentifier = null){

  document
    .querySelectorAll(
      '[data-page]'
    )
    .forEach(x => {

      x.classList.toggle(
        'active',
        x.dataset.page === p
      );

    });


  if(p === 'home'){

    await renderHome();

    return;
  }


  if(p === 'create'){ await renderCreatePost(); return; }

  if(p === 'posts'){ await renderPostsPage(); return; }

  if(p === 'login'){

    app.innerHTML = `

      <div class="login-wrap">

        <div class="login-card">

          <div class="login-logo">
            ⚖
          </div>

          <h1>
            تسجيل الدخول
          </h1>

          <p>
            الدخول إلى حسابك في المجتمع.
          </p>

          <form
            class="form"
            id="loginForm"
          >

            <label>
              رقم القيد أو البريد الإلكتروني

              <input
                name="identifier"
                required
                autocomplete="username"
              >
            </label>

            <label>
              كلمة المرور

              <input
                type="password"
                name="password"
                required
                autocomplete="current-password"
              >
            </label>

            <button
              class="btn"
              id="loginButton"
            >
              تسجيل الدخول
            </button>

            <div id="loginStatus"></div>

          </form>

        </div>

      </div>

    `;


    const form =
      document.querySelector('#loginForm');

    form.onsubmit = async event => {

      event.preventDefault();

      const data =
        Object.fromEntries(
          new FormData(form)
        );

      const button =
        document.querySelector('#loginButton');

      const status =
        document.querySelector('#loginStatus');

      button.disabled = true;

      button.textContent =
        'جارٍ تسجيل الدخول...';

      try{

        await login(
          data.identifier,
          data.password
        );

        page('home');

      }catch(error){

        status.textContent =
          error.message;

        button.disabled = false;

        button.textContent =
          'تسجيل الدخول';
      }
    };

    return;
  }


  if(p === 'announcements'){

    const data =
      await getData(
        'announcements',
        demo.announcements
      );

    app.innerHTML = `

      <div class="section-title">
        <h2>الإعلانات</h2>
        <span>Community</span>
      </div>

      ${data.map(x => `

        <article class="card">

          <span class="tag">
            ${escapeHTML(x.tag || 'عام')}
          </span>

          <h3>
            ${escapeHTML(x.title)}
          </h3>

          <p>
            ${escapeHTML(x.body)}
          </p>

        </article>

      `).join('')}

    `;

    return;
  }


  if(p === 'activities'){

    const data =
      await getData(
        'activities',
        demo.activities
      );

    app.innerHTML = `

      <div class="section-title">
        <h2>الأنشطة والفعاليات</h2>
        <span>Events</span>
      </div>

      ${data.map(x => `

        <article class="card">

          <span class="tag">
            ${escapeHTML(x.tag || 'فعالية')}
          </span>

          <h3>
            ${escapeHTML(x.title)}
          </h3>

          <p>
            ${escapeHTML(x.body)}
          </p>

        </article>

      `).join('')}

    `;

    return;
  }


  if(p === 'notifications'){

    const data =
      await getData(
        'notifications',
        []
      );

    app.innerHTML = `

      <div class="section-title">
        <h2>الإشعارات</h2>
        <span>Notifications</span>
      </div>

      ${data.length
        ? data.map(x => `

          <article class="card">

            <h3>
              ${escapeHTML(x.title)}
            </h3>

            <p>
              ${escapeHTML(x.body)}
            </p>

          </article>

        `).join('')
        : `
          <div class="empty">
            لا توجد إشعارات حالياً.
          </div>
        `
      }

    `;

    return;
  }


  if(p === 'schedule'){

    const data =
      await getData(
        'schedule',
        demo.schedule
      );

    app.innerHTML = `

      <div class="section-title">
        <h2>الجدول الدراسي</h2>
        <span>Schedule</span>
      </div>

      <div class="schedule-list">

        ${data.map(x => `

          <article class="schedule-row">

            <div>

              <strong>
                ${escapeHTML(x.title)}
              </strong>

              <p>
                ${escapeHTML(x.body || '')}
              </p>

            </div>

            <div>

              <strong>
                ${escapeHTML(x.day_name || '')}
              </strong>

              <span>
                ${(x.start_time || '').slice(0,5)}
                ${x.end_time
                  ? ' — ' + x.end_time.slice(0,5)
                  : ''}
              </span>

              <small>
                ${escapeHTML(x.room || '')}
              </small>

            </div>

          </article>

        `).join('')}

      </div>

    `;

    return;
  }


  if(p === 'registration'){

    app.innerHTML = `

      <div class="section-title">

        <h2>
          طلب العضوية
        </h2>

        <span>
          Membership
        </span>

      </div>


      <form
        class="card form"
        id="membershipForm"
      >

        <label>
          الاسم الكامل

          <input
            name="full_name"
            required
            placeholder="الاسم الكامل"
          >
        </label>


        <label>
          رقم القيد

          <input
            name="student_id"
            required
            placeholder="رقم القيد"
          >
        </label>


        <label>
          رقم الهاتف

          <input
            name="phone"
            required
            type="tel"
            placeholder="رقم الهاتف"
          >
        </label>


        <label>
          السنة الدراسية

          <select
            name="academic_year"
            required
          >

            <option value="">
              اختر السنة الدراسية
            </option>

            <option>الأولى</option>
            <option>الثانية</option>
            <option>الثالثة</option>
            <option>الرابعة</option>

          </select>

        </label>


        <label>
          البريد الإلكتروني

          <input
            name="email"
            type="email"
            placeholder="اختياري"
          >
        </label>


        <label>
          ملاحظات

          <textarea
            name="note"
            placeholder="أي معلومات إضافية..."
          ></textarea>
        </label>


        <button class="btn">
          إرسال طلب العضوية
        </button>

        <div id="membershipStatus"></div>

      </form>

    `;


    const form =
      document.querySelector(
        '#membershipForm'
      );

    form.onsubmit = async event => {

      event.preventDefault();

      const status =
        document.querySelector(
          '#membershipStatus'
        );

      status.textContent =
        'جارٍ إرسال الطلب...';

      /*
        نقطة الربط الجديدة مع Backend
        سنربطها لاحقاً بـ:
        /api/membership/apply
      */

      status.textContent =
        'تم تجهيز الطلب. سيتم ربطه بلوحة الإدارة في المرحلة التالية.';
    };

    return;
  }


  /*
    صفحات الأعضاء والإدارة والمالك
    أصبحت محمية في الواجهة.
    الربط الحقيقي بالـBackend يأتي
    في المرحلة التالية.
  */

  if(
    p === 'chat' &&
    !currentUser
  ){

    page('login');

    return;
  }


  if(['admin','members','applications','content','reports','owner','admins','users','private-chats','logs','settings'].includes(p)){
    await renderManagementPage(p);
    return;
  }

  if(p === 'about'){

    app.innerHTML = `

      <div class="section-title">
        <h2>عن المجتمع</h2>
      </div>

      <article class="card">

        <h3>
          اتحاد طلبة كلية القانون
        </h3>

        <p>
          مجتمع طلابي للتواصل ومتابعة الأخبار
          والأنشطة والفعاليات والمناقشات.
        </p>

      </article>

    `;

    return;
  }


  if(p === 'profile'){

    const identifier = profileIdentifier ||
      currentUser?.profile_slug ||
      currentUser?.id;

    if(!identifier){
      page('login');
      return;
    }

    try{
      const user = await loadPublicProfile(identifier);
      const isSelf = currentUser &&
        Number(currentUser.id) === Number(user.id);

      const avatar = user.avatar_url
        ? `<img src="${escapeHTML(user.avatar_url)}" alt="الصورة الشخصية">`
        : '👤';

      const background = user.avatar_url
        ? `style="--profile-bg:url('${escapeHTML(user.avatar_url)}')"`
        : '';

      app.innerHTML = `
        <section class="profile-hero" ${background}>
          <div class="profile-bg-blur"></div>
          <div class="profile-hero-content">
            <button class="profile-back" onclick="page('home')">‹</button>
            <div class="profile-avatar-large">${avatar}</div>
            <div class="profile-main-info">
              <h1>${escapeHTML(user.full_name)}</h1>
              <div class="profile-meta">
                <span class="role-badge">${escapeHTML(user.role)}</span>
                <span class="presence-dot ${user.online ? 'online' : ''}"></span>
                <span>${user.online ? 'متصل الآن' : 'غير متصل'}</span>
              </div>
            </div>
          </div>
        </section>

        <article class="card profile-card">
          <div class="profile-actions">
            <button class="btn" id="copyProfileBtn">🔗 نسخ رابط الملف</button>
            ${isSelf ? '<button class="btn secondary" id="editProfileBtn">✎ تعديل الملف</button>' : ''}
          </div>

          <div class="profile-field">
            <span>السنة الدراسية</span>
            <strong>${escapeHTML(user.academic_year || 'غير محددة')}</strong>
          </div>

          <div class="profile-field">
            <span>السيرة الذاتية</span>
            <p>${escapeHTML(user.bio || 'لم يضف صاحب الحساب سيرة ذاتية بعد.')}</p>
          </div>

          ${user.email ? `
            <div class="profile-field">
              <span>البريد الإلكتروني</span>
              <strong>${escapeHTML(user.email)}</strong>
            </div>
          ` : ''}

          ${user.phone ? `
            <div class="profile-field">
              <span>الهاتف</span>
              <strong>${escapeHTML(user.phone)}</strong>
            </div>
          ` : ''}

          <div class="profile-link-box">
            <span>رابط الملف العام</span>
            <code>${escapeHTML(profileLink(user))}</code>
          </div>
        </article>
      `;

      document.querySelector('#copyProfileBtn').onclick =
        () => copyProfileLink(user);

      if(isSelf){
        document.querySelector('#editProfileBtn').onclick =
          () => renderProfileEditor(user);
      }

    }catch(error){
      app.innerHTML = `
        <div class="empty">
          <h3>تعذر فتح الملف الشخصي</h3>
          <p>${escapeHTML(error.message)}</p>
          <button class="btn" onclick="page('home')">العودة للرئيسية</button>
        </div>
      `;
    }

    return;
  }


  if(p === 'chat'){

    app.innerHTML = `

      <div class="section-title">
        <h2>الدردشة</h2>
        <span>Members</span>
      </div>

      <div class="empty">
        سيتم تفعيل غرف الدردشة للأعضاء
        وربطها بالـBackend في المرحلة التالية.
      </div>

    `;

    return;
  }
}


async function renderProfileEditor(user){

  app.innerHTML = `
    <div class="section-title">
      <h2>تعديل الملف الشخصي</h2>
      <span>Profile</span>
    </div>

    <article class="card">
      <form class="form" id="profileForm">

        <label>
          الصورة الشخصية
          <input id="avatarInput" type="file" accept="image/*">
          <div class="avatar-upload-preview" id="avatarPreview">
            ${user.avatar_url
              ? `<img src="${escapeHTML(user.avatar_url)}" alt="preview">`
              : '👤'}
          </div>
        </label>

        <label>
          الاسم
          <input name="full_name" maxlength="150" value="${escapeHTML(user.full_name || '')}" required>
        </label>

        <label>
          السنة الدراسية
          <input name="academic_year" maxlength="50" value="${escapeHTML(user.academic_year || '')}" placeholder="مثال: السنة الثالثة">
        </label>

        <label>
          السيرة الذاتية
          <textarea name="bio" maxlength="1000" placeholder="اكتب نبذة مختصرة عنك...">${escapeHTML(user.bio || '')}</textarea>
        </label>

        <label>
          البريد الإلكتروني
          <input name="email" type="email" value="${escapeHTML(user.email || '')}">
        </label>

        <label>
          الهاتف
          <input name="phone" value="${escapeHTML(user.phone || '')}">
        </label>

        <label>
          كلمة مرور جديدة
          <input name="password" type="password" minlength="8" placeholder="اتركها فارغة إذا لم ترد تغييرها">
        </label>

        <label class="check-row">
          <input name="show_email" type="checkbox" ${user.privacy_settings?.show_email ? 'checked' : ''}>
          إظهار البريد في الملف العام
        </label>

        <label class="check-row">
          <input name="show_phone" type="checkbox" ${user.privacy_settings?.show_phone ? 'checked' : ''}>
          إظهار الهاتف في الملف العام
        </label>

        <label class="check-row">
          <input name="show_online" type="checkbox" ${user.show_online !== false ? 'checked' : ''}>
          إظهار حالة الاتصال للآخرين
        </label>

        <div class="profile-permission-note">
          الصلاحية الحالية: <b>${escapeHTML(user.role)}</b>.
          لا يمكن تغيير الدور أو الصلاحيات من الملف الشخصي.
        </div>

        <button class="btn" id="saveProfileBtn">حفظ التغييرات</button>
        <div id="profileSaveStatus"></div>
      </form>
    </article>
  `;

  let avatarData = user.avatar_url || null;

  document.querySelector('#avatarInput').onchange = event => {
    const file = event.target.files?.[0];
    if(!file) return;

    if(file.size > 2200000){
      alert('الصورة كبيرة جداً. اختر صورة أقل من 2.2MB.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      avatarData = reader.result;
      document.querySelector('#avatarPreview').innerHTML =
        `<img src="${escapeHTML(avatarData)}" alt="preview">`;
    };
    reader.readAsDataURL(file);
  };

  document.querySelector('#profileForm').onsubmit = async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const status = document.querySelector('#profileSaveStatus');
    const button = document.querySelector('#saveProfileBtn');

    button.disabled = true;
    status.textContent = 'جارٍ حفظ الملف...';

    try{
      const response = await fetch(`${API}/api/profile`,{
        method:'PUT',
        headers:{
          'Content-Type':'application/json',
          Authorization:`Bearer ${getToken()}`
        },
        body:JSON.stringify({
          full_name:data.full_name,
          academic_year:data.academic_year,
          bio:data.bio,
          email:data.email || null,
          phone:data.phone || null,
          avatar_url:avatarData,
          privacy_settings:{
            show_email:form.elements.show_email.checked,
            show_phone:form.elements.show_phone.checked,
            show_online:form.elements.show_online.checked
          },
          password:data.password || undefined
        })
      });

      const result = await response.json();

      if(!response.ok || !result.ok){
        throw new Error(result.message || 'تعذر حفظ التغييرات.');
      }

      currentUser = result.user;
      updateDrawer();
      status.textContent = 'تم حفظ الملف الشخصي بنجاح.';
      setTimeout(() => page('profile', currentUser.profile_slug || currentUser.id), 500);

    }catch(error){
      status.textContent = error.message;
      button.disabled = false;
    }
  };
}


/* =========================
   DRAWER CONTROLS
========================= */

function drawer(open){

  document
    .querySelector('#drawer')
    .classList
    .toggle('open',open);

  document
    .querySelector('#shade')
    .classList
    .toggle('open',open);
}


document
  .querySelector('#menu')
  .onclick = () => {

    updateDrawer();

    drawer(true);
  };


document
  .querySelector('#close')
  .onclick = () => drawer(false);


document
  .querySelector('#shade')
  .onclick = () => drawer(false);


document
  .querySelectorAll(
    '.bottom-nav [data-page], .top-action[data-page]'
  )
  .forEach(button => {

    button.onclick = () => {

      page(button.dataset.page);
    };

  });


/* =========================
   START
========================= */

(async function(){

  await loadCurrentUser();

  await heartbeat();

  setInterval(heartbeat, 30000);

  const hash = location.hash.replace(/^#/, '');
  async function handleHash(){
    const hash = location.hash.replace(/^#/, '');
    if(hash.startsWith('profile/')){
      const identifier = decodeURIComponent(hash.slice('profile/'.length));
      await page('profile', identifier);
      return;
    }
    if(hash.startsWith('post/')){
      const postId = decodeURIComponent(hash.slice('post/'.length));
      await page('posts');
      requestAnimationFrame(() => {
        const target = document.querySelector('.post[data-post-id="'+CSS.escape(postId)+'"]');
        if(target){
          target.scrollIntoView({behavior:'smooth',block:'center'});
          target.classList.add('hash-target');
          setTimeout(()=>target.classList.remove('hash-target'),1800);
        }
      });
      return;
    }
    /*
      التطبيق يبدأ دائماً كـGuest
      إذا لم توجد جلسة صالحة.
    */
    await page('home');
  }

  await handleHash();

  window.addEventListener('hashchange', handleHash);

})();



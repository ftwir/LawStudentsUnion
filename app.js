const API = 'https://lawstudentsunionapi.onrender.com';

const app = document.querySelector('#app');

let currentUser = null;
let currentPageName='home';
let chatPollTimer=null;
let onlineHubTimer=null;
let pendingChatId=null;
let isUserScrolling=false;
let scrollResetTimer=null;
function markUserScrolling(){
  isUserScrolling=true;
  clearTimeout(scrollResetTimer);
  scrollResetTimer=setTimeout(()=>{isUserScrolling=false;},150);
}
function installScrollGuards(){
  document.querySelectorAll('.feed,.feed-container,.chat-list,#chatList,.chat-list-container').forEach(el=>{
    if(el.dataset.scrollGuardInstalled==='1')return;
    el.dataset.scrollGuardInstalled='1';
    el.addEventListener('scroll',markUserScrolling,{passive:true});
    el.addEventListener('touchmove',markUserScrolling,{passive:true});
  });
}

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
  identifier = String(identifier || '').trim();

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

  const avatar = document.querySelector('#drawerAvatar');
  if(avatar){
    avatar.innerHTML = currentUser?.avatar_url
      ? '<img src="'+escapeHTML(currentUser.avatar_url)+'" alt="">'
      : '⚖';
  }

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
    owner:'عضو'
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

function richPostBody(post){
  if(post.content_type==='article' && post.body_html) return post.body_html;
  return '<p>'+escapeHTML(post.body||'').replaceAll('\\n','<br>')+'</p>';
}
function hashtagsHTML(tags){return (tags||[]).map(t=>'<span class="hashtag">#'+escapeHTML(t)+'</span>').join('');}
function postHTML(post){
  const avatar=post.author&&post.author.avatar_url?'<img src="'+escapeHTML(post.author.avatar_url)+'" alt="">':'👤';
  const comments=(post.comments||[]).slice(-3).map(c=>'<div class="comment"><strong>'+escapeHTML(c.author?.full_name||'عضو')+'</strong><span>'+escapeHTML(c.body)+'</span></div>').join('');
  const manager=['admin','owner'].includes(role());
  const own=currentUser&&Number(currentUser.id)===Number(post.author?.id);
  return '<article class="post" data-post-id="'+post.id+'">'+
    '<div class="post-head"><button class="post-author-link" data-profile="'+escapeHTML(post.author?.profile_slug||post.author?.id||'')+'"><span class="post-avatar">'+avatar+'</span><span class="post-author"><strong>'+escapeHTML(post.author?.full_name||'عضو الاتحاد')+'</strong><small>'+escapeHTML(new Date(post.created_at).toLocaleString('ar-LY'))+'</small></span></button>'+(post.is_pinned?'<span class="tag">مثبت</span>':'')+'</div>'+
    '<div class="post-body">'+(post.title?'<h3>'+escapeHTML(post.title)+'</h3>':'')+richPostBody(post)+(post.hashtags?.length?'<div class="hashtags">'+hashtagsHTML(post.hashtags)+'</div>':'')+(post.image_url?'<div class="post-media"><img class="post-image" src="'+escapeHTML(post.image_url)+'" alt="صورة المنشور" loading="lazy"><button type="button" class="media-download" data-action="download-image" title="تنزيل الصورة">⬇ تنزيل الصورة</button></div>':'')+'</div>'+
    '<div class="post-actions"><button data-action="report">⚑</button><button data-action="like" class="'+(post.liked_by_me?'active':'')+'">♥ <span>'+post.likes_count+'</span></button><button data-action="focus-comment">💬 <span>'+post.comments_count+'</span></button><button data-action="share">↗ مشاركة</button>'+(manager?'<button data-action="pin">'+(post.is_pinned?'إلغاء التثبيت':'تثبيت')+'</button>':'')+((own||manager)?'<button data-action="delete">حذف</button>':'')+'</div>'+
    '<div class="comments">'+comments+(currentUser?'<form class="comment-form"><input name="body" maxlength="2000" placeholder="اكتب تعليقاً..." required><button>إرسال</button></form>':'<small>سجل الدخول للتعليق والإعجاب.</small>')+'</div></article>';
}

async function refreshPostsIn(container,section){
  if(!container)return;
  try{
    const posts=await fetchPosts(section);
    if(isUserScrolling)return;
    container.innerHTML=posts.length?posts.map(postHTML).join(''):'<div class="empty">لا توجد منشورات هنا بعد. كن أول من يشارك.</div>';
    bindPostEvents(container,section);
    installScrollGuards();
  }catch(error){
    if(!isUserScrolling)container.innerHTML='<div class="empty">'+escapeHTML(error.message)+'</div>';
  }
}

function bindPostEvents(container,section){
  container.querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>openProfile(b.dataset.profile));
  container.querySelectorAll('.post').forEach(post=>{
    const id=post.dataset.postId;
    post.querySelector('[data-action="report"]')?.addEventListener('click',async()=>{
      if(!getToken()){alert('سجّل الدخول أولاً لإرسال بلاغ.');return;}
      const reason=prompt('اذكر سبب البلاغ:');
      if(!reason?.trim())return;
      try{
        const response=await fetch(API+'/api/posts/'+post.dataset.postId+'/report',{
          method:'POST',
          headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},
          body:JSON.stringify({reason:reason.trim()})
        });
        const result=await response.json();
        if(!response.ok||!result.ok)throw new Error(result.message||'تعذر إرسال البلاغ.');
        alert('تم إرسال البلاغ إلى الإدارة.');
      }catch(e){alert(e.message);}
    });
    post.querySelector('[data-action="like"]')?.addEventListener('click',async()=>{
      if(!currentUser){page('login');return;}
      const r=await fetch(API+'/api/posts/'+id+'/like',{method:'POST',headers:{Authorization:'Bearer '+getToken()}});
      const x=await r.json(); if(!r.ok||!x.ok){alert(x.message||'تعذر تحديث الإعجاب.');return;}
      const b=post.querySelector('[data-action="like"]');b.classList.toggle('active',x.liked);b.querySelector('span').textContent=x.likes_count;
    });
    post.querySelector('[data-action="focus-comment"]')?.addEventListener('click',()=>post.querySelector('.comment-form input')?.focus());
    post.querySelector('[data-action="download-image"]')?.addEventListener('click',async()=>{      const image=post.querySelector('.post-image');      if(!image?.src)return;      const button=post.querySelector('[data-action="download-image"]');      try{        button.disabled=true;        const response=await fetch(image.src,{cache:'no-store'});        if(!response.ok)throw new Error('تعذر تحميل الصورة.');        const blob=await response.blob();        const url=URL.createObjectURL(blob);        const link=document.createElement('a');        link.href=url;link.download='law-students-union-post-'+id+'.'+((blob.type.split('/')[1]||'jpg').replace('jpeg','jpg'));        document.body.appendChild(link);link.click();link.remove();        setTimeout(()=>URL.revokeObjectURL(url),1000);      }catch(error){        const link=document.createElement('a');link.href=image.src;link.download='law-students-union-post-'+id;link.target='_blank';        document.body.appendChild(link);link.click();link.remove();      }finally{button.disabled=false;}    });    post.querySelector('[data-action="share"]')?.addEventListener('click',async()=>{
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
  let site = {};
  try { const r = await fetch(API+'/api/app-settings',{cache:'no-store'}); const x = await r.json(); site = x.settings || {}; } catch(e) {}
  const siteTitle = site.home_title || 'اتحاد طلبة كلية القانون';
  const siteIntro = site.home_intro || 'المساحة الرسمية للطلبة: أخبار، فعاليات، دراسة، منشورات وحوار.';
  app.innerHTML=`
    <div class="home-shell">
      <section class="home-hero">
        <div class="home-hero-mark">⚖</div>
        <div class="home-hero-copy">
          <span class="home-eyebrow">اتحاد طلبة كلية القانون</span>
          <h1>${escapeHTML(siteTitle)}</h1>
          <p>${escapeHTML(siteIntro)}</p>
        </div>
      </section>
      <nav class="community-tabs" aria-label="أقسام الاتحاد">
        <button class="active" data-page="home">الرئيسية</button>
        <button data-page="announcements">الإعلانات</button>
        <button data-page="activities">الأنشطة والفعاليات</button>
        <button data-page="schedule">الجدول</button>
      </nav>
      <section class="home-welcome">
        <h2>مرحباً بك في مجتمع الاتحاد</h2>
        <p>تابع الإعلانات والأنشطة والجدول وشارك زملاءك من مكان واحد.</p>
      </section>
      <div class="section-title"><h2>آخر ما نشره المجتمع</h2><span>Community</span></div>
      <div class="feed" id="homePosts"><div class="empty">جارٍ تحميل المنشورات...</div></div>
    </div>`;

  app.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>page(b.dataset.page));
  const count=await getOnlineCount();const el=document.querySelector('#onlineCount');if(el)el.textContent=count;
  await refreshPostsIn(document.querySelector('#homePosts'),'community');
}


async function heartbeat(){const token=getToken();if(!token)return;try{await fetch(`${API}/api/presence/heartbeat`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({page:currentPageName}),cache:'no-store'});
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
  const headers=getToken()?{Authorization:`Bearer ${getToken()}`} : {};
  const response = await fetch(`${API}/api/profile/${encodeURIComponent(identifier)}`,{headers,cache:'no-store'});
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
  app.innerHTML=`<div class="section-title"><h2>إنشاء</h2><span>شارك مع المجتمع</span></div>
   <div class="create-type-grid">
     <button class="create-type active" data-type="post"><span>✦</span><strong>منشور</strong><small>شارك فكرة أو صورة</small></button>
     <button class="create-type" data-type="poll"><span>◉</span><strong>استفتاء</strong><small>اسأل مجتمع الطلبة</small></button>
     <button class="create-type" data-type="article"><span>▤</span><strong>مقال</strong><small>اكتب محتوى متكاملاً</small></button>
     <button class="create-type" data-type="chat"><span>◌</span><strong>دردشة</strong><small>خاصة أو غرفة جماعية</small></button>
   </div><article class="card" id="createBox"></article>`;
  const box=document.querySelector('#createBox');
  const tags=v=>String(v||'').split(/[,\\s]+/).map(x=>x.replace(/^#/,'').trim()).filter(Boolean).slice(0,12);
  const imagePicker=`<label class="image-picker" for="postImageInput"><span>▧</span><strong>إضافة صورة</strong><small>PNG · JPG · WEBP · GIF حتى 5MB</small></label><input id="postImageInput" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><div id="postImagePreview"></div>`;
     const toolbar=`<div class="editor-toolbar"><button type="button" data-cmd="bold" title="عريض"><b>B</b></button><button type="button" data-cmd="italic" title="مائل"><i>I</i></button><button type="button" data-cmd="underline" title="تحته خط"><u>U</u></button><button type="button" data-cmd="formatBlock" data-value="h2" title="عنوان">H</button><button type="button" data-cmd="formatBlock" data-value="blockquote" title="اقتباس">❝</button><button type="button" data-cmd="justifyRight" title="محاذاة يمين">⇥</button><button type="button" data-cmd="justifyLeft" title="محاذاة يسار">⇤</button><button type="button" data-cmd="indent" title="مسافة بادئة">↪</button><button type="button" data-cmd="outdent" title="إلغاء المسافة البادئة">↩</button><button type="button" data-cmd="insertUnorderedList">•</button><button type="button" data-cmd="insertOrderedList">1.</button><button type="button" data-editor-action="font-decrease" title="تصغير الخط">A−</button><button type="button" data-editor-action="font-increase" title="تكبير الخط">A+</button><button type="button" data-editor-action="insert-image" title="إضافة صورة داخل النص">▧</button><input id="richImageInput" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><label class="editor-color">A<input type="color" id="editorColor" value="#9b88ff"></label></div>`;
   function bindEditor(){
     const ed=document.querySelector('#richEditor');
     if(!ed)return;
     const selection=window.getSelection();
     let savedRange=null;
     const saveSelection=()=>{if(!selection||!selection.rangeCount)return;const range=selection.getRangeAt(0);if(ed.contains(range.commonAncestorContainer))savedRange=range.cloneRange();};
     const restoreSelection=()=>{if(!savedRange||!selection)return;selection.removeAllRanges();selection.addRange(savedRange);};
     const applyFontSize=size=>{ed.focus();restoreSelection();if(!selection||!selection.rangeCount)return;const range=selection.getRangeAt(0);if(range.collapsed)return;const span=document.createElement('span');span.style.fontSize=size;try{span.appendChild(range.extractContents());range.insertNode(span);selection.removeAllRanges();const next=document.createRange();next.selectNodeContents(span);selection.addRange(next);savedRange=next.cloneRange();}catch(error){document.execCommand('styleWithCSS',false,true);document.execCommand('fontSize',false,'3');saveSelection();}};
     ed.addEventListener('mouseup',saveSelection);ed.addEventListener('keyup',saveSelection);ed.addEventListener('input',saveSelection);
     ed.querySelectorAll('[data-cmd]').forEach(button=>{button.addEventListener('mousedown',event=>{event.preventDefault();saveSelection();});button.onclick=()=>{ed.focus();restoreSelection();document.execCommand(button.dataset.cmd,false,button.dataset.value||null);saveSelection();};});
     document.querySelectorAll('[data-editor-action]').forEach(button=>{button.addEventListener('mousedown',event=>{event.preventDefault();saveSelection();});button.onclick=()=>{const action=button.dataset.editorAction;if(action==='font-increase')applyFontSize('1.25em');else if(action==='font-decrease')applyFontSize('0.85em');else document.querySelector('#richImageInput')?.click();};});
     document.querySelector('#editorColor')?.addEventListener('input',event=>{ed.focus();restoreSelection();document.execCommand('foreColor',false,event.target.value);saveSelection();});
     document.querySelector('#richImageInput')?.addEventListener('change',event=>{const file=event.target.files?.[0];if(!file)return;if(!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)||file.size>5000000){alert('اختر صورة PNG أو JPG أو WEBP أو GIF أقل من 5MB.');event.target.value='';return;}const reader=new FileReader();reader.onload=()=>{ed.focus();restoreSelection();document.execCommand('insertImage',false,reader.result);saveSelection();event.target.value='';};reader.readAsDataURL(file);});
   }
  function bindImage(){const input=document.querySelector('#postImageInput');if(!input)return;input.onchange=x=>{const f=x.target.files?.[0];if(!f)return;if(f.size>5000000){alert('الصورة يجب ألا تتجاوز 5MB.');x.target.value='';return;}const rd=new FileReader();rd.onload=()=>document.querySelector('#postImagePreview').innerHTML='<img class="post-image create-image-preview" src="'+escapeHTML(rd.result)+'">';rd.readAsDataURL(f);};}
  function render(type){
    document.querySelectorAll('.create-type').forEach(b=>b.classList.toggle('active',b.dataset.type===type));
    if(type==='chat'){box.innerHTML=`<div class="create-chat-choice"><button class="create-chat-option" id="createPrivateChat"><span>◉</span><strong>دردشة خاصة</strong><small>محادثة فردية متكافئة بلا مضيف</small></button><button class="create-chat-option" id="createGroupChat"><span>◎</span><strong>غرفة جماعية</strong><small>أنت تصبح المضيف تلقائياً</small></button></div>`;document.querySelector('#createPrivateChat').onclick=()=>openCreateChatModal('direct');document.querySelector('#createGroupChat').onclick=()=>openCreateChatModal('group');return;}
    if(type==='poll'){box.innerHTML=`<form class="form" id="pollForm"><label>السؤال<textarea name="question" rows="3" required placeholder="ما رأيك؟"></textarea></label><div id="pollOptions"><input name="option" placeholder="الخيار 1" required><input name="option" placeholder="الخيار 2" required></div><button type="button" class="btn secondary" id="addOption">+ إضافة خيار</button><label>الهاشتاقات<input name="hashtags" placeholder="#اتحاد #دراسة #قانون"></label><button class="btn">نشر الاستطلاع</button><div id="createStatus"></div></form>`;document.querySelector('#addOption').onclick=()=>{const w=document.querySelector('#pollOptions');if(w.children.length<8){const i=document.createElement('input');i.name='option';i.placeholder='خيار جديد';w.appendChild(i);}};return;}
    if(type==='article'){box.innerHTML=`<form class="form" id="createPostForm"><label>المساحة<select name="section"><option value="community">مجتمع الطلبة</option><option value="activities">الأنشطة والفعاليات</option><option value="study">الدراسة</option></select></label><label>عنوان المقال<input name="title" maxlength="255" required></label><label>محتوى المقال${toolbar}<div id="richEditor" class="rich-editor" contenteditable="true"></div></label><label>الهاشتاقات<input name="hashtags" placeholder="#قانون #دراسة #اتحاد"></label>${imagePicker}<button class="btn">نشر المقال</button><div id="createStatus"></div></form>`;bindEditor();bindImage();}
    else{box.innerHTML=`<form class="form" id="createPostForm"><label>المساحة<select name="section"><option value="community">مجتمع الطلبة</option><option value="activities">الأنشطة والفعاليات</option><option value="study">الدراسة</option></select></label><label>العنوان (اختياري)<input name="title" maxlength="255"></label><label>المحتوى<textarea name="body" maxlength="10000" rows="8" required placeholder="شارك شيئاً مع مجتمع الاتحاد..."></textarea></label><label>الهاشتاقات<input name="hashtags" placeholder="#اتحاد #كلية_القانون"></label>${imagePicker}<button class="btn">نشر المنشور</button><div id="createStatus"></div></form>`;bindImage();}
    document.querySelector('#createPostForm').onsubmit=async ev=>{ev.preventDefault();const form=ev.currentTarget,d=new FormData(form),ed=document.querySelector('#richEditor'),body=ed?ed.innerText.trim():String(d.get('body')||'').trim();if(!body)return;const bodyHtml=ed?ed.innerHTML:null,file=document.querySelector('#postImageInput')?.files?.[0];const send=async imageData=>{const rr=await fetch(API+'/api/posts',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({section:d.get('section'),title:d.get('title'),body,body_html:bodyHtml,content_type:type,hashtags:tags(d.get('hashtags')),image_url:imageData})}),x=await rr.json();if(!rr.ok||!x.ok)throw new Error(x.message||'تعذر النشر.');page('home');};try{if(file){const rd=new FileReader();rd.onload=()=>send(rd.result).catch(x=>document.querySelector('#createStatus').textContent=x.message);rd.readAsDataURL(file);}else await send(null);}catch(x){document.querySelector('#createStatus').textContent=x.message;}};};
  document.querySelectorAll('.create-type').forEach(b=>b.onclick=()=>render(b.dataset.type));render('post');


}/* =========================
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
      const data=await adminFetch('/api/admin/registrations');
      const applications=data.applications||[];
      const active=applications.filter(a=>!a.archived_at);
      const archived=applications.filter(a=>!!a.archived_at);
      const row=a=>{
        const statusLabel=a.status==='approved'?'مقبول':a.status==='rejected'?'مرفوض':'قيد المراجعة';
        const archiveLabel=a.archived_at?'<span class="tag">مؤرشف</span>':'';
        const ownerDelete=role()==='owner'?'<button class="btn secondary" type="button" data-delete-application="'+a.id+'">حذف الطلب</button>':'';
        return '<div class="admin-user-row"><div><strong>'+escapeHTML(a.full_name)+'</strong><div class="admin-user-meta"><span>'+escapeHTML(a.student_id)+'</span><span>'+escapeHTML(a.academic_year||'')+'</span><span>'+escapeHTML(a.phone||'')+'</span><span class="tag">'+statusLabel+'</span>'+archiveLabel+'</div><small>'+escapeHTML(a.note||'')+(a.rejection_reason?' · سبب الرفض: '+escapeHTML(a.rejection_reason):'')+(a.reviewer_name?' · راجعه: '+escapeHTML(a.reviewer_name):'')+'</small></div><div class="admin-user-actions">'+(!a.archived_at?'<select data-application="'+a.id+'"><option value="pending" '+(a.status==='pending'?'selected':'')+'>قيد المراجعة</option><option value="approved" '+(a.status==='approved'?'selected':'')+'>مقبول</option><option value="rejected" '+(a.status==='rejected'?'selected':'')+'>مرفوض</option></select>':'')+ownerDelete+'</div></div>';
      };
      app.innerHTML='<div class="section-title"><h2>طلبات العضوية</h2><span>'+active.length+' نشط · '+archived.length+' مؤرشف</span></div>'+
        '<article class="card"><div class="section-title compact"><h3>الطلبات الحالية</h3><span>'+active.length+'</span></div><div id="activeApplications">'+(active.length?active.map(row).join(''):'<div class="empty">لا توجد طلبات قيد المراجعة.</div>')+'</div></article>'+
        '<article class="card"><div class="section-title compact"><h3>أرشيف الطلبات</h3><span>'+archived.length+'</span></div><p class="admin-note">تُؤرشف الطلبات تلقائياً عند قبولها أو رفضها. الأرشفة لا تغيّر حالة العضو ولا تحذف الحساب.</p><div id="archivedApplications">'+(archived.length?archived.map(row).join(''):'<div class="empty">لا توجد طلبات مؤرشفة.</div>')+'</div></article>';
      document.querySelectorAll('[data-application]').forEach(select=>select.onchange=async()=>{
        let rejection_reason=null;
        if(select.value==='rejected') rejection_reason=prompt('سبب الرفض (اختياري):')||null;
        try{ await adminFetch('/api/admin/registrations/'+select.dataset.application,{method:'PATCH',body:JSON.stringify({status:select.value,rejection_reason})}); await renderManagementPage('applications'); }
        catch(e){alert(e.message);}
      });
      document.querySelectorAll('[data-delete-application]').forEach(button=>button.onclick=async()=>{
        if(role()!=='owner')return;
        if(!confirm('سيتم حذف طلب العضوية فقط نهائياً. لن يتأثر حساب المتقدم أو قبوله السابق. هل تريد المتابعة؟'))return;
        button.disabled=true;
        try{await adminFetch('/api/admin/registrations/'+button.dataset.deleteApplication,{method:'DELETE'});await renderManagementPage('applications');}
        catch(e){alert(e.message);button.disabled=false;}
      });
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

    if(target === 'reports'){
      const data=await adminFetch('/api/admin/reports');
      const reports=data.reports||[];
      app.innerHTML='<div class="section-title"><h2>البلاغات</h2><span>'+reports.length+' بلاغ</span></div><div class="card" id="reportsList">'+
        (reports.length ? reports.map(r =>
          '<div class="report-row">'+
          '<div><strong>'+escapeHTML(r.post_title||'منشور بدون عنوان')+'</strong><p>'+escapeHTML((r.post_body||'').slice(0,240))+'</p><small>بواسطة '+escapeHTML(r.reporter_name)+' · صاحب المنشور: '+escapeHTML(r.author_name)+' · '+escapeHTML(new Date(r.created_at).toLocaleString('ar-LY'))+'</small></div>'+
          '<div class="report-meta"><span class="tag">'+escapeHTML(r.reason)+'</span><select data-report="'+r.id+'"><option value="open" '+(r.status==='open'?'selected':'')+'>مفتوح</option><option value="resolved" '+(r.status==='resolved'?'selected':'')+'>تمت المعالجة</option><option value="dismissed" '+(r.status==='dismissed'?'selected':'')+'>مرفوض</option></select></div>'+
          '</div>'
        ).join('') : '<div class="empty">لا توجد بلاغات.</div>')+'</div>';
      document.querySelectorAll('[data-report]').forEach(select=>select.onchange=async()=>{
        try{
          await adminFetch('/api/admin/reports/'+select.dataset.report,{method:'PATCH',body:JSON.stringify({status:select.value})});
          await renderManagementPage('reports');
        }catch(e){alert(e.message);}
      });
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
      const chatData=await adminFetch('/api/chat/private-channels');
      const channels=chatData.conversations||[];
      app.innerHTML='<div class="section-title"><div><h2>القنوات الخاصة</h2><span>محادثات الاتحاد الخاصة</span></div><button class="btn" id="ownerCreatePrivateChat">＋ إنشاء دردشة</button></div>'+
        '<div class="card" id="privateChannelsList">'+
        (channels.length?channels.map(c=>'<div class="admin-user-row private-channel-row"><button class="private-channel-open" data-private-chat="'+c.id+'"><div><strong>'+escapeHTML(c.name||'محادثة خاصة')+'</strong><small>'+escapeHTML(c.type==='group'?'مجموعة خاصة':'محادثة خاصة')+' · '+(c.member_count||0)+' أعضاء</small></div></button><button class="chat-delete-btn" type="button" data-delete-private="'+c.id+'">حذف</button></div>').join(''):'<div class="empty">لا توجد قنوات خاصة بعد.</div>')+
        '</div>';
      document.querySelector('#ownerCreatePrivateChat')?.addEventListener('click',async()=>{await page('chat');requestAnimationFrame(()=>openCreateChatModal('group'));});
      document.querySelectorAll('[data-private-chat]').forEach(b=>b.onclick=async()=>{pendingChatId=Number(b.dataset.privateChat);await page('chat');});
      document.querySelectorAll('[data-delete-private]').forEach(b=>b.onclick=async()=>{if(!confirm('سيتم حذف هذه الدردشة ورسائلها نهائياً. هل تريد المتابعة؟'))return;b.disabled=true;try{const rr=await fetch(API+'/api/chat/conversations/'+b.dataset.deletePrivate,{method:'DELETE',headers:{Authorization:'Bearer '+getToken()}}),xx=await rr.json();if(!rr.ok||!xx.ok)throw new Error(xx.message||'تعذر حذف الدردشة.');await renderManagementPage('private-chats');}catch(error){alert(error.message);b.disabled=false;}});
      return;
    }

    if(target === 'settings'){
      const r = await fetch(API+'/api/app-settings',{cache:'no-store'});
      const payload = await r.json();
      const settings = payload.settings || {};
      app.innerHTML='<div class="section-title"><h2>إعدادات النظام</h2><span>Owner</span></div><form class="card form" id="ownerSiteSettings"><label>عنوان الصفحة الرئيسية<input name="home_title" value="'+escapeHTML(settings.home_title || 'اتحاد طلبة كلية القانون')+'"></label><label>وصف الصفحة الرئيسية<textarea name="home_intro">'+escapeHTML(settings.home_intro || '')+'</textarea></label><label>عنوان قسم عن المجتمع<input name="about_title" value="'+escapeHTML(settings.about_title || 'اتحاد طلبة كلية القانون')+'"></label><label>نص قسم عن المجتمع<textarea name="about_body">'+escapeHTML(settings.about_body || '')+'</textarea></label><button class="btn">حفظ التغييرات</button><div id="ownerSiteStatus"></div></form>';
      document.querySelector('#ownerSiteSettings').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());const response=await fetch(API+'/api/app-settings',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify(data)});const result=await response.json();document.querySelector('#ownerSiteStatus').innerHTML=response.ok&&result.ok?'<span class="success">تم حفظ النصوص.</span>':'<span class="error">'+escapeHTML(result.message||'تعذر الحفظ.')+'</span>';};
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
  currentPageName=p;if(p!=='chat'&&chatPollTimer){clearInterval(chatPollTimer);chatPollTimer=null;}if(p!=='online-hub'&&onlineHubTimer){clearInterval(onlineHubTimer);onlineHubTimer=null;}heartbeat();

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

  if(p === 'activate'){
    app.innerHTML=`<div class="login-wrap"><div class="login-card"><div class="login-logo">⚖</div><h1>تفعيل العضوية</h1><p>إذا تمت الموافقة على طلب عضويتك، أنشئ كلمة مرور لتفعيل حسابك.</p><form class="form" id="activateForm"><label>رقم القيد<input name="student_id" required></label><label>رقم الهاتف<input name="phone" required type="tel"></label><label>كلمة المرور<input name="password" type="password" minlength="8" required></label><label>تأكيد كلمة المرور<input name="confirm" type="password" minlength="8" required></label><button class="btn">تفعيل الحساب</button><div id="activateStatus"></div></form></div></div>`;
    document.querySelector('#activateForm').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));const st=document.querySelector('#activateStatus');if(d.password!==d.confirm){st.textContent='كلمتا المرور غير متطابقتين.';return;}const rr=await fetch(API+'/api/membership/activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}),x=await rr.json();if(!rr.ok||!x.ok){st.textContent=x.message||'تعذر تفعيل الحساب.';return;}setToken(x.token);currentUser=x.user;updateDrawer();page('home');};
    return;
  }

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
            <button type="button" class="text-link" id="activateLink">تم قبول عضويتي؟ إعداد كلمة المرور</button>
          </form>

        </div>

      </div>

    `;


    const form =
      document.querySelector('#loginForm');

    document.querySelector('#activateLink').onclick=()=>page('activate');

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

    const response = await fetch(API+'/api/announcements',{cache:'no-store'});
    const payload = await response.json();
    if(!response.ok||!payload.ok) throw new Error(payload.message||'تعذر تحميل الإعلانات.');
    const data = payload.announcements || [];

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

    const response = await fetch(API+'/api/activities',{cache:'no-store'});
    const payload = await response.json();
    if(!response.ok||!payload.ok) throw new Error(payload.message||'تعذر تحميل الأنشطة.');
    const data = payload.activities || [];

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

    if(!currentUser){ page('login'); return; }
    const [systemResponse,userResponse,settingsResponse] = await Promise.all([
      fetch(API+'/api/notifications',{headers:{Authorization:'Bearer '+getToken()},cache:'no-store'}),
      fetch(API+'/api/user-notifications',{headers:{Authorization:'Bearer '+getToken()},cache:'no-store'}),
      fetch(API+'/api/notifications/settings',{headers:{Authorization:'Bearer '+getToken()},cache:'no-store'})
    ]);
    const system = await systemResponse.json();
    const personal = await userResponse.json();
    const settingsPayload = await settingsResponse.json();
    if(!systemResponse.ok || !system.ok) throw new Error(system.message || 'تعذر تحميل الإشعارات.');
    const data = [...(personal.notifications || []), ...(system.notifications || []).map(x=>({...x,source:'announcement'}))];

    app.innerHTML = '<div class="section-title"><h2>الإشعارات</h2><button class="btn secondary" id="notificationSettingsBtn">إعدادات الإشعارات</button></div>'+
      '<section class="card notification-list">'+(data.length ? data.map(x=>'<article class="notification-card"><div><strong>'+escapeHTML(x.title)+'</strong><p>'+escapeHTML(x.body||'')+'</p></div><small>'+escapeHTML(x.source||'announcement')+'</small></article>').join('') : '<div class="empty">لا توجد إشعارات حالياً.</div>')+'</section>'+
      '<section class="card notification-settings" id="notificationSettings" hidden><h3>مصادر الإشعارات</h3><p>اختر المصادر التي تريد استقبال إشعاراتها.</p>'+
      ['all_members:كل الأعضاء','administration:الإدارة','friends:الأصدقاء','announcements:صفحة الإعلانات'].map(item=>{const [k,l]=item.split(':');const on=settingsPayload.settings?.[k]!==false;return '<label class="check-row"><input type="checkbox" data-notification-setting="'+k+'" '+(on?'checked':'')+'><span>'+l+'</span></label>';}).join('')+
      '</section>';
    document.querySelector('#notificationSettingsBtn').onclick=()=>{document.querySelector('#notificationSettings').hidden=!document.querySelector('#notificationSettings').hidden;};
    document.querySelectorAll('[data-notification-setting]').forEach(input=>input.onchange=async()=>{const payload={};document.querySelectorAll('[data-notification-setting]').forEach(x=>payload[x.dataset.notificationSetting]=x.checked);await fetch(API+'/api/notifications/settings',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify(payload)});updateNotificationDot();});
    return;
  }

  if(p === 'schedule'){

    const response = await fetch(API+'/api/schedule',{cache:'no-store'});
    const payload = await response.json();
    if(!response.ok||!payload.ok) throw new Error(payload.message||'تعذر تحميل الجدول الدراسي.');
    const data = payload.schedule || [];

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

      const payload = Object.fromEntries(new FormData(form).entries());
      try{
        const response = await fetch(API+'/api/membership/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const data = await response.json();
        if(!response.ok||!data.ok) throw new Error(data.message||'تعذر إرسال الطلب.');
        status.innerHTML='<span class="success">تم إرسال طلب العضوية بنجاح. رقم الطلب: '+escapeHTML(String(data.application.id))+'</span>';
        form.reset();
      }catch(error){
        status.innerHTML='<span class="error">'+escapeHTML(error.message)+'</span>';
      }
    };

    return;
  }

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
    let site = {};
    try { const r=await fetch(API+'/api/app-settings',{cache:'no-store'}); const x=await r.json(); site=x.settings||{}; } catch(e) {}
    const aboutTitle=site.about_title || 'اتحاد طلبة كلية القانون';
    const aboutBody=site.about_body || 'مجتمع طلابي للتواصل ومتابعة الأخبار والأنشطة والفعاليات والمناقشات.';
    app.innerHTML = `

      <div class="section-title">
        <h2>عن المجتمع</h2>
      </div>

      <article class="card">

        <h3>${escapeHTML(aboutTitle)}</h3><p>${escapeHTML(aboutBody)}</p>

      </article>

    `;

    return;
  }


  if(p === 'online-hub'){
    if(!currentUser){page('login');return;}
    app.innerHTML='<div class="section-title"><h2>Online Hub</h2><span>النشطون الآن</span></div><section class="card online-hub-card"><div class="online-hub-head"><div><strong>من موجود الآن؟</strong><small>يتحدث أو يقرأ أو يتصفح المجتمع الآن</small></div><span class="live-pill">● LIVE</span></div><div id="onlineHubList" class="online-hub-list"><div class="empty">جارٍ التحميل...</div></div></section>';
    async function loadOnlineHub(){
      try{
        const r=await fetch(API+'/api/presence/online-hub',{headers:{Authorization:'Bearer '+getToken()},cache:'no-store'}),x=await r.json();
        const list=document.querySelector('#onlineHubList');if(!list)return;
        const labels={home:'الرئيسية',announcements:'الإعلانات',activities:'الأنشطة والفعاليات',schedule:'الجدول',chat:'الدردشة',posts:'المنشورات',create:'الإنشاء',profile:'الملف الشخصي','online-hub':'Online Hub'};
        const users=x.users||[];
        list.innerHTML=users.length?users.map(u=>'<button class="online-user" data-profile="'+escapeHTML(u.profile_slug||u.id)+'"><span class="online-avatar">'+(u.avatar_url?'<img src="'+escapeHTML(u.avatar_url)+'" alt="">':'👤')+'<i></i></span><span class="online-user-copy"><strong>'+escapeHTML(u.full_name)+'</strong><small>نشط في '+escapeHTML(labels[u.current_page]||'التطبيق')+'</small></span><span class="online-arrow">‹</span></button>').join(''):'<div class="empty">لا يوجد أعضاء نشطون الآن.</div>';
        list.querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>openProfile(b.dataset.profile));
      }catch(e){}
    }
    await loadOnlineHub();
    onlineHubTimer=setInterval(()=>{
      if(document.visibilityState==='visible')loadOnlineHub();
    },10000);
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

      const background = user.profile_background_url
        ? `style="--profile-bg:url('${escapeHTML(user.profile_background_url)}')"`
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
                <span class="role-badge">${escapeHTML(user.role === 'admin' && !isSelf ? 'Admin' : 'عضو')}</span>
                <span class="presence-dot ${user.online ? 'online' : ''}"></span>
                <span>${user.online ? 'متصل الآن' : 'غير متصل'}</span>
              </div>
            </div>
          </div>
        </section>

        <article class="card profile-card">
          <div class="profile-actions">
            <button class="btn" id="copyProfileBtn">🔗 نسخ رابط الملف</button>
            ${isSelf ? '<button class="btn secondary" id="editProfileBtn">✎ تعديل الملف</button>' : '<button class="btn" id="friendBtn">إضافة صديق</button>'}
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
        <section class="card profile-friends-card"><div class="section-title compact"><h3>الأصدقاء</h3><span id="friendsCount">جارٍ التحميل...</span></div><div id="profileFriends" class="profile-friends-list"><div class="empty">جارٍ تحميل الأصدقاء...</div></div></section>
      `;

      document.querySelector('#copyProfileBtn').onclick =
        () => copyProfileLink(user);

      if(isSelf){
        document.querySelector('#editProfileBtn').onclick = () => renderProfileEditor(user);
      }
      try{const rr=await fetch(API+'/api/friends',{headers:{Authorization:'Bearer '+getToken()},cache:'no-store'});const xx=await rr.json();const friends=xx.friends||[];const fb=document.querySelector('#profileFriends'),fc=document.querySelector('#friendsCount');if(fc)fc.textContent=friends.length+' صديق';if(fb)fb.innerHTML=friends.length?friends.map(f=>'<button class="profile-friend" data-profile="'+escapeHTML(f.profile_slug||f.id)+'"><span class="profile-friend-avatar">'+(f.avatar_url?'<img src="'+escapeHTML(f.avatar_url)+'" alt="">':'👤')+'</span><span><strong>'+escapeHTML(f.full_name)+'</strong><small>'+escapeHTML(f.academic_year||'عضو الاتحاد')+'</small></span></button>').join(''):'<div class="empty">لا توجد صداقات بعد.</div>';fb?.querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>openProfile(b.dataset.profile));}catch(e){}
      if(!isSelf){
        const fb=document.querySelector('#friendBtn');
        try{
          const fr=await fetch(API+'/api/friends/status/'+user.id,{headers:{Authorization:'Bearer '+getToken()}});
          const fx=await fr.json();
          if(fx.status==='friends'){fb.textContent='✓ صديق';fb.disabled=true;}
          else if(fx.status==='pending_sent'){fb.textContent='تم إرسال الطلب';fb.disabled=true;}
          else if(fx.status==='pending_received'){fb.textContent='قبول طلب الصداقة';}
          fb.onclick=async()=>{
            const path=fx.status==='pending_received'?'/api/friends/'+user.id+'/accept':'/api/friends/'+user.id+'/request';
            const rr=await fetch(API+path,{method:'POST',headers:{Authorization:'Bearer '+getToken()}});
            const xx=await rr.json();
            if(!rr.ok||!xx.ok){alert(xx.message||'تعذر تحديث الصداقة.');return;}
            fb.textContent=xx.status==='friends'?'✓ صديق':'تم إرسال الطلب';fb.disabled=true;
          };
        }catch(e){}
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


  if(p === 'notifications'){
    if(!currentUser){page('login');return;}
    app.innerHTML=`<div class="section-title"><h2>الإشعارات</h2><button class="btn secondary" id="readAllNotifications">تحديد الكل كمقروء</button></div><div class="notification-layout"><section class="card" id="notificationList">جارٍ التحميل...</section><section class="card notification-settings-card"><h3>إعدادات الإشعارات</h3><label><input type="checkbox" id="nsAll"> كل الأعضاء</label><label><input type="checkbox" id="nsAdmin"> الإدارة</label><label><input type="checkbox" id="nsFriends"> الأصدقاء</label><label><input type="checkbox" id="nsAnnouncements"> الإعلانات</label></section></div>`;
    try{
      const [nr,sr]=await Promise.all([
        fetch(API+'/api/user-notifications',{headers:{Authorization:'Bearer '+getToken()}}),
        fetch(API+'/api/notifications/settings',{headers:{Authorization:'Bearer '+getToken()}})
      ]);
      const n=await nr.json(), st=await sr.json();
      const list=document.querySelector('#notificationList');
      list.innerHTML=(n.notifications||[]).length?(n.notifications||[]).map(x=>`<button class="notification-card ${x.is_read?'read':''}" data-notification-id="${x.id}"><strong>${escapeHTML(x.title)}</strong><span>${escapeHTML(x.body||'')}</span><small>${escapeHTML(new Date(x.created_at).toLocaleString('ar-LY'))}</small></button>`).join(''):'<div class="empty">لا توجد إشعارات.</div>';
      const settings=st.settings||{}; for(const [id,key] of [['nsAll','all_members'],['nsAdmin','administration'],['nsFriends','friends'],['nsAnnouncements','announcements']]) document.querySelector('#'+id).checked=settings[key]!==false;
      list.querySelectorAll('[data-notification-id]').forEach(b=>b.onclick=async()=>{await fetch(API+'/api/user-notifications/'+b.dataset.notificationId+'/read',{method:'PATCH',headers:{Authorization:'Bearer '+getToken()}});b.classList.add('read');updateNotificationDot();});
      document.querySelector('#readAllNotifications').onclick=async()=>{await fetch(API+'/api/user-notifications/read-all',{method:'POST',headers:{Authorization:'Bearer '+getToken()}});list.querySelectorAll('.notification-card').forEach(x=>x.classList.add('read'));updateNotificationDot();};
      [['nsAll','all_members'],['nsAdmin','administration'],['nsFriends','friends'],['nsAnnouncements','announcements']].forEach(([id,key])=>document.querySelector('#'+id).onchange=async e=>{await fetch(API+'/api/notifications/settings',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({[key]:e.target.checked})});});
    }catch(e){document.querySelector('#notificationList').innerHTML='<div class="empty">'+escapeHTML(e.message)+'</div>';}
    return;
  }


    if(!currentUser){ page('login'); return; }

    app.innerHTML=`
      <div class="chat-app">
        <aside class="chat-list card">
          <div class="chat-list-head"><div><h2>الوارد</h2><small>رسائلك وقنوات الاتحاد</small></div><button id="chatNewButton" class="chat-new-btn" type="button" aria-label="إنشاء دردشة">＋</button></div>
          <input id="chatSearch" class="chat-search" placeholder="بحث...">
          <div id="chatList"><div class="empty">جارٍ التحميل...</div></div>
        </aside>
        <section class="chat-window card">
          <div id="chatEmpty" class="chat-empty"><strong>دردشات الاتحاد</strong><span>اختر محادثة أو أنشئ محادثة جديدة.</span></div>
          <div id="chatActive" hidden>
            <header class="chat-window-head"><div><strong id="chatTitle"></strong><small id="chatSubtitle"></small><div id="chatTags" class="hashtags"></div></div><button id="chatManageBtn" class="chat-manage-btn" type="button">إدارة</button></header>
            <div id="chatMessages" class="chat-messages"></div>
            <div id="chatAttachmentPreview" class="chat-attachment-preview"></div>
            <form id="chatForm" class="chat-compose">
              <button type="button" class="chat-tool-btn" id="chatImageButton" title="إرسال صورة">▧</button>
              <input id="chatImageInput" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
              <button type="button" class="chat-tool-btn" id="chatVoiceButton" title="تسجيل رسالة صوتية">🎙</button>
              <input name="body" autocomplete="off" maxlength="4000" placeholder="اكتب رسالة...">
              <button type="submit" class="chat-send-btn" title="إرسال">➤</button>
            </form>
          </div>
        </section>
      </div>
      <div id="chatModal" class="chat-modal" hidden>
        <div class="chat-modal-card card">
          <button class="modal-close" id="closeChatModal" type="button" aria-label="إغلاق">×</button><h3 id="chatModalTitle">محادثة جديدة</h3>
          <label>النوع<select id="chatType"><option value="direct">خاصة — عضو مع عضو</option><option value="group">خاصة — عدة أعضاء</option><option value="public">عامة — قناة</option></select></label>
          <label id="chatNameWrap">اسم القناة أو المجموعة<input id="chatName" maxlength="120"></label>
          <label id="chatDescriptionWrap">وصف الدردشة<textarea id="chatDescription" maxlength="1000" rows="3" placeholder="وصف مختصر للدردشة"></textarea></label>
          <label id="chatHashtagsWrap">الهاشتاقات<input id="chatHashtags" placeholder="#دراسة #اتحاد"></label>
          <label id="chatCoverWrap" class="image-picker compact-image-picker" for="chatCover">▧ <strong>صورة غلاف الدردشة</strong><small>اختيارية</small></label><input id="chatCover" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><div id="chatCoverPreview"></div>
          <label>اختيار الأعضاء<input id="chatMembersSearch" placeholder="ابحث بالاسم أو رقم القيد"></label>
          <div id="chatUsers"></div><button class="btn" id="createChatBtn">إنشاء</button>
        </div>
      </div>`;
    let conversations=[],active=null,selected=[];
    const list=document.querySelector('#chatList'),messages=document.querySelector('#chatMessages');
    async function loadConversations(){
      const rr=await fetch(API+'/api/chat/conversations',{headers:{Authorization:'Bearer '+getToken()},cache:'no-store'}),xx=await rr.json();
      if(!rr.ok||!xx.ok)throw new Error(xx.message||'تعذر تحميل الدردشات.');
      conversations=xx.conversations||[];
      if(isUserScrolling)return;
      renderChatList();
      if(pendingChatId){
        const target=pendingChatId;
        pendingChatId=null;
        await openChat(target);
      }
    }
    function renderChatList(filter=''){
      const q=String(filter||'').trim().toLowerCase();
      const visible=conversations.filter(c=>{
        const title=c.name||c.members?.filter(m=>Number(m.id)!==Number(currentUser.id)).map(m=>m.full_name).join('، ')||'محادثة';
        return !q || title.toLowerCase().includes(q) || String(c.last_message||'').toLowerCase().includes(q);
      });
      list.innerHTML=visible.length?visible.map(c=>{const canDelete=role()==='owner'||(role()==='admin'&&c.type==='public')||(c.type==='direct'&&c.is_private&&c.members?.some(m=>Number(m.id)===Number(currentUser.id)))||(c.type!=='direct'&&Number(c.host_user_id)===Number(currentUser.id));return `<div class="chat-row-wrap"><button class="chat-row ${active&&Number(active.id)===Number(c.id)?'active':''}" data-cid="${c.id}"><span class="chat-row-avatar">${c.members?.[0]?.avatar_url?'<img src="'+escapeHTML(c.members[0].avatar_url)+'">':'💬'}</span><span><strong>${escapeHTML(c.name||c.members?.filter(m=>Number(m.id)!==Number(currentUser.id)).map(m=>m.full_name).join('، ')||'محادثة')}</strong><small>${escapeHTML(c.last_message||'ابدأ المحادثة')}</small></span></button>${canDelete?`<button class="chat-delete-btn" type="button" data-delete-chat="${c.id}" aria-label="حذف الدردشة">حذف</button>`:''}</div>`;}).join(''):'<div class="empty">لا توجد محادثات مطابقة.</div>';
      list.querySelectorAll('[data-cid]').forEach(b=>b.onclick=()=>openChat(Number(b.dataset.cid)));
      list.querySelectorAll('[data-delete-chat]').forEach(b=>b.onclick=async e=>{e.stopPropagation();const id=Number(b.dataset.deleteChat);const c=conversations.find(x=>Number(x.id)===id);if(!c)return;if(!confirm('سيتم حذف الدردشة ورسائلها نهائياً لجميع المشاركين. هل تريد المتابعة؟'))return;b.disabled=true;try{const rr=await fetch(API+'/api/chat/conversations/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+getToken()}}),xx=await rr.json();if(!rr.ok||!xx.ok)throw new Error(xx.message||'تعذر حذف الدردشة.');if(active&&Number(active.id)===id){active=null;document.querySelector('#chatEmpty').hidden=false;document.querySelector('#chatActive').hidden=true;}await loadConversations();}catch(error){alert(error.message);}finally{b.disabled=false;}});
    }
    async function openChat(id,preserveScroll=false){
      active=conversations.find(c=>Number(c.id)===id);if(!active)return;
      document.querySelector('#chatEmpty').hidden=true;document.querySelector('#chatActive').hidden=false;
      document.querySelector('#chatTitle').textContent=active.name||active.members.filter(m=>Number(m.id)!==Number(currentUser.id)).map(m=>m.full_name).join('، ');
      document.querySelector('#chatSubtitle').textContent=active.type==='public'?'قناة عامة':active.type==='direct'?'محادثة خاصة':active.members.length+' أعضاء'+(active.messaging_paused?' · الإرسال متوقف':'');document.querySelector('#chatTags').innerHTML=hashtagsHTML(active.hashtags||[]);const manage=document.querySelector('#chatManageBtn');const myRole=active.members?.find(m=>Number(m.id)===Number(currentUser.id))?.membership_role;manage.style.display=active.type==='direct'||(Number(active.host_user_id)!==Number(currentUser.id)&&myRole!=='cohost'&&role()!=='owner')?'none':'block';manage.onclick=()=>openChatManagement(active);
      const rr=await fetch(API+'/api/chat/conversations/'+id+'/messages',{headers:{Authorization:'Bearer '+getToken()},cache:'no-store'}),xx=await rr.json();
      const wasNearBottom=messages.scrollHeight-messages.scrollTop-messages.clientHeight<100;
      if(isUserScrolling)return;
      messages.innerHTML=(xx.messages||[]).map(m=>`<div class="bubble ${Number(m.sender.id)===Number(currentUser.id)?'mine':''}"><small>${escapeHTML(m.sender.full_name)}</small>${m.body?`<div>${escapeHTML(m.body)}</div>`:''}${m.image_url?`<img class="chat-media-image" src="${escapeHTML(m.image_url)}" alt="صورة مرسلة" loading="lazy">`:''}${m.audio_url?`<audio class="chat-media-audio" controls preload="metadata" src="${escapeHTML(m.audio_url)}"></audio>`:''}<time>${new Date(m.created_at).toLocaleTimeString('ar-LY',{hour:'2-digit',minute:'2-digit'})}</time></div>`).join('')||'<div class="empty">ابدأ أول رسالة.</div>';
      if(!preserveScroll || wasNearBottom) messages.scrollTop=messages.scrollHeight;
      renderChatList(document.querySelector('#chatSearch')?.value||'');
    }
    document.querySelector('#chatSearch').oninput=e=>renderChatList(e.target.value);
    let chatImageData=null,chatAudioData=null,voiceRecorder=null,voiceChunks=[];
    const imageInput=document.querySelector('#chatImageInput'), imagePreview=document.querySelector('#chatAttachmentPreview');
    document.querySelector('#chatImageButton').onclick=()=>imageInput.click();
    imageInput.onchange=e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>5000000){alert('اختر صورة أقل من 5MB.');e.target.value='';return;}const rd=new FileReader();rd.onload=()=>{chatImageData=rd.result;chatAudioData=null;imagePreview.innerHTML='<div class="chat-attachment-chip">🖼️ صورة مرفقة <button type="button" id="clearChatAttachment">×</button></div>';document.querySelector('#clearChatAttachment').onclick=()=>{chatImageData=null;imageInput.value='';imagePreview.innerHTML='';};};rd.readAsDataURL(file);};
    document.querySelector('#chatVoiceButton').onclick=async()=>{if(voiceRecorder&&voiceRecorder.state==='recording'){voiceRecorder.stop();return;}if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){alert('تسجيل الصوت غير مدعوم في هذا المتصفح.');return;}try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});voiceChunks=[];voiceRecorder=new MediaRecorder(stream);voiceRecorder.ondataavailable=e=>{if(e.data.size)voiceChunks.push(e.data);};voiceRecorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(voiceChunks,{type:voiceRecorder.mimeType||'audio/webm'});if(blob.size>1600000){alert('الرسالة الصوتية كبيرة جداً. سجل مقطعاً أقصر.');return;}const rd=new FileReader();rd.onload=()=>{chatAudioData=rd.result;chatImageData=null;imagePreview.innerHTML='<div class="chat-attachment-chip">🎙️ رسالة صوتية جاهزة <button type="button" id="clearChatAttachment">×</button></div>';document.querySelector('#clearChatAttachment').onclick=()=>{chatAudioData=null;imagePreview.innerHTML='';};};rd.readAsDataURL(blob);document.querySelector('#chatVoiceButton').textContent='🎙';};voiceRecorder.start();document.querySelector('#chatVoiceButton').textContent='⏹';}catch(error){alert('تعذر الوصول إلى الميكروفون. تأكد من السماح بالميكروفون.');}};
    document.querySelector('#chatForm').onsubmit=async e=>{e.preventDefault();if(!active)return;const input=e.currentTarget.elements.body;const body=input.value.trim();if(!body&&!chatImageData&&!chatAudioData)return;const rr=await fetch(API+'/api/chat/conversations/'+active.id+'/messages',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({body,image_url:chatImageData,audio_url:chatAudioData})}),xx=await rr.json();if(!rr.ok||!xx.ok){alert(xx.message||'تعذر إرسال الرسالة.');return;}input.value='';chatImageData=null;chatAudioData=null;imageInput.value='';imagePreview.innerHTML='';await openChat(active.id);await loadConversations();};
    document.querySelector('#closeChatModal').onclick=closeCreateChatModal;
document.querySelector('#chatModal').onclick=e=>{if(e.target.id==='chatModal')closeCreateChatModal();};
document.querySelector('#chatNewButton').onclick=()=>{selected=[];openCreateChatModal('direct');};
     document.querySelector('#chatType').onchange=e=>{
      const type=e.target.value;
      document.querySelector('#chatNameWrap').style.display=type==='direct'?'none':'block';
      const memberLabel=document.querySelector('#chatMembersSearch').closest('label');
      memberLabel.style.display=type==='public'?'none':'block';
      document.querySelector('#chatUsers').style.display=type==='public'?'none':'grid';
      document.querySelector('#chatModalTitle').textContent=type==='group'?'إنشاء مجموعة خاصة':type==='direct'?'محادثة خاصة':'إنشاء قناة عامة';
      document.querySelector('#chatName').placeholder=type==='public'?'مثال: قناة الأنشطة':'اسم المجموعة';document.querySelector('#chatDescriptionWrap').style.display=type==='direct'?'none':'block';document.querySelector('#chatHashtagsWrap').style.display=type==='direct'?'none':'block';document.querySelector('#chatCoverWrap').style.display=type==='direct'?'none':'flex';
    };
    async function searchUsers(q){const rr=await fetch(API+'/api/chat/users?q='+encodeURIComponent(q||''),{headers:{Authorization:'Bearer '+getToken()}}),xx=await rr.json();document.querySelector('#chatUsers').innerHTML=(xx.users||[]).map(u=>`<button class="member-pick ${selected.includes(Number(u.id))?'selected':''}" data-uid="${u.id}">${u.avatar_url?'<img src="'+escapeHTML(u.avatar_url)+'">':'👤'} ${escapeHTML(u.full_name)}</button>`).join('');document.querySelectorAll('.member-pick').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.uid);selected=selected.includes(id)?selected.filter(x=>x!==id):[...selected,id];b.classList.toggle('selected');});}
    document.querySelector('#chatCover')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{document.querySelector('#chatCoverPreview').innerHTML='<img class="post-image create-image-preview" src="'+escapeHTML(rd.result)+'">';document.querySelector('#chatCover').dataset.data=rd.result;};rd.readAsDataURL(f);});document.querySelector('#chatMembersSearch').oninput=e=>searchUsers(e.target.value);searchUsers('');
    document.querySelector('#createChatBtn').onclick=async()=>{
      const type=document.querySelector('#chatType').value;
      const name=document.querySelector('#chatName').value.trim();const description=document.querySelector('#chatDescription')?.value.trim()||'';const hashtags=String(document.querySelector('#chatHashtags')?.value||'').split(/[,\s]+/).filter(Boolean);
      if(type==='direct' && selected.length!==1){alert('اختر عضواً واحداً لإنشاء محادثة خاصة.');return;}
      if(type!=='direct' && !name){alert('اكتب اسم الدردشة أولاً.');return;}
      if(type==='group' && selected.length<1){alert('اختر عضواً واحداً على الأقل للمجموعة.');return;}
      const button=document.querySelector('#createChatBtn');button.disabled=true;button.textContent='جارٍ الإنشاء...';
      try{
        const rr=await fetch(API+'/api/chat/conversations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({type,name,description,hashtags,cover_image_url:document.querySelector('#chatCover')?.dataset.data||null,member_ids:selected})});
        const xx=await rr.json();
        if(!rr.ok||!xx.ok)throw new Error(xx.message||'تعذر إنشاء المحادثة.');
        closeCreateChatModal();selected=[];await loadConversations();await openChat(Number(xx.conversation.id));
      }catch(error){alert(error.message);}
      finally{button.disabled=false;button.textContent='إنشاء';}
    };
    await loadConversations();
    chatPollTimer=setInterval(async()=>{
      if(document.visibilityState!=='visible'||!active)return;
      try{
        await loadConversations();
        if(active)await openChat(active.id,true);
      }catch(e){}
    },5000);
    return;

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
          صورة الغلاف
          <input id="coverInput" type="file" accept="image/*">
          <div class="avatar-upload-preview cover-upload-preview" id="coverPreview">
            ${user.profile_background_url
              ? `<img src="${escapeHTML(user.profile_background_url)}" alt="preview">`
              : 'لا توجد صورة غلاف'}
          </div>
        </label>

        <label>
          الاسم
          <input name="full_name" maxlength="150" value="${escapeHTML(user.full_name || '')}" required>
        </label>

        <label>
          السنة الدراسية
          <select name="academic_year" required>
            <option value="">اختر السنة الدراسية</option>
            <option value="الأولى" ${user.academic_year === 'الأولى' ? 'selected' : ''}>الأولى</option>
            <option value="الثانية" ${user.academic_year === 'الثانية' ? 'selected' : ''}>الثانية</option>
            <option value="الثالثة" ${user.academic_year === 'الثالثة' ? 'selected' : ''}>الثالثة</option>
            <option value="الرابعة" ${user.academic_year === 'الرابعة' ? 'selected' : ''}>الرابعة</option>
          </select>
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
          <input name="show_online" type="checkbox" ${user.privacy_settings?.show_online !== false ? 'checked' : ''}>
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
  let coverData = user.profile_background_url || null;

  document.querySelector('#avatarInput').onchange = event => {
    const file = event.target.files?.[0];
    if(!file) return;

    if(file.size > 3500000){
      alert('الصورة كبيرة جداً. اختر صورة أقل من 3.5MB.');
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

  document.querySelector('#coverInput').onchange = event => {
    const file = event.target.files?.[0];
    if(!file) return;
    if(file.size > 3500000){
      alert('الصورة كبيرة جداً. اختر صورة أقل من 3.5MB.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      coverData = reader.result;
      document.querySelector('#coverPreview').innerHTML =
        `<img src="${escapeHTML(coverData)}" alt="preview">`;
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
          cover_url:coverData,
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
      await heartbeat();
      const fresh = await loadPublicProfile(currentUser.profile_slug || currentUser.id);
      currentUser = {...currentUser, ...fresh};
      updateDrawer();
      status.innerHTML = '<span class="success">تم حفظ الملف الشخصي بنجاح.</span>';
      setTimeout(() => page('profile', fresh.profile_slug || fresh.id), 250);

    }catch(error){
      status.innerHTML = '<span class="error">'+escapeHTML(error.message)+'</span>';
      button.disabled = false;
    }
  };
}


async function openChatManagement(chat){
  if(!chat)return;
  const rr=await fetch(API+'/api/chat/conversations/'+chat.id+'/details',{headers:{Authorization:'Bearer '+getToken()},cache:'no-store'}),x=await rr.json();
  if(!rr.ok||!x.ok){alert(x.message||'تعذر تحميل إدارة الدردشة.');return;}
  const d=x.conversation, me=d.my_role, canHost=Number(d.host_user_id)===Number(currentUser.id), canCo=canHost||me==='cohost';
  const modal=document.createElement('div');modal.className='chat-manage-modal';
  modal.innerHTML=`<div class="chat-manage-card"><button class="modal-close" type="button">×</button><div class="manage-hero"><div><h3>إدارة الدردشة</h3><small>${canHost?'أنت المضيف':me==='cohost'?'أنت co-host':'عضو'}</small></div></div>
    <form id="chatMetaForm" class="form"><label>اسم الدردشة<input name="name" value="${escapeHTML(d.name||'')}"></label><label>الوصف<textarea name="description">${escapeHTML(d.description||'')}</textarea></label><label>الهاشتاقات<input name="hashtags" value="${escapeHTML((d.hashtags||[]).map(t=>'#'+t).join(' '))}"></label><label class="image-picker compact-image-picker" for="manageCover">▧ <strong>تغيير صورة الغلاف</strong></label><input id="manageCover" class="visually-hidden" type="file" accept="image/*"><div id="manageCoverPreview"></div><button class="btn">حفظ معلومات الدردشة</button></form>
    <div class="manage-actions"><button type="button" class="btn secondary" id="pauseChatBtn">${d.messaging_paused?'استئناف الإرسال':'إيقاف الإرسال مؤقتاً'}</button><button type="button" class="btn secondary" id="voiceChatBtn">${d.voice_room_active?'إغلاق غرفة الصوت':'فتح غرفة صوتية'}</button></div>
    <div class="manage-members"><h4>الأعضاء</h4>${(d.members||[]).map(m=>`<div class="manage-member"><span class="manage-member-avatar">${m.avatar_url?'<img src="'+escapeHTML(m.avatar_url)+'">':'👤'}</span><span><strong>${escapeHTML(m.full_name)}</strong><small>${m.role==='host'?'المضيف':m.role==='cohost'?'Co-host':'عضو'}</small></span><span class="manage-member-actions">${canHost&&m.role==='member'?'<button data-promote="'+m.id+'">ترقية</button>':''}${canHost&&m.role==='cohost'?'<button data-demote="'+m.id+'">تخفيض</button>':''}${canCo&&m.role==='member'?'<button data-kick="'+m.id+'">طرد</button>':''}${canHost&&m.role==='cohost'?'<button data-kick="'+m.id+'">طرد</button>':''}</span></div>`).join('')}</div></div>`;
  document.body.appendChild(modal);
  const close=()=>modal.remove();modal.querySelector('.modal-close').onclick=close;modal.onclick=e=>{if(e.target===modal)close();};
  let cover=null;document.querySelector('#manageCover').onchange=e=>{const f=e.target.files?.[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{cover=rd.result;document.querySelector('#manageCoverPreview').innerHTML='<img class="post-image create-image-preview" src="'+escapeHTML(cover)+'">';};rd.readAsDataURL(f);};
  document.querySelector('#chatMetaForm').onsubmit=async e=>{e.preventDefault();const dta=Object.fromEntries(new FormData(e.currentTarget)),body={name:dta.name,description:dta.description,hashtags:String(dta.hashtags||'').split(/[,\\s]+/).filter(Boolean)};if(cover)body.cover_image_url=cover;const z=await fetch(API+'/api/chat/conversations/'+chat.id,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify(body)}),j=await z.json();if(!z.ok||!j.ok){alert(j.message||'تعذر الحفظ.');return;}close();await loadConversations();await openChat(chat.id);};
  modal.querySelector('#pauseChatBtn').onclick=async()=>{const z=await fetch(API+'/api/chat/conversations/'+chat.id+'/pause',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({paused:!d.messaging_paused})});const j=await z.json();if(!z.ok||!j.ok){alert(j.message||'تعذر التغيير.');return;}close();await openChat(chat.id);};
  modal.querySelector('#voiceChatBtn').onclick=async()=>{const z=await fetch(API+'/api/chat/conversations/'+chat.id+'/voice',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({active:!d.voice_room_active})});const j=await z.json();if(!z.ok||!j.ok){alert(j.message||'تعذر فتح غرفة الصوت.');return;}alert(j.active?'تم فتح غرفة الصوت للدردشة.':'تم إغلاق غرفة الصوت.');close();await openChat(chat.id);};
  modal.querySelectorAll('[data-promote]').forEach(b=>b.onclick=async()=>{const z=await fetch(API+'/api/chat/conversations/'+chat.id+'/cohosts',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({user_id:Number(b.dataset.promote)})});const j=await z.json();if(!z.ok||!j.ok){alert(j.message||'تعذر الترقية.');return;}close();openChatManagement(chat);});
  modal.querySelectorAll('[data-demote]').forEach(b=>b.onclick=async()=>{const z=await fetch(API+'/api/chat/conversations/'+chat.id+'/cohosts/'+b.dataset.demote,{method:'DELETE',headers:{Authorization:'Bearer '+getToken()}});const j=await z.json();if(!z.ok||!j.ok){alert(j.message||'تعذر التخفيض.');return;}close();openChatManagement(chat);});
  modal.querySelectorAll('[data-kick]').forEach(b=>b.onclick=async()=>{if(!confirm('طرد هذا العضو من الدردشة؟'))return;const z=await fetch(API+'/api/chat/conversations/'+chat.id+'/members/'+b.dataset.kick,{method:'DELETE',headers:{Authorization:'Bearer '+getToken()}});const j=await z.json();if(!z.ok||!j.ok){alert(j.message||'تعذر الطرد.');return;}close();openChatManagement(chat);});
}
function closeCreateChatModal(){const modal=document.querySelector('#chatModal');if(!modal)return;modal.classList.remove('open');setTimeout(()=>{if(modal)modal.hidden=true;},180);}
async function openCreateChatModal(type='direct'){if(!currentUser){page('login');return;}if(!document.querySelector('#chatModal'))await page('chat');const modal=document.querySelector('#chatModal'),select=document.querySelector('#chatType');if(!modal||!select)return;const search=document.querySelector('#chatMembersSearch');const name=document.querySelector('#chatName');const desc=document.querySelector('#chatDescription');const tags=document.querySelector('#chatHashtags');if(search)search.value='';if(name)name.value='';if(desc)desc.value='';if(tags)tags.value='';const cover=document.querySelector('#chatCover');if(cover){cover.value='';delete cover.dataset.data;}if(document.querySelector('#chatCoverPreview'))document.querySelector('#chatCoverPreview').innerHTML='';select.value=type;select.dispatchEvent(new Event('change'));modal.hidden=false;requestAnimationFrame(()=>modal.classList.add('open'));}
function openCreationHub(){
  if(!currentUser){ page('login'); return; }
  const existing=document.querySelector('#creationHub');
  if(existing){
    existing.classList.toggle('open');
    document.querySelector('.create-btn')?.classList.toggle('create-open', existing.classList.contains('open'));
    return;
  }
  const modal=document.createElement('div');
  modal.id='creationHub';
  modal.className='creation-hub';
  modal.innerHTML=`<div class="creation-hub-card">
    <button class="creation-hub-close" aria-label="إغلاق">×</button>
    <div class="creation-hub-icon">＋</div>
    <h3>ماذا تريد أن تنشئ؟</h3>
    <p>اختر نوع المحتوى الذي تريد مشاركته مع مجتمع الاتحاد.</p>
    <div class="creation-hub-grid">
      <button data-create="post"><span>✦</span><strong>منشور</strong><small>فكرة، صورة أو تحديث</small></button>
      <button data-create="poll"><span>◉</span><strong>استفتاء</strong><small>اسأل أعضاء المجتمع</small></button>
      <button data-create="article"><span>▤</span><strong>مقال</strong><small>محتوى طويل ومنظم</small></button>
      <button data-create="chat"><span>◌</span><strong>دردشة</strong><small>خاصة أو جماعية</small></button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  const close=()=>{
    modal.classList.remove('open');
    document.querySelector('.create-btn')?.classList.remove('create-open');
    setTimeout(()=>modal.remove(),180);
  };
  modal.querySelector('.creation-hub-close').onclick=close;
  modal.onclick=e=>{if(e.target===modal)close();};
  modal.querySelectorAll('[data-create]').forEach(btn=>btn.onclick=async()=>{
    const type=btn.dataset.create;
    close();
    if(type==='chat'){
      await page('chat');
      requestAnimationFrame(()=>openCreateChatModal('direct'));
    }else{
      await page('create');
      const tab=document.querySelector('.create-type[data-type="'+type+'"]');
      if(tab) tab.click();
    }
  });
  requestAnimationFrame(()=>{
    modal.classList.add('open');
    document.querySelector('.create-btn')?.classList.add('create-open');
  });
}

function markNotificationsRead(){
  fetch(API+'/api/user-notifications/read-all',{method:'POST',headers:{Authorization:'Bearer '+getToken()}}).then(()=>updateNotificationDot()).catch(()=>{});
}

/* =========================
   DRAWER CONTROLS
========================= */

let drawerTouchStartX=0;
document.addEventListener('touchstart',e=>{drawerTouchStartX=e.changedTouches[0].clientX;window.__drawerTouchStartY=e.changedTouches[0].clientY;},{passive:true});
document.addEventListener('touchmove',e=>{if(!document.querySelector('#drawer.open'))return;const t=e.touches[0];const dx=t.clientX-drawerTouchStartX;const dy=t.clientY-(window.__drawerTouchStartY||t.clientY);if(Math.abs(dx)>Math.abs(dy)&&dx>0)e.preventDefault();},{passive:false});
document.addEventListener('touchend',e=>{const end=e.changedTouches[0].clientX,delta=end-drawerTouchStartX,open=document.querySelector('#drawer')?.classList.contains('open');if(open&&delta>60)drawer(false);else if(!open&&drawerTouchStartX>window.innerWidth-32&&delta<-60){updateDrawer();drawer(true);}});
function setOverlayState(element, open){
  if(!element)return;
  element.classList.toggle('open', !!open);
  element.style.opacity=open?'1':'0';
  element.style.visibility=open?'visible':'hidden';
  element.style.pointerEvents=open?'auto':'none';
  if(element.id==='shade')element.style.display=open?'block':'none';
}

function drawer(open){
  setOverlayState(document.querySelector('#drawer'), !!open);
  setOverlayState(document.querySelector('#shade'), !!open);
}


async function updateNotificationDot(){
  const dot=document.querySelector('#notificationDot');
  if(!dot || !currentUser) return;
  try{
    const r=await fetch(API+'/api/user-notifications',{headers:{Authorization:'Bearer '+getToken()},cache:'no-store'});
    const x=await r.json();
    dot.hidden=!(x.ok && (x.notifications||[]).some(n=>!n.is_read));
  }catch(e){}
}

function bindGlobalControls(){
  function resetHiddenOverlays(){
    const overlays=[
      document.querySelector('#shade'),
      document.querySelector('#creationHub'),
      document.querySelector('#chatModal'),
      document.querySelector('#chatManageModal'),
      document.querySelector('#drawer')
    ].filter(Boolean);

    overlays.forEach(el=>{
      const isOpen=el.classList.contains('open')&&!el.hidden;
      if(!isOpen){
        el.classList.remove('open');
        el.style.opacity='0';
        el.style.visibility='hidden';
        el.style.pointerEvents='none';
        if(el.id==='shade')el.style.display='none';
      }
    });
  }

  resetHiddenOverlays();
  document.documentElement.style.scrollBehavior='smooth';
  const bottomMenu=document.querySelector('#bottomMenu');
  if(bottomMenu) bottomMenu.onclick=()=>{ updateDrawer(); drawer(true); };
  const menu=document.querySelector('#menu');
  if(menu) menu.onclick=()=>{ updateDrawer(); drawer(true); };
  const close=document.querySelector('#close');
  if(close) close.onclick=()=>drawer(false);
  const shade=document.querySelector('#shade');
  if(shade) shade.onclick=()=>drawer(false);
  document.querySelectorAll('.bottom-nav [data-page], .top-action[data-page], #globalTabs [data-page]').forEach(button=>{
    button.onclick=()=>page(button.dataset.page);
  });
  const creationButton=document.querySelector('.create-btn');
  if(creationButton){
    creationButton.type='button';
    creationButton.onclick=(event)=>{
      event.preventDefault();
      event.stopPropagation();
      const hub=document.querySelector('#creationHub');
      if(hub){
        hub.classList.toggle('open');
        creationButton.classList.toggle('create-open',hub.classList.contains('open'));
      }else openCreationHub();
    };
  }
  const drawerProfile=document.querySelector('.drawer-profile');
  if(drawerProfile) drawerProfile.addEventListener('click',event=>{
    if(event.target.closest('#close'))return;
    if(currentUser){drawer(false);page('profile',currentUser.profile_slug||currentUser.id);}
  });
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bindGlobalControls,{once:true});
else bindGlobalControls();

/* =========================
   PERFORMANCE HELPERS
========================= */
function debounce(fn,wait=200){
  let timer=null;
  return function(...args){
    clearTimeout(timer);
    timer=setTimeout(()=>fn.apply(this,args),wait);
  };
}
function throttle(fn,wait=100){
  let last=0,timer=null;
  return function(...args){
    const now=Date.now(),remaining=wait-(now-last);
    if(remaining<=0){
      clearTimeout(timer);timer=null;last=now;fn.apply(this,args);
    }else if(!timer){
      timer=setTimeout(()=>{timer=null;last=Date.now();fn.apply(this,args);},remaining);
    }
  };
}
(function installScrollPerformanceGuard(){
  const onScroll=throttle(()=>{},100);
  window.addEventListener('scroll',onScroll,{passive:true});
})();

/* =========================
   START
========================= */

(async function(){

  installScrollGuards();
  await loadCurrentUser();

  await heartbeat();
  await updateNotificationDot();

  setInterval(()=>{if(document.visibilityState==='visible')heartbeat();},30000);
  setInterval(()=>{if(document.visibilityState==='visible')updateNotificationDot();},30000);

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



/* =========================
   POLL ENHANCEMENT MODULE
========================= */
(function(){
  const pollApi=API;
  let pollTimer=null;
  function pollTags(value){return String(value||'').split(/[,\s]+/).map(x=>x.replace(/^#/,'').trim()).filter(Boolean).slice(0,12);}
  function formatRemaining(closesAt){
    if(!closesAt)return 'مفتوح';
    const ms=new Date(closesAt).getTime()-Date.now(); if(ms<=0)return 'انتهى التصويت';
    const total=Math.floor(ms/1000),d=Math.floor(total/86400),h=Math.floor(total%86400/3600),m=Math.floor(total%3600/60),sec=total%60;
    if(d)return d+' يوم '+h+' ساعة'; if(h)return h+' ساعة '+m+' دقيقة'; if(m)return m+' دقيقة '+sec+' ثانية'; return sec+' ثانية';
  }
  function pollSettingsMarkup(){
    return '<div class="poll-settings-grid"><label>مدة التصويت<select name="duration_minutes"><option value="5">5 دقائق</option><option value="15">15 دقيقة</option><option value="60">ساعة</option><option value="360">6 ساعات</option><option value="1440" selected>يوم</option><option value="4320">3 أيام</option><option value="10080">7 أيام</option><option value="43200">30 يوماً</option></select></label><label>ظهور النتائج<select name="results_visibility"><option value="after_vote" selected>بعد التصويت</option><option value="always">لجميع الأعضاء فوراً</option><option value="after_close">بعد انتهاء التصويت</option><option value="never">لا تعرض النتائج للأعضاء</option></select></label></div><label class="check-row"><input type="checkbox" name="allow_vote_change" checked><span>السماح بتغيير التصويت قبل انتهاء المدة</span></label><label class="check-row"><input type="checkbox" name="anonymous"><span>تصويت مجهول للأعضاء</span></label><div class="poll-notice">سيتم إرسال إشعار تلقائي عند انتهاء التصويت إلى كل من شارك فيه وإلى صاحب الاستفتاء.</div>';
  }
  function enhancePollForm(form){
    if(!form||form.dataset.enhanced==='1')return;
    form.dataset.enhanced='1';
    const tags=form.querySelector('input[name="hashtags"]')?.closest('label');
    if(tags)tags.insertAdjacentHTML('beforebegin',pollSettingsMarkup());
    form.addEventListener('submit',async e=>{
      e.preventDefault(); e.stopImmediatePropagation();
      const status=form.querySelector('#createStatus'),button=form.querySelector('button[type="submit"]'),data=new FormData(form);
      const options=data.getAll('option').map(x=>String(x).trim()).filter(Boolean);
      if(options.length<2){if(status)status.textContent='أضف خيارين على الأقل.';return;}
      if(button){button.disabled=true;button.textContent='جارٍ النشر...';}
      try{
        const response=await fetch(pollApi+'/api/polls',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({question:String(data.get('question')||'').trim(),options,hashtags:pollTags(data.get('hashtags')),duration_minutes:Number(data.get('duration_minutes')||1440),allow_vote_change:data.get('allow_vote_change')==='on',anonymous:data.get('anonymous')==='on',results_visibility:String(data.get('results_visibility')||'after_vote')})});
        const result=await response.json();
        if(!response.ok||!result.ok)throw new Error(result.message||'تعذر نشر الاستفتاء.');
        if(status)status.innerHTML='<span class="success">تم نشر الاستفتاء بنجاح.</span>';
        await loadPolls(); setTimeout(()=>page('home'),250);
      }catch(error){if(status)status.innerHTML='<span class="error">'+escapeHTML(error.message)+'</span>';}
      finally{if(button){button.disabled=false;button.textContent='نشر الاستطلاع';}}
    },true);
  }
  function pollCard(p){
    const results=p.results||[],map=new Map(results.map(x=>[Number(x.option_index),x])),canVote=!p.closed,voted=p.my_vote!==null&&p.my_vote!==undefined;
    const options=(p.options||[]).map((opt,i)=>{const r=map.get(i),checked=Number(p.my_vote)===i,resultHtml=p.results?'<span class="poll-result-value">'+(r?.count||0)+' · '+(r?.percentage||0)+'%</span>':'';return '<label class="poll-option '+(checked?'selected ':'')+(p.results?'with-results':'')+'"><input type="radio" name="poll-'+p.id+'" value="'+i+'" '+(checked?'checked':'')+' '+(canVote?'':'disabled')+'><span class="poll-option-copy">'+escapeHTML(opt)+'</span>'+resultHtml+'</label>';}).join('');
    const tags=(p.hashtags||[]).map(t=>'<span class="hashtag">#'+escapeHTML(t)+'</span>').join('');
    const action=canVote?'<button class="btn poll-vote-btn" data-poll-vote="'+p.id+'">'+(voted&&p.allow_vote_change?'تحديث التصويت':'تصويت')+'</button>':'<span class="poll-closed">انتهى التصويت</span>';
    return '<article class="poll-card card" data-poll-id="'+p.id+'" data-closes="'+escapeHTML(p.closes_at||'')+'"><div class="poll-card-head"><div><strong>'+escapeHTML(p.author?.full_name||'عضو')+'</strong><small>'+new Date(p.created_at).toLocaleString('ar-LY')+'</small></div><span class="poll-status">'+(p.closed?'منتهٍ':'ينتهي خلال <b class="poll-countdown">'+escapeHTML(formatRemaining(p.closes_at))+'</b>')+'</span></div><h3>'+escapeHTML(p.question)+'</h3>'+(tags?'<div class="hashtags">'+tags+'</div>':'')+'<div class="poll-options">'+options+'</div><div class="poll-footer"><span>'+p.total_votes+' صوت</span>'+action+'</div></article>';
  }
  async function bindPollVotes(box){
    box.querySelectorAll('[data-poll-vote]').forEach(btn=>btn.onclick=async()=>{
      if(!currentUser){page('login');return;}
      const card=btn.closest('[data-poll-id]'),selected=card?.querySelector('input[type="radio"]:checked'); if(!selected){alert('اختر خياراً أولاً.');return;}
      btn.disabled=true;
      try{const r=await fetch(pollApi+'/api/polls/'+Number(btn.dataset.pollVote)+'/vote',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({option_index:Number(selected.value)})}),x=await r.json();if(!r.ok||!x.ok)throw new Error(x.message||'تعذر تسجيل التصويت.');await loadPolls();}catch(error){alert(error.message);}finally{btn.disabled=false;}
    });
  }
  async function loadPolls(){
    const hosts=[document.querySelector('#homePosts'),document.querySelector('#postsPageFeed')].filter(Boolean);if(!hosts.length)return;
    try{
      const r=await fetch(pollApi+'/api/polls',{headers:getToken()?{Authorization:'Bearer '+getToken()}:{} ,cache:'no-store'}),x=await r.json();if(!r.ok||!x.ok)throw new Error(x.message||'تعذر تحميل الاستفتاءات.');
      const html=(x.polls||[]).map(pollCard).join('');
      hosts.forEach(host=>{let box=host.parentElement.querySelector('.poll-feed');if(!box){box=document.createElement('section');box.className='poll-feed';host.parentElement.insertBefore(box,host);}box.innerHTML=html;bindPollVotes(box);});
    }catch(error){}
  }
  function observe(){
    const observer=new MutationObserver(()=>{const form=document.querySelector('#pollForm');if(form)enhancePollForm(form);const host=document.querySelector('#homePosts')||document.querySelector('#postsPageFeed');if(host&&!host.parentElement.querySelector('.poll-feed'))loadPolls();});
    observer.observe(document.body,{childList:true,subtree:true});
    enhancePollForm(document.querySelector('#pollForm'));loadPolls();
    if(pollTimer)clearInterval(pollTimer);
    pollTimer=setInterval(()=>{
      if(document.visibilityState!=='visible')return;
      document.querySelectorAll('.poll-countdown').forEach(el=>{
        const card=el.closest('[data-poll-id]');
        if(card)el.textContent=formatRemaining(card.dataset.closes);
      });
    },1000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observe,{once:true});else observe();
})();

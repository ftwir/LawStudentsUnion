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

async function renderHome(){

  const announcements =
    await getData(
      'announcements',
      demo.announcements
    );

  const activities =
    await getData(
      'activities',
      demo.activities
    );


  app.innerHTML = `

    <section class="community-cover"></section>

    <section class="community-info">

      <div class="community-avatar">
        ⚖
      </div>

      <h1>
        اتحاد طلبة كلية القانون
      </h1>

      <p>
        المجتمع الطلابي للنقاش والتواصل
        ومتابعة أخبار الاتحاد والأنشطة والفعاليات.
      </p>

      <div class="community-stats">

        <div>
          <strong>Community</strong>
          <span>المجتمع الرسمي</span>
        </div>

        <div>
          <strong>Public</strong>
          <span>متاح للجميع</span>
        </div>

        <div>
          <strong id="onlineCount">—</strong>
          <span>متصل الآن</span>
        </div>

      </div>

    </section>


    <div class="community-tabs">

      <button class="active">
        الرئيسية
      </button>

      <button>
        المنشورات
      </button>

      <button>
        الأعضاء
      </button>

      <button>
        الفعاليات
      </button>

    </div>


    <div class="section-title">
      <h2>استكشف المجتمع</h2>
      <span>Community</span>
    </div>


    <div class="community-grid">

      <div class="community-box"
           data-page="announcements">

        <div class="box-icon">📢</div>

        <strong>الإعلانات</strong>

        <span>
          أخبار الاتحاد
        </span>

      </div>


      <div class="community-box"
           data-page="activities">

        <div class="box-icon">🎓</div>

        <strong>الفعاليات</strong>

        <span>
          الأنشطة والبرامج
        </span>

      </div>


      <div class="community-box"
           data-page="schedule">

        <div class="box-icon">📚</div>

        <strong>الدراسة</strong>

        <span>
          الجداول الدراسية
        </span>

      </div>


      <div class="community-box"
           data-page="registration">

        <div class="box-icon">👥</div>

        <strong>
          ${currentUser ? 'المجتمع' : 'انضم للمجتمع'}
        </strong>

        <span>
          ${currentUser
            ? 'شارك كعضو'
            : 'قدم طلب العضوية'}
        </span>

      </div>

    </div>


    <div class="section-title">
      <h2>آخر المنشورات</h2>
      <span>Feed</span>
    </div>


    <div class="feed">

      ${announcements.slice(0,3).map(x => `

        <article class="post">

          <div class="post-head">

            <div class="post-avatar">
              ⚖
            </div>

            <div class="post-author">

              <strong>
                اتحاد طلبة كلية القانون
              </strong>

              <small>
                ${escapeHTML(
                  x.date ||
                  x.published_at ||
                  'اليوم'
                )}
              </small>

            </div>

          </div>

          <div class="post-body">

            <span class="tag">
              ${escapeHTML(x.tag || 'عام')}
            </span>

            <h3>
              ${escapeHTML(x.title)}
            </h3>

            <p>
              ${escapeHTML(x.body)}
            </p>

          </div>

          <div class="post-actions">

            <button>
              ♡ إعجاب
            </button>

            <button>
              💬 تعليق
            </button>

            <button>
              ↗ مشاركة
            </button>

          </div>

        </article>

      `).join('')}

    </div>


    <div class="section-title">
      <h2>الفعاليات القادمة</h2>
      <span>Events</span>
    </div>


    ${activities.slice(0,2).map(x => `

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


  app
    .querySelectorAll('[data-page]')
    .forEach(button => {

      button.onclick = () => {
        page(button.dataset.page);
      };

    });

  const onlineCount = await getOnlineCount();
  const onlineEl = document.querySelector('#onlineCount');
  if(onlineEl) onlineEl.textContent = onlineCount;

  setTimeout(async () => {
    const count = await getOnlineCount();
    const el = document.querySelector('#onlineCount');
    if(el) el.textContent = count;
  }, 30000);
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

/* =========================
   PAGE ROUTER
========================= */

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


  if(
    [
      'admin',
      'members',
      'applications',
      'content',
      'reports'
    ].includes(p) &&
    !['admin','owner'].includes(role())
  ){

    page('home');

    return;
  }


  if(
    [
      'owner',
      'admins',
      'users',
      'private-chats',
      'logs',
      'settings'
    ].includes(p) &&
    role() !== 'owner'
  ){

    page('home');

    return;
  }


  if(
    [
      'admin',
      'members',
      'applications',
      'content',
      'reports',
      'owner',
      'admins',
      'users',
      'private-chats',
      'logs',
      'settings'
    ].includes(p)
  ){

    const title = {

      admin:'لوحة الإدارة',
      members:'إدارة الأعضاء',
      applications:'طلبات العضوية',
      content:'إدارة المحتوى',
      reports:'البلاغات',

      owner:'مركز المالك',
      admins:'إدارة الـAdmins',
      users:'جميع المستخدمين',
      'private-chats':'القنوات الخاصة',
      logs:'سجل النظام',
      settings:'إعدادات النظام'

    }[p];


    app.innerHTML = `

      <div class="section-title">
        <h2>${title}</h2>
        <span>
          ${role() === 'owner'
            ? 'OWNER'
            : 'ADMIN'}
        </span>
      </div>

      <div class="card">

        <h3>
          ${title}
        </h3>

        <p>
          هذه الواجهة جاهزة ضمن التصميم الجديد،
          وسيتم ربطها ببيانات قاعدة PostgreSQL
          وصلاحيات الـAPI في المرحلة التالية.
        </p>

      </div>

    `;

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
  if(hash.startsWith('profile/')){
    const identifier = decodeURIComponent(hash.slice('profile/'.length));
    page('profile', identifier);
  }else{
    /*
      التطبيق يبدأ دائماً كـGuest
      إذا لم توجد جلسة صالحة.
    */
    page('home');
  }

  window.addEventListener('hashchange', () => {
    const next = location.hash.replace(/^#/, '');
    if(next.startsWith('profile/')){
      const identifier = decodeURIComponent(next.slice('profile/'.length));
      page('profile', identifier);
    }
  });

})();



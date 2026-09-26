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


/* =========================
   INTERACTIVE COMMUNITY V2
========================= */

async function apiV2(path, options) {
  options = options || {};
  var headers = options.headers || {};
  var token = getToken();
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  var response = await fetch(API + path, Object.assign({}, options, {headers: headers, cache: 'no-store'}));
  var data = {};
  try { data = await response.json(); } catch(e) {}
  if (!response.ok || data.ok === false) throw new Error(data.message || 'تعذر تنفيذ العملية.');
  return data;
}

function v2Date(value) {
  try { return new Date(value).toLocaleString('ar-LY', {dateStyle:'medium', timeStyle:'short'}); }
  catch(e) { return 'الآن'; }
}

async function v2Posts(section) {
  try {
    var data = await apiV2('/api/posts?section=' + encodeURIComponent(section));
    return data.posts || [];
  } catch(e) {
    return [];
  }
}

function v2PostCard(post) {
  var admin = role() === 'admin' || role() === 'owner';
  var mine = currentUser && Number(post.author_id) === Number(currentUser.id);
  var avatar = post.author_avatar
    ? '<img src="' + escapeHTML(post.author_avatar) + '" alt="">'
    : '⚖';
  return [
    '<article class="post interactive-post" data-post="' + escapeHTML(post.id) + '">',
      '<div class="post-head">',
        '<button class="post-avatar-btn" data-profile-id="' + escapeHTML(post.author_id || '') + '">' + avatar + '</button>',
        '<div class="post-author"><strong>' + escapeHTML(post.author_name || 'عضو الاتحاد') + '</strong><small>' + v2Date(post.created_at) + '</small></div>',
        post.is_pinned ? '<span class="pin-badge">📌 مثبت</span>' : '',
      '</div>',
      '<div class="post-body">',
        post.title ? '<h3>' + escapeHTML(post.title) + '</h3>' : '',
        '<p>' + escapeHTML(post.body || '').replaceAll('\n','<br>') + '</p>',
        post.image_url ? '<img class="post-image" src="' + escapeHTML(post.image_url) + '" alt="صورة المنشور">' : '',
      '</div>',
      '<div class="post-actions">',
        '<button class="v2-like ' + (post.liked ? 'liked' : '') + '" data-like-id="' + escapeHTML(post.id) + '">♡ <span>' + (post.likes_count || 0) + '</span> إعجاب</button>',
        '<button data-comment-id="' + escapeHTML(post.id) + '">💬 <span>' + (post.comments_count || 0) + '</span> تعليق</button>',
        admin ? '<button data-pin-id="' + escapeHTML(post.id) + '">' + (post.is_pinned ? '📌 إلغاء التثبيت' : '📌 تثبيت') + '</button>' : '',
        (mine || admin) ? '<button data-delete-id="' + escapeHTML(post.id) + '">🗑 حذف</button>' : '',
      '</div>',
      '<div class="comments-panel" id="comments-' + escapeHTML(post.id) + '"></div>',
    '</article>'
  ].join('');
}

async function bindV2Posts() {
  document.querySelectorAll('[data-profile-id]').forEach(function(button) {
    button.onclick = function() { page('profile', button.dataset.profileId); };
  });

  document.querySelectorAll('[data-like-id]').forEach(function(button) {
    button.onclick = async function() {
      if (!currentUser) return page('login');
      try {
        var result = await apiV2('/api/posts/' + button.dataset.likeId + '/like', {method:'POST'});
        button.classList.toggle('liked', result.liked);
        button.querySelector('span').textContent = result.likes_count;
      } catch(e) { alert(e.message); }
    };
  });

  document.querySelectorAll('[data-comment-id]').forEach(function(button) {
    button.onclick = async function() {
      var id = button.dataset.commentId;
      var box = document.querySelector('#comments-' + id);
      if (box.innerHTML) { box.innerHTML = ''; return; }
      try {
        var result = await apiV2('/api/posts/' + id + '/comments');
        var comments = result.comments || [];
        box.innerHTML =
          '<div class="comments-list">' +
          comments.map(function(c) {
            return '<div class="comment"><b>' + escapeHTML(c.author_name) + '</b><span>' + escapeHTML(c.body) + '</span><small>' + v2Date(c.created_at) + '</small></div>';
          }).join('') +
          '</div>' +
          (currentUser
            ? '<form class="comment-form" data-comment-form="' + id + '"><input name="body" required placeholder="اكتب تعليقاً..."><button>إرسال</button></form>'
            : '<div class="comment-login">سجّل الدخول للتعليق.</div>');
        var form = box.querySelector('[data-comment-form]');
        if (form) form.onsubmit = async function(event) {
          event.preventDefault();
          var body = new FormData(form).get('body');
          try {
            await apiV2('/api/posts/' + id + '/comments', {method:'POST', body:JSON.stringify({body:body})});
            box.innerHTML = '';
            button.click();
          } catch(e) { alert(e.message); }
        };
      } catch(e) { box.textContent = e.message; }
    };
  });

  document.querySelectorAll('[data-pin-id]').forEach(function(button) {
    button.onclick = async function() {
      try {
        await apiV2('/api/posts/' + button.dataset.pinId + '/pin', {
          method:'PATCH',
          body:JSON.stringify({pinned: button.textContent.indexOf('إلغاء') === -1})
        });
        page(location.hash === '#announcements' ? 'announcements' : location.hash === '#activities' ? 'activities' : 'home');
      } catch(e) { alert(e.message); }
    };
  });

  document.querySelectorAll('[data-delete-id]').forEach(function(button) {
    button.onclick = async function() {
      if (!confirm('هل تريد حذف هذا المنشور؟')) return;
      try {
        await apiV2('/api/posts/' + button.dataset.deleteId, {method:'DELETE'});
        page(location.hash === '#announcements' ? 'announcements' : location.hash === '#activities' ? 'activities' : 'home');
      } catch(e) { alert(e.message); }
    };
  });
}

async function renderV2Section(section, title, subtitle, icon, description) {
  var posts = await v2Posts(section);
  app.innerHTML =
    '<div class="page-shell page-' + section + '">' +
      '<div class="page-hero"><div class="page-icon">' + icon + '</div><div><span>' + subtitle + '</span><h1>' + title + '</h1><p>' + description + '</p></div></div>' +
      '<div class="section-title"><h2>منشورات الصفحة</h2><span>' + posts.length + ' منشور</span></div>' +
      '<div class="feed">' + (posts.length ? posts.map(v2PostCard).join('') : '<div class="empty">لا توجد منشورات بعد.</div>') + '</div>' +
    '</div>';
  await bindV2Posts();
}

async function renderV2Create() {
  if (!currentUser) return renderMembership();
  var manager = role() === 'admin' || role() === 'owner';
  app.innerHTML =
    '<div class="page-shell page-create">' +
      '<div class="composer-hero"><div class="page-icon">✦</div><h1>إنشاء منشور</h1><p>شارك أفكارك ومعلوماتك مع الطلبة.</p></div>' +
      '<form class="card form" id="v2PostForm">' +
        '<label>القسم<select name="section"><option value="community">المجتمع</option>' +
          (manager ? '<option value="announcements">الإعلانات</option><option value="activities">الفعاليات</option>' : '') +
        '</select></label>' +
        '<label>العنوان<input name="title" maxlength="255" placeholder="عنوان اختياري"></label>' +
        '<label>المحتوى<textarea name="body" maxlength="5000" required placeholder="اكتب منشورك هنا..."></textarea></label>' +
        '<label>إرفاق صورة<input id="v2PostImage" type="file" accept="image/*"><div id="v2PostPreview" class="upload-preview">اضغط لاختيار صورة</div></label>' +
        '<button class="btn" id="v2PostButton">نشر المنشور</button><div id="v2PostStatus"></div>' +
      '</form>' +
    '</div>';

  var imageData = null;
  document.querySelector('#v2PostImage').onchange = function(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    if (file.size > 2200000) { alert('الصورة كبيرة جداً. الحد 2.2MB.'); event.target.value=''; return; }
    var reader = new FileReader();
    reader.onload = function() {
      imageData = reader.result;
      document.querySelector('#v2PostPreview').innerHTML = '<img src="' + escapeHTML(imageData) + '">';
    };
    reader.readAsDataURL(file);
  };

  document.querySelector('#v2PostForm').onsubmit = async function(event) {
    event.preventDefault();
    var data = Object.fromEntries(new FormData(event.currentTarget));
    var status = document.querySelector('#v2PostStatus');
    var button = document.querySelector('#v2PostButton');
    button.disabled = true;
    status.textContent = 'جارٍ النشر...';
    try {
      await apiV2('/api/posts', {method:'POST', body:JSON.stringify({
        section:data.section, title:data.title, body:data.body, image_url:imageData
      })});
      status.textContent = 'تم نشر المنشور بنجاح.';
      setTimeout(function(){ page(data.section === 'community' ? 'home' : data.section); }, 500);
    } catch(e) {
      status.textContent = e.message;
      button.disabled = false;
    }
  };
}

/*
  Replace the old router with a page-specific interactive router.
*/
async function page(p, profileIdentifier) {
  document.querySelectorAll('[data-page]').forEach(function(x) {
    x.classList.toggle('active', x.dataset.page === p);
  });

  if (p === 'create') return renderV2Create();
  if (p === 'home') {
    var communityPosts = await v2Posts('community');
    var online = await getOnlineCount();
    app.innerHTML =
      '<div class="home-page">' +
        '<section class="community-cover"></section>' +
        '<section class="community-info"><div class="community-avatar">⚖</div><h1>اتحاد طلبة كلية القانون</h1><p>المجتمع الطلابي الرسمي للتواصل والنشر ومتابعة الأخبار والأنشطة.</p>' +
        '<div class="community-stats"><div><strong>Public</strong><span>مجتمع مفتوح</span></div><div><strong>' + online + '</strong><span>متصل الآن</span></div><div><strong>' + communityPosts.length + '</strong><span>منشور</span></div></div></section>' +
        '<div class="community-tabs"><button class="active">الرئيسية</button><button data-page="announcements">الإعلانات</button><button data-page="activities">الفعاليات</button><button data-page="schedule">الدراسة</button></div>' +
        '<div class="section-title"><h2>مساحات المجتمع</h2><span>Explore</span></div>' +
        '<div class="community-grid">' +
          '<div class="community-box" data-page="announcements"><div class="box-icon">📢</div><strong>الإعلانات</strong><span>الأخبار الرسمية</span></div>' +
          '<div class="community-box" data-page="activities"><div class="box-icon">🎓</div><strong>الفعاليات</strong><span>البرامج والأنشطة</span></div>' +
          '<div class="community-box" data-page="schedule"><div class="box-icon">📚</div><strong>الدراسة</strong><span>الجداول والمواعيد</span></div>' +
          '<div class="community-box" data-page="create"><div class="box-icon">' + (currentUser?'✚':'👥') + '</div><strong>' + (currentUser?'اكتب منشوراً':'انضم للمجتمع') + '</strong><span>' + (currentUser?'شارك أفكارك':'طلب العضوية') + '</span></div>' +
        '</div>' +
        '<div class="section-title"><h2>أحدث منشورات المجتمع</h2><span>Feed</span></div>' +
        '<div class="feed">' + (communityPosts.slice(0,8).map(v2PostCard).join('') || '<div class="empty">لا توجد منشورات بعد.</div>') + '</div>' +
      '</div>';
    app.querySelectorAll('[data-page]').forEach(function(b){b.onclick=function(){page(b.dataset.page);};});
    await bindV2Posts();
    return;
  }
  if (p === 'announcements') return renderV2Section('announcements','الإعلانات','Official','📢','مساحة مستقلة للإعلانات الرسمية والمستجدات المهمة.');
  if (p === 'activities') return renderV2Section('activities','الأنشطة والفعاليات','Events','🎓','مساحة مستقلة للندوات والمسابقات والبرامج والفعاليات.');
  if (p === 'profile') {
    if (!currentUser) return page('login');
    return renderProfile(profileIdentifier || currentUser.profile_slug || currentUser.id);
  }
  if (p === 'login') return renderLogin();
  if (p === 'registration') return renderMembership();
  if (p === 'schedule') return renderSchedule();
  if (p === 'notifications') return renderNotifications();
  if (['chat'].includes(p)) {
    if (!currentUser) return page('login');
    app.innerHTML = '<div class="page-shell page-chat"><div class="page-hero"><div class="page-icon">💬</div><div><span>Members</span><h1>الدردشة</h1><p>مساحة المحادثات للأعضاء.</p></div></div><div class="empty">ستُربط غرف الدردشة بالرسائل في المرحلة التالية.</div></div>';
    return;
  }
  if (['admin','members','applications','content','reports'].includes(p) && !['admin','owner'].includes(role())) return page('home');
  if (['owner','admins','users','private-chats','logs','settings'].includes(p) && role() !== 'owner') return page('home');
  if (['admin','members','applications','content','reports','owner','admins','users','private-chats','logs','settings'].includes(p)) return renderManagement(p);
  if (p === 'about') {
    app.innerHTML = '<div class="page-shell"><div class="page-hero"><div class="page-icon">⚖</div><div><span>Community</span><h1>عن المجتمع</h1><p>اتحاد طلبة كلية القانون.</p></div></div><article class="card"><p>منصة طلابية للنشر والتواصل ومتابعة الأخبار والأنشطة والفعاليات.</p></article></div>';
    return;
  }
  return page('home');
}

/* The + button is now context-aware: guests see membership, signed-in users create posts. */

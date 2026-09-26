const API = 'https://lawstudentsunionapi.onrender.com';

const demo = {
  announcements: [
    {
      title: 'مرحباً بكم في منصة اتحاد طلبة كلية القانون',
      body: 'هذه النسخة الجديدة تجمع إعلانات الاتحاد والأنشطة والجداول وخدمات الطلبة في مكان واحد.',
      date: '26 سبتمبر 2026',
      tag: 'عام'
    }
  ],
  activities: [
    {
      title: 'ندوة القانون الدستوري',
      body: 'ندوة طلابية مفتوحة حول المبادئ الدستورية وتطبيقاتها.',
      date: 'قريباً',
      tag: 'ندوة'
    }
  ],
  schedule: [
    {
      title: 'الجدول الدراسي',
      body: 'سيتم تحديث الجداول من لوحة إدارة الاتحاد عند اعتمادها.',
      date: 'الفصل الحالي',
      tag: 'جدول'
    }
  ]
};

const app = document.querySelector('#app');

let currentUser = null;


/* =========================
   AUTH / SESSION
========================= */

function getToken() {
  return localStorage.getItem('lsu_token') || '';
}

function setToken(token) {
  if (token) {
    localStorage.setItem('lsu_token', token);
  } else {
    localStorage.removeItem('lsu_token');
  }
}

async function loadCurrentUser() {
  const token = getToken();

  if (!token) {
    currentUser = null;
    return null;
  }

  try {
    const response = await fetch(`${API}/api/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      },
      cache: 'no-store'
    });

    const result = await response.json();

    if (result.ok) {
      currentUser = result.user;
      return result.user;
    }

    setToken('');
    currentUser = null;
    return null;

  } catch (error) {
    currentUser = null;
    return null;
  }
}

async function login(identifier, password) {
  const response = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      identifier,
      password
    })
  });

  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.message || 'بيانات تسجيل الدخول غير صحيحة.');
  }

  setToken(result.token);
  currentUser = result.user;

  return result.user;
}

async function logout() {
  const token = getToken();

  try {
    if (token) {
      await fetch(`${API}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    }
  } catch (error) {
    // حتى إذا تعذر الاتصال بالخادم، نحذف الجلسة محلياً.
  }

  setToken('');
  currentUser = null;

  page('login');
}


/* =========================
   GENERAL UI
========================= */

function header(title, sub = '') {
  return `
    <div class="section">
      <div>
        <h2>${title}</h2>
        ${sub ? `<div class="date">${sub}</div>` : ''}
      </div>
    </div>
  `;
}

function cards(items) {
  return items.map(x => `
    <article class="card">
      <span class="tag">${x.tag || 'عام'}</span>
      <h3>${x.title}</h3>
      <p>${x.body}</p>
      <div class="date">${x.date || x.published_at || x.event_date || ''}</div>
    </article>
  `).join('') || `
    <div class="empty">
      لا توجد بيانات منشورة حالياً.
    </div>
  `;
}


/* =========================
   API DATA
========================= */

async function getData(action, fallback) {
  try {
    const response = await fetch(
      `${API}?action=${action}`,
      {
        cache: 'no-store'
      }
    );

    const result = await response.json();

    return result.ok ? result.data : fallback;

  } catch (error) {
    return fallback;
  }
}


/* =========================
   PAGE ROUTER
========================= */

async function page(p) {

  document.querySelectorAll('[data-page]').forEach(x => {
    x.classList.toggle(
      'active',
      x.dataset.page === p
    );
  });


  /* =========================
     LOGIN
  ========================= */

  if (p === 'login') {

    app.innerHTML = `
      <section class="login-wrap">

        <div class="login-card">

          <div class="login-logo">
            ⚖️
          </div>

          <h1>تسجيل الدخول</h1>

          <p>
            الدخول إلى منصة اتحاد طلبة كلية القانون
          </p>

          <form class="form" id="loginForm">

            <label>
              رقم القيد أو البريد الإلكتروني

              <input
                type="text"
                name="identifier"
                required
                autocomplete="username"
                placeholder="أدخل رقم القيد أو البريد الإلكتروني"
              >
            </label>


            <label>
              كلمة المرور

              <input
                type="password"
                name="password"
                required
                autocomplete="current-password"
                placeholder="أدخل كلمة المرور"
              >
            </label>


            <button
              type="submit"
              class="btn gold"
              id="loginButton"
            >
              تسجيل الدخول
            </button>


            <div id="loginStatus"></div>

          </form>

        </div>

      </section>
    `;


    const form = document.querySelector('#loginForm');
    const button = document.querySelector('#loginButton');
    const status = document.querySelector('#loginStatus');


    form.onsubmit = async function (event) {

      event.preventDefault();

      const formData = new FormData(form);

      const identifier =
        String(formData.get('identifier') || '').trim();

      const password =
        String(formData.get('password') || '');


      if (!identifier || !password) {
        status.textContent =
          'يرجى إدخال بيانات تسجيل الدخول.';

        return;
      }


      button.disabled = true;
      button.textContent = 'جارٍ تسجيل الدخول...';
      status.textContent = '';


      try {

        await login(identifier, password);

        status.textContent =
          'تم تسجيل الدخول بنجاح.';


        button.textContent =
          'تم الدخول ✓';


        setTimeout(() => {
          page('home');
        }, 600);


      } catch (error) {

        status.textContent =
          error.message ||
          'تعذر تسجيل الدخول.';


        button.disabled = false;
        button.textContent =
          'تسجيل الدخول';
      }
    };


    return;
  }


  /* =========================
     HOME
  ========================= */

  if (p === 'home') {

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


    const userName =
      currentUser?.full_name
        ? currentUser.full_name
        : 'الطالب';


    app.innerHTML = `

      <section class="hero">

        <h1>
          مرحباً ${userName}
        </h1>

        <p>
          مرحباً بك في منصة اتحاد طلبة كلية القانون.
          يمكنك من هنا الوصول إلى إعلانات الاتحاد،
          الأنشطة الطلابية، الجداول والخدمات.
        </p>

      </section>


      <div class="section">
        <h2>الخدمات السريعة</h2>
      </div>


      <div class="grid">

        <div
          class="quick"
          data-page="announcements"
        >
          📢
          <strong>الإعلانات</strong>
          <span>آخر أخبار الاتحاد</span>
        </div>


        <div
          class="quick"
          data-page="activities"
        >
          🎓
          <strong>الأنشطة</strong>
          <span>الفعاليات والبرامج</span>
        </div>


        <div
          class="quick"
          data-page="schedule"
        >
          📅
          <strong>الجدول</strong>
          <span>المواعيد الدراسية</span>
        </div>


        <div
          class="quick"
          data-page="registration"
        >
          📝
          <strong>التسجيل</strong>
          <span>بيانات الطالب والطلبات</span>
        </div>

      </div>


      ${header('آخر الإعلانات')}

      ${cards(announcements.slice(0, 3))}


      ${header('الأنشطة القادمة')}

      ${cards(activities.slice(0, 2))}

    `;


    app.querySelectorAll('[data-page]').forEach(x => {
      x.onclick = () => page(x.dataset.page);
    });

    return;
  }


  /* =========================
     ANNOUNCEMENTS
  ========================= */

  if (p === 'announcements') {

    app.innerHTML =
      header(
        'الإعلانات',
        'آخر ما ينشره اتحاد الطلبة'
      ) +
      cards(
        await getData(
          'announcements',
          demo.announcements
        )
      );

    return;
  }


  /* =========================
     ACTIVITIES
  ========================= */

  if (p === 'activities') {

    app.innerHTML =
      header(
        'الأنشطة الطلابية',
        'الفعاليات والبرامج القادمة'
      ) +
      cards(
        await getData(
          'activities',
          demo.activities
        )
      );

    return;
  }


  /* =========================
     SCHEDULE
  ========================= */

  if (p === 'schedule') {

    const data =
      await getData(
        'schedule',
        demo.schedule
      );


    app.innerHTML =
      header(
        'الجدول الدراسي',
        'المواعيد والجداول المعتمدة'
      ) +

      (
        data.length

          ? `
            <div class="schedule-list">

              ${data.map(x => `

                <article class="schedule-row">

                  <div>
                    <b>${x.title}</b>

                    <p>
                      ${x.body || ''}
                    </p>
                  </div>


                  <div>

                    <strong>
                      ${x.day_name || ''}
                    </strong>

                    <span>
                      ${(x.start_time || '').slice(0, 5)}

                      ${
                        x.end_time
                          ? ' — ' + x.end_time.slice(0, 5)
                          : ''
                      }
                    </span>

                    <small>
                      ${x.room || ''}
                    </small>

                  </div>

                </article>

              `).join('')}

            </div>
          `

          : cards(data)
      );

    return;
  }


  /* =========================
     NOTIFICATIONS
  ========================= */

  if (p === 'notifications') {

    app.innerHTML =
      header(
        'الإشعارات',
        'تنبيهات الاتحاد'
      ) +

      cards(
        await getData(
          'notifications',
          []
        )
      );

    return;
  }


  /* =========================
     ABOUT
  ========================= */

  if (p === 'about') {

    app.innerHTML =
      header('عن الاتحاد') +

      `
        <article class="card">

          <h3>
            اتحاد طلبة كلية القانون
          </h3>

          <p>
            منصة إلكترونية تهدف إلى تسهيل
            التواصل بين طلبة الكلية واتحادهم،
            ونشر المعلومات والأنشطة والخدمات
            الطلابية في مكان واحد.
          </p>

        </article>
      `;

    return;
  }


  /* =========================
     REGISTRATION
  ========================= */

  if (p === 'registration') {

    app.innerHTML =
      header(
        'تسجيل الطالب',
        'أدخل بياناتك لإرسال الطلب'
      ) +

      `
        <form class="card form" id="reg">

          <label>
            الاسم الكامل

            <input
              required
              name="name"
              placeholder="الاسم الثلاثي"
            >
          </label>


          <label>
            رقم القيد

            <input
              required
              name="id"
              placeholder="رقم القيد"
            >
          </label>


          <label>
            الفرقة / السنة

            <select name="year">

              <option>الأولى</option>
              <option>الثانية</option>
              <option>الثالثة</option>
              <option>الرابعة</option>

            </select>

          </label>


          <label>
            البريد الإلكتروني

            <input
              type="email"
              name="email"
              placeholder="example@university.edu.ly"
            >
          </label>


          <label>
            ملاحظات

            <textarea name="note"></textarea>
          </label>


          <button
            class="btn gold"
            type="submit"
          >
            إرسال طلب التسجيل
          </button>


          <div id="status"></div>

        </form>
      `;


    const form =
      document.querySelector('#reg');


    form.onsubmit = async function (event) {

      event.preventDefault();

      const status =
        document.querySelector('#status');

      status.textContent =
        'جارٍ إرسال الطلب...';


      const data =
        Object.fromEntries(
          new FormData(form)
        );


      try {

        const response =
          await fetch(
            `${API}?action=register`,
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json'
              },

              body: JSON.stringify(data)
            }
          );


        const result =
          await response.json();


        status.textContent =
          result.ok
            ? 'تم إرسال طلبك بنجاح.'
            : (
                result.message ||
                'تعذر إرسال الطلب.'
              );


        if (result.ok) {
          form.reset();
        }

      } catch (error) {

        status.textContent =
          'الخادم غير متصل حالياً. يمكنك المحاولة لاحقاً.';
      }
    };

    return;
  }
}


/* =========================
   DRAWER
========================= */

document
  .querySelectorAll(
    '.bottom [data-page], #drawer [data-page]'
  )
  .forEach(x => {

    x.onclick = () => {

      page(x.dataset.page);

      drawer(false);
    };
  });


document
  .querySelector('#menu')
  .onclick = () => drawer(true);


document
  .querySelector('#close')
  .onclick = () => drawer(false);


document
  .querySelector('#shade')
  .onclick = () => drawer(false);


function drawer(value) {

  document
    .querySelector('#drawer')
    .classList
    .toggle('open', value);


  document
    .querySelector('#shade')
    .classList
    .toggle('open', value);
}


/* =========================
   START APPLICATION
========================= */

(async function startApp() {

  const user =
    await loadCurrentUser();


  if (user) {
    page('home');
  } else {
    page('login');
  }

})();

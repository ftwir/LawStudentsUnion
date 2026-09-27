(function(){
const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const state={tab:'overview'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const jsonSafe=v=>{try{return JSON.stringify(v,null,2)}catch{return String(v)}};
async function api(path,opts={}){
  const h={Accept:'application/json'};
  if(opts.body!==undefined)h['Content-Type']='application/json';
  const r=await fetch(path,{credentials:'same-origin',...opts,headers:h});
  const d=await r.json().catch(()=>({ok:false,message:'استجابة غير صالحة.'}));
  if(!r.ok||d.ok===false)throw new Error(d.message||'فشل الطلب.');
  return d;
}
function setStatus(message,bad=false){
  const x=$('#globalStatus'); if(x){x.textContent=message||'';x.className='status '+(bad?'err':'ok');}
}
function loginView(){
  $('#loginView').hidden=false; $('#dashboardView').hidden=true;
  const form=$('#loginForm'); if(!form)return;
  form.onsubmit=async e=>{
    e.preventDefault();
    const b=form.querySelector('button'); if(b)b.disabled=true;
    setStatus('جارٍ التحقق...');
    try{
      const d=await api('/api/manager/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});
      $('#ownerName').textContent=d.user?.full_name||'المالك';
      form.reset(); dashboardView(); 
    }catch(err){setStatus(err.message,true)}
    finally{if(b)b.disabled=false}
  };
}
function dashboardView(){
  $('#loginView').hidden=true; $('#dashboardView').hidden=false;
  bindTabs();
  tab('overview');
}
function bindTabs(){
  $$('#tabs [data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
  $('#logout').onclick=async()=>{await api('/api/manager/logout',{method:'POST'}).catch(()=>{});location.reload()};
}
function panelLoading(title){const p=$('#panel');p.innerHTML='<div class="status">جارٍ تحميل '+esc(title||'البيانات')+'...</div>';return p}
function table(headers,rows){
  return '<div class="table-wrap"><table class="data-table"><thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
async function tab(name){
  state.tab=name; const p=panelLoading(name);
  try{
    if(name==='overview'){
      const d=await api('/api/manager/overview');
      const t=d.database?.tables||{};
      p.innerHTML='<div class="panel-title"><div><h2>النظرة العامة</h2><p>حالة المنظومة الموحّدة من قاعدة البيانات والواجهات.</p></div></div><div class="grid">'+Object.entries(t).map(([k,v])=>'<div class="card metric"><b>'+esc(v)+'</b><div>'+esc(k)+'</div></div>').join('')+'</div><div class="grid" style="margin-top:12px"><div class="card"><b>المساعد الذكي</b><div class="muted">'+(d.assistant?.enabled?'مفعّل':'غير مفعّل')+'</div></div><div class="card"><b>قاعدة البيانات</b><div class="muted">قراءة ناجحة عبر الـAPI الموحد</div></div></div>';
    }else if(name==='users'){
      const d=await api('/api/manager/users');
      p.innerHTML='<div class="panel-title"><div><h2>المستخدمون</h2><p>إدارة الحالة والدور مع حماية حساب المالك.</p></div></div>'+table(['العضو','الرقم الدراسي','الدور','الحالة','إجراء'],d.items.map(u=>[
        '<strong>'+esc(u.full_name)+'</strong><div class="muted">'+esc(u.email||'')+'</div>',
        esc(u.student_id||''),
        '<select data-role="'+u.id+'" '+(u.role==='owner'?'disabled':'')+'><option value="member" '+(u.role==='member'?'selected':'')+'>عضو</option><option value="admin" '+(u.role==='admin'?'selected':'')+'>مشرف</option></select>',
        '<span class="pill">'+(u.is_active?'فعال':'موقوف')+'</span>',
        u.role==='owner'?'<span class="muted">محمي</span>':'<button class="secondary" data-status="'+u.id+'" data-active="'+u.is_active+'">'+(u.is_active?'تعطيل':'تفعيل')+'</button>'
      ]) );
      $$('#panel [data-status]').forEach(b=>b.onclick=async()=>{try{await api('/api/manager/users/'+b.dataset.status+'/status',{method:'PATCH',body:JSON.stringify({is_active:b.dataset.active!=='true'})});tab('users')}catch(e){alert(e.message)}});
      $$('#panel [data-role]').forEach(sel=>sel.onchange=async()=>{try{await api('/api/manager/users/'+sel.dataset.role+'/role',{method:'PATCH',body:JSON.stringify({role:sel.value})});setStatus('تم تحديث الدور.')}catch(e){alert(e.message);tab('users')}});
    }else if(name==='registrations'){
      const d=await api('/api/manager/registrations');
      p.innerHTML='<div class="panel-title"><div><h2>طلبات العضوية</h2><p>مراجعة الطلبات مع مستوى التحقق الذكي.</p></div></div>'+(
        d.items.length?'<div class="list">'+d.items.map(r=>'<article class="card"><div class="row"><div class="row-main"><strong>#'+esc(r.id)+' · '+esc(r.full_name)+'</strong><small>'+esc(r.student_id)+' · خطر '+esc(r.risk_level||'low')+' · score '+esc(r.score||0)+'</small></div><div class="row-actions"><button class="primary" data-reg="'+r.id+'" data-status="approved">اعتماد</button><button class="danger" data-reg="'+r.id+'" data-status="rejected">رفض</button></div></div></article>').join('')+'</div>':'<div class="card">لا توجد طلبات معلقة.</div>');
      $$('#panel [data-reg]').forEach(b=>b.onclick=async()=>{try{await api('/api/manager/registrations/'+b.dataset.reg,{method:'PATCH',body:JSON.stringify({status:b.dataset.status})});tab('registrations')}catch(e){alert(e.message)}});
    }else if(name==='content'){
      const d=await api('/api/manager/content');
      p.innerHTML='<div class="panel-title"><div><h2>المحتوى</h2><p>إنشاء إعلان/نشاط وتثبيت المنشورات.</p></div></div><div class="card"><form id="contentForm" class="form-grid"><label>النوع<select name="type"><option value="announcement">إعلان</option><option value="activity">نشاط</option></select></label><label>العنوان<input name="title" required maxlength="255"></label><label class="full">النص<textarea name="body" required maxlength="10000"></textarea></label><label>الوسم<input name="tag" maxlength="50"></label><label>التاريخ<input name="event_date" type="datetime-local"></label><label>الموقع<input name="location" maxlength="255"></label><div class="full"><button class="primary">نشر</button></div></form></div><div style="height:12px"></div>'+table(['المنشور','النوع','الحالة','إجراء'],(d.items||[]).map(x=>['<strong>#'+esc(x.id)+' '+esc(x.title||'')+'</strong><div class="muted">'+esc(x.full_name||x.body||'').slice(0,160)+'</div>',esc(x.content_type||'post'),x.is_pinned?'<span class="pill">مثبّت</span>':'<span class="muted">عادي</span>','<button class="secondary" data-pin="'+x.id+'" data-pinned="'+x.is_pinned+'">'+(x.is_pinned?'إلغاء التثبيت':'تثبيت')+'</button>'])); 
      $('#contentForm').onsubmit=async e=>{e.preventDefault();try{const f=Object.fromEntries(new FormData(e.currentTarget));if(!f.event_date)delete f.event_date;await api('/api/manager/content',{method:'POST',body:JSON.stringify(f)});e.currentTarget.reset();setStatus('تم نشر المحتوى.');}catch(e){alert(e.message)}};
      $$('#panel [data-pin]').forEach(b=>b.onclick=async()=>{try{await api('/api/manager/posts/'+b.dataset.pin+'/pin',{method:'PATCH',body:JSON.stringify({pinned:b.dataset.pinned!=='true'})});tab('content')}catch(e){alert(e.message)}});
    }else if(name==='activity'){
      const d=await api('/api/manager/activity');
      p.innerHTML='<div class="panel-title"><div><h2>النشاط</h2><p>آخر حركة معروفة للأعضاء.</p></div></div><div class="activity-feed">'+(d.items||[]).map(x=>'<article class="activity"><b>'+esc(x.full_name)+'</b><div class="muted">'+esc(x.current_page||'')+'</div><small>'+esc(x.last_activity_at||'')+'</small></article>').join('')+'</div>';
    }else if(name==='chats'){
      const d=await api('/api/manager/chats');
      p.innerHTML='<div class="panel-title"><div><h2>غرف الدردشة</h2><p>مراقبة الغرف وإيقاف الإرسال مؤقتاً عند الحاجة.</p></div></div><div class="list">'+(d.items||[]).map(c=>'<div class="row"><div class="row-main"><strong>'+esc(c.name||'غرفة')+'</strong><small>'+esc(c.type||'')+' · '+(c.is_private?'خاصة':'عامة')+'</small></div><div class="row-actions"><button class="secondary" data-chat="'+c.id+'" data-paused="'+c.messaging_paused+'">'+(c.messaging_paused?'استئناف':'إيقاف الإرسال')+'</button></div></div>').join('')+'</div>';
      $$('#panel [data-chat]').forEach(b=>b.onclick=async()=>{try{await api('/api/manager/chats/'+b.dataset.chat,{method:'PATCH',body:JSON.stringify({messaging_paused:b.dataset.paused!=='true'})});tab('chats')}catch(e){alert(e.message)}});
    }else if(name==='database'){
      p.innerHTML='<div class="panel-title"><div><h2>قاعدة البيانات</h2><p>قراءة الجداول الحساسة عبر جلسة المالك.</p></div></div><div class="actions" id="dbButtons">'+['users','registrations','posts','post_likes','post_comments','conversations','conversation_members','messages','audit_logs','activity_events','agent_actions','app_settings'].map(t=>'<button class="secondary" data-db="'+t+'">'+t+'</button>').join('')+'</div><pre id="dbOut" class="code-box" style="margin-top:12px"></pre>';
      $$('#panel [data-db]').forEach(b=>b.onclick=async()=>{try{const d=await api('/api/manager/database/'+b.dataset.db);$('#dbOut').textContent=jsonSafe(d.rows||[])}catch(e){$('#dbOut').textContent=e.message}});
    }else if(name==='audit'){
      const d=await api('/api/manager/overview');
      const items=d.audit?.items||d.audit?.rows||[];
      p.innerHTML='<div class="panel-title"><div><h2>السجل</h2><p>الأحداث الإدارية الموثقة.</p></div></div>'+table(['الفاعل','الإجراء','الهدف','التفاصيل','التاريخ'],items.slice(0,150).map(x=>[esc(x.full_name||''),esc(x.action||''),esc((x.target_type||'')+' '+(x.target_id||'')),esc(jsonSafe(x.details)),esc(x.created_at||'')])); 
    }else if(name==='settings'){
      const d=await api('/api/manager/settings'); const items=d.items||[];
      p.innerHTML='<div class="panel-title"><div><h2>الإعدادات</h2><p>تعديل إعدادات المنظومة بصيغة JSON.</p></div></div><div class="list">'+items.map(x=>'<article class="card"><label><strong>'+esc(x.key)+'</strong><textarea data-setting="'+esc(x.key)+'" class="code-box">'+esc(jsonSafe(x.value))+'</textarea></label></article>').join('')+'</div><div style="margin-top:12px"><button id="saveSettings" class="primary">حفظ الإعدادات</button></div>';
      $('#saveSettings').onclick=async()=>{const payload={};let bad=null;$$('#panel [data-setting]').forEach(t=>{try{payload[t.dataset.setting]=JSON.parse(t.value)}catch{bad=t.dataset.setting}});if(bad)return alert('JSON غير صالح في: '+bad);try{await api('/api/manager/settings',{method:'PATCH',body:JSON.stringify(payload)});setStatus('تم حفظ الإعدادات.')}catch(e){alert(e.message)}};
    }else if(name==='ai'){
      p.innerHTML='<div class="panel-title"><div><h2>الذكاء والإصلاح</h2><p>يقرأ الملف الحالي ويجهز إصلاحاً في فرع وPR مراقب.</p></div></div><form id="aiForm" class="form-grid"><label>مسار الملف<input name="filePath" value="public/assets/app.js" required></label><label>الخطأ<input name="error" placeholder="JavaScript error..."></label><label class="full">التعليمات<textarea name="instruction" placeholder="صف السلوك المطلوب والقيود..."></textarea></label><div class="full"><button class="primary">تحليل وتجهيز الإصلاح</button></div></form><pre id="aiOut" class="code-box"></pre>';
      $('#aiForm').onsubmit=async e=>{e.preventDefault();const out=$('#aiOut');out.textContent='جارٍ التحليل...';try{const d=await api('/api/manager/ai/repair',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});out.textContent=jsonSafe({diagnosis:d.analysis?.diagnosis,root_cause:d.analysis?.root_cause,tests:d.analysis?.tests,staged:d.staged});}catch(err){out.textContent=err.message}};
    }
  }catch(e){p.innerHTML='<div class="status err">'+esc(e.message)+'</div>'}
}
api('/api/manager/me').then(async d=>{try{const o=await api('/api/manager/overview');$('#ownerName').textContent=o.status?.owner?.name||'المالك'}catch{} dashboardView()}).catch(loginView);
})();
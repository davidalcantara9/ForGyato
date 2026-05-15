// ── ESTADO ────────────────────────────────────────────────────
const USERS_KEY = 'forgyato_users';
const LEGACY_USERS_KEY = 'secagem_users';
const SESSION_KEY = 'forgyato_session';
const LEGACY_SESSION_KEY = 'secagem_session';
const ADMIN_EMAIL = 'davidalcantara9@hotmail.com';
const ADMIN_PASS = 'admin123';
const ACCESS_DAYS = 365;
const SUPABASE_URL = 'https://ugqczgsgltdheqdkbamn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_z5cLoSf3hLyRAeewDKQ6YQ_IBuf_JlA';
let currentUser = null;
function defaultState(){
  return { start:null, initW:currentUser?.initW||null, weights:{}, checks:{}, water:{}, meals:{}, alts:[] };
}
let S = defaultState();
let KEY = null;
let photoB64 = null;
let wChart = null;
let supabaseDb = null;

// ── INIT ──────────────────────────────────────────────────────
window.onload = async () => {
  initTheme();
  initNavigation();
  await initAuth();
};

// ── LOGIN ─────────────────────────────────────────────────────
function getUsers(){
  try{
    const users = localStorage.getItem(USERS_KEY);
    if(users) return JSON.parse(users)||{};
    const legacyUsers = localStorage.getItem(LEGACY_USERS_KEY);
    if(legacyUsers){
      localStorage.setItem(USERS_KEY, legacyUsers);
      return JSON.parse(legacyUsers)||{};
    }
    return {};
  }catch(e){ return {}; }
}
function saveUsers(users){ localStorage.setItem(USERS_KEY, JSON.stringify(users)); }
function normEmail(v){ return v.trim().toLowerCase(); }
function userId(email){ return btoa(email).replace(/=+$/,'').replace(/\W/g,''); }
function userDataKey(){ return 'forgyato_data_'+currentUser.id; }
function legacyUserDataKey(){ return 'secabem_data_'+currentUser.id; }
function userApiKey(){ return '_dk_'+currentUser.id; }
function supabaseReady(){
  return SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 20 && window.supabase;
}
function db(){
  if(!supabaseDb) supabaseDb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabaseDb;
}
async function getSetting(key){
  if(!supabaseReady()) return localStorage.getItem('forgyato_setting_'+key);
  const { data, error } = await db().from('app_settings').select('value').eq('key', key).maybeSingle();
  if(error) throw error;
  return data?.value || '';
}
async function setSetting(key,value){
  if(!supabaseReady()){ localStorage.setItem('forgyato_setting_'+key,value); return; }
  const { error } = await db().from('app_settings').upsert({key,value,updated_at:new Date().toISOString()});
  if(error) throw error;
}
function profileFromRow(row){
  return {
    id:row.id,
    name:row.name,
    email:row.email || '',
    pass:'',
    initW:Number(row.initial_weight),
    height:Number(row.height),
    createdAt:row.created_at,
    expiresAt:row.expires_at,
    blocked:row.blocked,
    role:row.role || 'user',
    goal:row.goal || 'perder',
    goalDays:Number(row.goal_days || 30),
    strategy:row.strategy || 'moderado',
    aiCredits:Number(row.ai_credits ?? 50),
    planText:row.plan_text || ''
  };
}
async function hashPass(pass){
  const data = new TextEncoder().encode('forgyato:'+pass);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function addDays(date, days){
  const d = new Date(date);
  d.setDate(d.getDate()+days);
  return d.toISOString();
}
function fmtDate(v){
  if(!v) return '-';
  return new Date(v).toLocaleDateString('pt-BR');
}
function esc(v){
  return String(v ?? '').replace(/[&<>"']/g, ch=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[ch]));
}
function daysLeft(user){
  const diff = new Date(user.expiresAt)-new Date();
  return Math.ceil(diff/86400000);
}
function isExpired(user){ return daysLeft(user) < 0; }
function goalLabel(goal){ return goal === 'ganhar' ? 'Ganhar massa' : 'Perder peso'; }
function strategyLabel(strategy){
  return {tranquilo:'Tranquilo',moderado:'Moderado',pesado:'Pesado'}[strategy] || 'Moderado';
}
function buildActionPlan(user){
  const goal = user.goal || 'perder';
  const days = Number(user.goalDays || user.goal_days || 30);
  const strategy = user.strategy || 'moderado';
  const objetivo = goalLabel(goal).toLowerCase();
  const ritmo = strategyLabel(strategy).toLowerCase();
  if(goal === 'perder' && strategy === 'pesado'){
    const first = days > 7 ? 'Primeiros 7 dias: 1 refeição forte por dia, alta em proteína, vegetais e água alta; zero açúcar, farinha e álcool.' : 'Durante todo o ciclo: 1 refeição forte por dia, alta em proteína, vegetais e água alta; zero açúcar, farinha e álcool.';
    const rest = days > 7 ? `Dias 8 a ${days}: manter déficit agressivo com 1 a 2 refeições controladas, proteína em todas as refeições, caminhada/treino frequente e flexibilidade mínima.` : '';
    return `Objetivo: perder peso em ${days} dias.\nEstratégia: pesado.\n${first}\n${rest}\nFoco diário: bater proteína, controlar fome, dormir bem, registrar peso e usar a IA para validar refeições importantes.`;
  }
  const base = goal === 'ganhar'
    ? 'Priorize superávit calórico controlado, proteína alta, treino progressivo e carboidratos ao redor do treino.'
    : 'Priorize déficit calórico, proteína alta, vegetais, hidratação e constância no registro de peso.';
  const level = {
    tranquilo:'Ritmo balanceado, com ajustes leves e alta sustentabilidade.',
    moderado:'Ritmo firme, com controle consistente e espaço pequeno para flexibilidade.',
    pesado:'Ritmo acelerado, com regras mais rígidas e revisões frequentes para manter segurança.'
  }[strategy];
  return `Objetivo: ${objetivo} em ${days} dias.\nEstratégia: ${ritmo}.\n${base}\n${level}\nFoco diário: cumprir o checklist, registrar refeições, acompanhar evolução e ajustar com base no resultado real.`;
}
async function generateActionPlan(user){
  try{
    if(!KEY) await loadKey();
    if(!KEY) return buildActionPlan(user);
    const resp = await ai([
      {role:'system',content:'Você cria planos fitness objetivos, práticos e seguros em português.'},
      {role:'user',content:`Crie um plano de ação para ${goalLabel(user.goal)} em ${user.goalDays} dias com estratégia ${strategyLabel(user.strategy)}. Peso inicial ${user.initW}kg, altura ${user.height}m. Se for perda de peso pesada e prazo maior que 7 dias, use 1 refeição por dia nos primeiros 7 dias e depois uma fase ainda hard, porém um pouco mais flexível. Responda em até 8 linhas, direto e acionável.`}
    ]);
    return resp;
  }catch(e){
    return buildActionPlan(user);
  }
}
function initTheme(){
  const theme = localStorage.getItem('forgyato_theme') || 'auto';
  setTheme(theme, false);
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', ()=>{
    if((localStorage.getItem('forgyato_theme') || 'auto') === 'auto') setTheme('auto', false);
  });
}
function setTheme(theme, persist=true){
  const resolved = theme === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
  document.body.dataset.theme = resolved;
  document.querySelectorAll('.theme-select').forEach(sel=>sel.value=theme);
  if(persist) localStorage.setItem('forgyato_theme', theme);
}
function initNavigation(){
  document.querySelectorAll('.side-menu a,.mobile-nav a').forEach(link=>{
    link.addEventListener('click', ()=>{
      const menu = link.closest('.side-menu,.mobile-nav');
      if(!menu) return;
      menu.querySelectorAll('a').forEach(item=>item.classList.remove('active'));
      link.classList.add('active');
    });
  });
}
function normalizeUser(user){
  if(!user.createdAt) user.createdAt = new Date().toISOString();
  if(!user.expiresAt) user.expiresAt = addDays(user.createdAt, ACCESS_DAYS);
  if(typeof user.blocked !== 'boolean') user.blocked = false;
  if(!user.goal) user.goal = 'perder';
  if(!user.goalDays) user.goalDays = 30;
  if(!user.strategy) user.strategy = 'moderado';
  if(typeof user.aiCredits !== 'number') user.aiCredits = 50;
  if(!user.planText) user.planText = buildActionPlan(user);
  return user;
}
function normalizeUsers(users){
  let changed = false;
  Object.keys(users).forEach(email=>{
    const before = JSON.stringify(users[email]);
    users[email] = normalizeUser(users[email]);
    if(JSON.stringify(users[email]) !== before) changed = true;
  });
  if(changed) saveUsers(users);
  return users;
}
function showAuth(mode){
  const login = mode === 'login';
  document.getElementById('loginForm').classList.toggle('show', login);
  document.getElementById('registerForm').classList.toggle('show', !login);
  document.getElementById('loginTab').classList.toggle('on', login);
  document.getElementById('registerTab').classList.toggle('on', !login);
}
async function initAuth(){
  if(supabaseReady()){
    await initCloudAuth();
    return;
  }
  const users = normalizeUsers(getUsers());
  const session = localStorage.getItem(SESSION_KEY) || localStorage.getItem(LEGACY_SESSION_KEY);
  if(session && !localStorage.getItem(SESSION_KEY)) localStorage.setItem(SESSION_KEY, session);
  if(session === 'admin'){
    startAdmin();
    return;
  }
  if(session && users[session] && !users[session].blocked && !isExpired(users[session])){
    currentUser = users[session];
    startApp();
    return;
  }
  if(session){
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_SESSION_KEY);
  }
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('adminShell').classList.add('hidden');
  document.getElementById('appShell').classList.add('hidden');
}
async function initCloudAuth(){
  try{
    const session = localStorage.getItem(SESSION_KEY);
    if(session){
      const { data:profile, error } = await db().from('app_users').select('*').eq('email', session).maybeSingle();
      if(error) throw error;
      if(profile){
        await loadCloudUser(profile);
        return;
      }
      localStorage.removeItem(SESSION_KEY);
      return;
    }
  }catch(e){
    toast('Erro ao conectar ao Supabase: '+e.message,'err');
  }
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('adminShell').classList.add('hidden');
  document.getElementById('appShell').classList.add('hidden');
}
async function loadCloudUser(profile){
  currentUser = profileFromRow(profile);
  if(currentUser.role === 'admin'){
    startAdmin();
    return;
  }
  if(currentUser.blocked){
    toast('Este cadastro está bloqueado','err');
    initAuth();
    return;
  }
  if(isExpired(currentUser)){
    toast('Este cadastro expirou','err');
    initAuth();
    return;
  }
  startApp();
}
async function registerUser(){
  const name = document.getElementById('regName').value.trim();
  const email = normEmail(document.getElementById('regEmail').value);
  const pass = document.getElementById('regPass').value;
  const initW = parseFloat(document.getElementById('regWeight').value);
  const height = parseFloat(document.getElementById('regHeight').value);
  const goal = document.getElementById('regGoal').value;
  const goalDays = parseInt(document.getElementById('regGoalDays').value,10);
  const strategy = document.getElementById('regStrategy').value;
  if(!name){ toast('Preencha seu nome','err'); return; }
  if(!email || !email.includes('@')){ toast('Informe um email válido','err'); return; }
  if(pass.length < 6){ toast('A senha precisa ter pelo menos 6 caracteres','err'); return; }
  if(isNaN(initW)||initW<30||initW>300){ toast('Informe um peso inicial válido','err'); return; }
  if(isNaN(height)||height<1||height>2.5){ toast('Informe uma altura válida','err'); return; }
  if(isNaN(goalDays)||goalDays<7||goalDays>365){ toast('Informe um prazo entre 7 e 365 dias','err'); return; }
  const planText = await generateActionPlan({goal, goalDays, strategy, initW, height});
  if(supabaseReady()){
    try{
      const exists = await db().from('app_users').select('id').eq('email', email).maybeSingle();
      if(exists.error) throw exists.error;
      if(exists.data){ toast('Este email já tem conta','err'); return; }
      const createdAt = new Date().toISOString();
      const { data:user, error } = await db().from('app_users').insert({
        name,
        email,
        password_hash:await hashPass(pass),
        initial_weight:initW,
        height,
        created_at:createdAt,
        expires_at:addDays(createdAt, email === ADMIN_EMAIL ? 3650 : ACCESS_DAYS),
        blocked:false,
        role:email === ADMIN_EMAIL ? 'admin' : 'user',
        goal,
        goal_days:goalDays,
        strategy,
        ai_credits:50,
        plan_text:planText
      }).select('*').single();
      if(error) throw error;
      localStorage.setItem(SESSION_KEY, email);
      currentUser = profileFromRow(user);
      toast('Conta criada! Entrando...','ok');
      setTimeout(()=>location.reload(),500);
      return;
    }catch(e){
      toast('Erro no cadastro: '+e.message,'err');
      return;
    }
  }
  const users = normalizeUsers(getUsers());
  if(users[email]){ toast('Este email já tem conta','err'); return; }
  const id = userId(email);
  const firstUser = Object.keys(users).length === 0;
  const createdAt = new Date().toISOString();
  users[email] = { id, name, email, pass:btoa(pass), initW, height, createdAt, expiresAt:addDays(createdAt, ACCESS_DAYS), blocked:false, role:email === ADMIN_EMAIL ? 'admin' : 'user', goal, goalDays, strategy, aiCredits:50, planText };
  saveUsers(users);
  if(firstUser && localStorage.getItem('forgyato_data') && !localStorage.getItem('forgyato_data_'+id)){
    localStorage.setItem('forgyato_data_'+id, localStorage.getItem('forgyato_data'));
  }
  if(firstUser && localStorage.getItem('secabem_data') && !localStorage.getItem('forgyato_data_'+id)){
    localStorage.setItem('forgyato_data_'+id, localStorage.getItem('secabem_data'));
  }
  if(firstUser && localStorage.getItem('_dk') && !localStorage.getItem('_dk_'+id)){
    localStorage.setItem('_dk_'+id, localStorage.getItem('_dk'));
  }
  localStorage.setItem(SESSION_KEY, email);
  toast('Conta criada! Entrando...','ok');
  setTimeout(()=>location.reload(),500);
}
async function loginUser(){
  const email = normEmail(document.getElementById('loginEmail').value);
  const pass = document.getElementById('loginPass').value;
  if(!email || !email.includes('@')){ toast('Informe seu email','err'); return; }
  if(supabaseReady()){
    try{
      const { data:user, error } = await db().from('app_users').select('*').eq('email', email).maybeSingle();
      if(error) throw error;
      if(!user || user.password_hash !== await hashPass(pass)){ toast('Email ou senha inválidos','err'); return; }
      if(user.blocked){ toast('Este cadastro está bloqueado','err'); return; }
      const profile = profileFromRow(user);
      if(isExpired(profile)){ toast('Este cadastro expirou','err'); return; }
      localStorage.setItem(SESSION_KEY, email);
      await loadCloudUser(user);
      return;
    }catch(e){
      toast('Email ou senha inválidos','err');
      return;
    }
  }
  if(email === ADMIN_EMAIL && pass === ADMIN_PASS){
    localStorage.setItem(SESSION_KEY, 'admin');
    startAdmin();
    return;
  }
  const users = normalizeUsers(getUsers());
  if(!users[email] || users[email].pass !== btoa(pass)){ toast('Email ou senha inválidos','err'); return; }
  if(users[email].blocked){ toast('Este cadastro está bloqueado','err'); return; }
  if(isExpired(users[email])){ toast('Este cadastro expirou','err'); return; }
  localStorage.setItem(SESSION_KEY, email);
  location.reload();
}
async function logout(){
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LEGACY_SESSION_KEY);
  location.reload();
}
function startAdmin(){
  currentUser = null;
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('adminShell').classList.remove('hidden');
  loadKey();
  renderAdminUsers();
}
function userStatus(user){
  if(user.blocked) return {label:'Bloqueado', cls:'blocked'};
  if(isExpired(user)) return {label:'Expirado', cls:'expired'};
  return {label:'Ativo', cls:'ok'};
}
function icon(name){
  const icons={
    save:'<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>',
    lock:'<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    unlock:'<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.2-2.8"/></svg>',
    trash:'<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>'
  };
  return icons[name] || '';
}
async function renderAdminUsers(){
  if(supabaseReady()){
    const { data:rows, error } = await db().from('app_users').select('*').order('created_at', { ascending:false });
    if(error){ toast('Erro ao carregar cadastros: '+error.message,'err'); return; }
    renderAdminRows((rows || []).map(profileFromRow));
    return;
  }
  const users = normalizeUsers(getUsers());
  const rows = Object.values(users).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  renderAdminRows(rows);
}
function renderAdminRows(rows){
  const el = document.getElementById('adminUsers');
  const active = rows.filter(u=>!u.blocked && !isExpired(u)).length;
  const userRows = rows.filter(u=>u.role !== 'admin');
  const totalCredits = userRows.reduce((sum,u)=>sum+(Number(u.aiCredits)||0),0);
  const totalLimit = userRows.length * 50;
  const usedCredits = Math.max(totalLimit-totalCredits,0);
  document.getElementById('adminUsersTotal').textContent=userRows.length;
  document.getElementById('adminAiUsed').textContent=usedCredits;
  document.getElementById('adminAiLeft').textContent=totalCredits;
  document.getElementById('adminAiTotal').textContent=totalLimit;
  document.getElementById('adminSummary').textContent=`${rows.length} cadastro(s), ${active} ativo(s). Cada cadastro tem ${ACCESS_DAYS} dias de uso.`;
  if(!rows.length){
    el.innerHTML='<tr><td colspan="6" data-label="Cadastros" style="color:var(--m)">Nenhum usuário cadastrado.</td></tr>';
    return;
  }
  el.innerHTML=rows.map(user=>{
    const status = userStatus(user);
    const left = daysLeft(user);
    const leftText = left >= 0 ? `${left} dia(s) restantes` : 'prazo encerrado';
    return `<tr>
      <td data-label="Usuário">${esc(user.name)}</td>
      <td data-label="Email">${esc(user.email)}</td>
      <td data-label="Objetivo">${goalLabel(user.goal)}<br><span style="color:var(--m);font-size:.74rem">${user.goalDays} dias · ${strategyLabel(user.strategy)}</span></td>
      <td data-label="IA"><div class="credit-control"><input type="number" min="0" step="1" id="credits_${user.id}" value="${user.aiCredits}"><button class="icon-btn" title="Salvar consultas" aria-label="Salvar consultas" onclick="saveUserCredits('${encodeURIComponent(user.email)}','${user.id}')">${icon('save')}</button></div></td>
      <td data-label="Criado em">${fmtDate(user.createdAt)}</td>
      <td data-label="Expira em">${fmtDate(user.expiresAt)}<br><span style="color:var(--m);font-size:.74rem">${leftText}</span></td>
      <td data-label="Status"><span class="status-pill ${status.cls}">${status.label}</span></td>
      <td data-label="Ações"><div class="admin-actions">
        <button class="icon-btn" title="${user.blocked?'Desbloquear':'Bloquear'}" aria-label="${user.blocked?'Desbloquear':'Bloquear'}" onclick="toggleBlockUser('${encodeURIComponent(user.email)}')">${icon(user.blocked?'unlock':'lock')}</button>
        <button class="icon-btn danger" title="Excluir" aria-label="Excluir" onclick="deleteUser('${encodeURIComponent(user.email)}')">${icon('trash')}</button>
      </div></td>
    </tr>`;
  }).join('');
}
async function saveUserCredits(email,id){
  email = decodeURIComponent(email);
  const input=document.getElementById('credits_'+id);
  const credits=parseInt(input?.value,10);
  if(isNaN(credits)||credits<0){ toast('Informe um número válido de consultas','err'); return; }
  if(supabaseReady()){
    const { error } = await db().from('app_users').update({ai_credits:credits}).eq('email', email);
    if(error){ toast('Erro ao salvar consultas: '+error.message,'err'); return; }
  }else{
    const users=getUsers();
    if(users[email]){ users[email].aiCredits=credits; saveUsers(users); }
  }
  await renderAdminUsers();
  toast('Consultas atualizadas','ok');
}
async function toggleBlockUser(email){
  email = decodeURIComponent(email);
  if(supabaseReady()){
    const { data:user, error:fetchError } = await db().from('app_users').select('blocked').eq('email', email).single();
    if(fetchError){ toast('Cadastro não encontrado','err'); return; }
    const { error } = await db().from('app_users').update({ blocked:!user.blocked }).eq('email', email);
    if(error){ toast('Erro ao atualizar cadastro: '+error.message,'err'); return; }
    await renderAdminUsers();
    toast(!user.blocked?'Cadastro bloqueado':'Cadastro desbloqueado','ok');
    return;
  }
  const users = normalizeUsers(getUsers());
  if(!users[email]) return;
  users[email].blocked = !users[email].blocked;
  saveUsers(users);
  if(localStorage.getItem(SESSION_KEY) === email) localStorage.removeItem(SESSION_KEY);
  renderAdminUsers();
  toast(users[email].blocked?'Cadastro bloqueado':'Cadastro desbloqueado','ok');
}
async function deleteUser(email){
  email = decodeURIComponent(email);
  if(supabaseReady()){
    if(!confirm(`Excluir o cadastro de ${email}?`)) return;
    const { error } = await db().from('app_users').delete().eq('email', email);
    if(error){ toast('Erro ao excluir cadastro: '+error.message,'err'); return; }
    await renderAdminUsers();
    toast('Cadastro excluído','ok');
    return;
  }
  const users = normalizeUsers(getUsers());
  const user = users[email];
  if(!user) return;
  if(!confirm(`Excluir definitivamente o cadastro de ${user.name}?`)) return;
  localStorage.removeItem('forgyato_data_'+user.id);
  localStorage.removeItem('secabem_data_'+user.id);
  localStorage.removeItem('_dk_'+user.id);
  if(localStorage.getItem(SESSION_KEY) === email) localStorage.removeItem(SESSION_KEY);
  delete users[email];
  saveUsers(users);
  renderAdminUsers();
  toast('Cadastro excluído','ok');
}
function startApp(){
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.getElementById('userNameTitle').textContent=currentUser.name;
  document.getElementById('userPill').textContent=currentUser.name;
  const profileParts = [];
  if(currentUser.initW) profileParts.push(`${currentUser.initW} kg`);
  if(currentUser.height) profileParts.push(`${currentUser.height.toLocaleString('pt-BR')} m`);
  profileParts.push(`${goalLabel(currentUser.goal)} · ${currentUser.goalDays} dias · ${strategyLabel(currentUser.strategy)}`);
  document.getElementById('profileLine').textContent=profileParts.join(' · ');
  document.getElementById('coachProfileLine').textContent=`O coach usa os dados do perfil cadastrado e o protocolo atual. Pode perguntar sobre fome, treino, motivação, alimentos...`;
  document.getElementById('actionPlan').textContent=currentUser.planText || buildActionPlan(currentUser);
  S = defaultState();
  loadS(); buildCal(); buildCopos(); renderAlts(); renderLog(); updateStats(); initChart(); loadKey();
}

// ── PERSISTÊNCIA ──────────────────────────────────────────────
function saveS(){ localStorage.setItem(userDataKey(), JSON.stringify(S)); }
function loadS(){
  let r = localStorage.getItem(userDataKey());
  if(!r && localStorage.getItem(legacyUserDataKey())){
    r = localStorage.getItem(legacyUserDataKey());
    localStorage.setItem(userDataKey(), r);
  }
  if(r){ try{ S = {...S,...JSON.parse(r)}; }catch(e){} }
  S.initW = S.initW || currentUser.initW;
  if(!S.start){ S.start = tod(); saveS(); }
  const t = tod();
  if(S.checks[t]){
    document.querySelectorAll('#checks li').forEach(li=>{
      const k = li.getAttribute('onclick').match(/'(\w+)'/)[1];
      if(S.checks[t][k]) li.classList.add('done');
    });
    updCC();
  }
  setTimeout(()=>{
    const w = S.water[t]||0;
    for(let i=0;i<w;i++){ const g=document.getElementById('g'+i); if(g) g.classList.add('on'); }
    updWater(w);
  },100);
}
function salvar(){ saveS(); toast('✅ Progresso salvo!','ok'); }
function exportar(){
  const b = new Blob([JSON.stringify({user:{name:currentUser.name,email:currentUser.email},data:S},null,2)],{type:'application/json'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(b);
  a.download='forgyato_'+currentUser.name.toLowerCase().replace(/\s+/g,'_')+'.json'; a.click(); toast('📤 Exportado!','ok');
}
function resetar(){
  if(!confirm('Zerar tudo? Essa ação é irreversível.')) return;
  localStorage.removeItem(userDataKey()); location.reload();
}

// ── API KEY ───────────────────────────────────────────────────
async function saveKey(){
  const v = document.getElementById('apiKey').value.trim();
  if(!v.startsWith('sk-')){ toast('Chave inválida — deve começar com sk-','err'); return; }
  try{
    KEY = v;
    await setSetting('openai_api_key', btoa(v));
    setApiStatus('Token salvo. Teste para confirmar funcionamento.', '');
    toast('Token de IA salvo','ok');
  }catch(e){ toast('Erro ao salvar token: '+e.message,'err'); }
}
async function loadKey(){
  try{
    const k = await getSetting('openai_api_key');
    if(k){
      KEY=atob(k);
      const input=document.getElementById('apiKey');
      if(input) input.value=KEY;
      const badge=document.getElementById('badge');
      if(badge){ badge.textContent='✅ IA ativa'; badge.classList.add('on'); }
      setApiStatus('Token configurado', 'ok');
    }
  }catch(e){}
}
function setApiStatus(text,type=''){
  const el=document.getElementById('apiStatus');
  if(!el) return;
  el.textContent='Status: '+text;
  el.className='api-status '+type;
}
async function testAiKey(){
  const input=document.getElementById('apiKey');
  const key=(input?.value||KEY||'').trim();
  if(!key.startsWith('sk-')){ setApiStatus('token inválido','err'); toast('Chave inválida','err'); return; }
  setApiStatus('testando...');
  try{
    const r=await fetch('https://api.openai.com/v1/models',{
      headers:{'Authorization':'Bearer '+key}
    });
    if(!r.ok) throw new Error('falha na autenticação');
    KEY=key;
    await setSetting('openai_api_key', btoa(key));
    setApiStatus('funcionando','ok');
    toast('Token funcionando','ok');
  }catch(e){
    setApiStatus('não está funcionando','err');
    toast('Token não funcionou','err');
  }
}

// ── UTILITÁRIOS ───────────────────────────────────────────────
function tod(){ return new Date().toISOString().split('T')[0]; }
function curDay(){
  if(!S.start) return 1;
  const d = Math.floor((new Date()-new Date(S.start))/86400000)+1;
  const total = currentUser?.goalDays || 30;
  return Math.min(Math.max(d,1),total);
}
function dayDate(n){
  const d = new Date(S.start); d.setDate(d.getDate()+n-1);
  return d.toISOString().split('T')[0];
}
function toast(m,t=''){
  const el=document.getElementById('toast'); el.textContent=m; el.className='toast show '+t;
  setTimeout(()=>el.className='toast',3500);
}
function setBtn(id,loading,orig){
  const b=document.getElementById(id); b.disabled=loading;
  b.innerHTML=loading?'<span class="sp"></span>Aguarde...':orig;
}

// ── IA ────────────────────────────────────────────────────────
async function ai(messages, model='gpt-4o'){
  if(!KEY) await loadKey();
  if(!KEY){ toast('Ative a IA com sua chave OpenAI 🔑','err'); throw new Error('no key'); }
  const r = await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+KEY},
    body:JSON.stringify({model, messages, max_tokens:700})
  });
  if(!r.ok){ const e=await r.json(); throw new Error(e.error?.message||'Erro na API'); }
  const j=await r.json(); return j.choices[0].message.content;
}
async function aiVision(messages){
  if(!KEY) await loadKey();
  if(!KEY){ toast('Ative a IA com sua chave OpenAI 🔑','err'); throw new Error('no key'); }
  const r = await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+KEY},
    body:JSON.stringify({model:'gpt-4o', messages, max_tokens:700})
  });
  if(!r.ok){ const e=await r.json(); throw new Error(e.error?.message||'Erro na API'); }
  const j=await r.json(); return j.choices[0].message.content;
}
async function useAiCredit(){
  if((currentUser?.aiCredits ?? 0) <= 0){ toast('Você não tem mais consultas de IA disponíveis','err'); return false; }
  currentUser.aiCredits -= 1;
  if(supabaseReady()){
    await db().from('app_users').update({ai_credits:currentUser.aiCredits}).eq('email', currentUser.email);
  }else{
    const users = getUsers();
    if(users[currentUser.email]){
      users[currentUser.email].aiCredits = currentUser.aiCredits;
      saveUsers(users);
    }
  }
  updateStats();
  return true;
}

function sysPrompt(){
  const nome = currentUser?.name || 'usuário';
  const peso = currentUser?.initW || S.initW;
  const altura = currentUser?.height;
  const perfil = [
    peso ? `${peso}kg` : null,
    altura ? `${altura}m` : null,
    currentUser?.goal ? `objetivo: ${goalLabel(currentUser.goal)}` : null,
    currentUser?.goalDays ? `prazo: ${currentUser.goalDays} dias` : null,
    currentUser?.strategy ? `estratégia: ${strategyLabel(currentUser.strategy)}` : null
  ].filter(Boolean).join(', ') || 'dados físicos não informados';
  return `Você é coach fitness de ${nome}. Perfil: ${perfil}. Ajuste as recomendações ao objetivo, prazo e estratégia escolhidos. Seja direto, prático e motivador. Responda sempre em português, máximo 5 parágrafos curtos.`;
}

// ── CALENDÁRIO ────────────────────────────────────────────────
function buildCal(){
  const g=document.getElementById('cal'); g.innerHTML='';
  const cd=curDay();
  const total=currentUser?.goalDays||30;
  for(let d=1;d<=total;d++){
    const el=document.createElement('div'); el.className='dc';
    const ch=S.checks[dayDate(d)]||{};
    const cnt=Object.values(ch).filter(Boolean).length;
    if(cnt>=6) el.classList.add('ok');
    else if(cnt>=3) el.classList.add('par');
    if(d===cd) el.classList.add('td');
    if(d>cd) el.classList.add('fut');
    el.innerHTML=`<span>${d}</span><span class="sub">${d<=7?'🔥':'💪'}</span>`;
    g.appendChild(el);
  }
}
function dayCompletionCount(date){
  const c=S.checks[date]||{};
  return Object.values(c).filter(Boolean).length;
}
function isDayComplete(date){
  return dayCompletionCount(date)>=6;
}
function completedDaysCount(){
  if(!S.start) return 0;
  const total=currentUser?.goalDays||30;
  let done=0;
  for(let d=1;d<=total;d++){
    if(isDayComplete(dayDate(d))) done++;
  }
  return done;
}

// ── CHECKLIST ─────────────────────────────────────────────────
function toggle(li,k){
  const wasComplete=isDayComplete(tod());
  li.classList.toggle('done');
  const t=tod(); if(!S.checks[t]) S.checks[t]={};
  S.checks[t][k]=li.classList.contains('done');
  saveS(); updCC(); updateStats(); buildCal();
  if(!wasComplete && isDayComplete(t)) toast('Dia concluído com sucesso!','ok');
}
function updCC(){
  const tot=document.querySelectorAll('#checks li').length;
  const dn=document.querySelectorAll('#checks li.done').length;
  document.getElementById('cc').textContent=dn+'/'+tot+(dn>=6?' · concluído':'');
}
function marcarTudo(){
  const wasComplete=isDayComplete(tod());
  document.querySelectorAll('#checks li').forEach(li=>{
    if(!li.classList.contains('done')){
      li.classList.add('done');
      const k=li.getAttribute('onclick').match(/'(\w+)'/)[1];
      const t=tod(); if(!S.checks[t]) S.checks[t]={};
      S.checks[t][k]=true;
    }
  });
  updCC(); saveS(); updateStats(); buildCal(); toast(wasComplete?'Checklist atualizado':'Dia concluído com sucesso!','ok');
}

// ── PESO ──────────────────────────────────────────────────────
function initChart(){
  const ctx=document.getElementById('wChart').getContext('2d');
  const labs=Object.keys(S.weights).map(d=>d.slice(5));
  const vals=Object.values(S.weights);
  const baseWeight = S.initW || currentUser?.initW || 0;
  wChart=new Chart(ctx,{
    type:'line',
    data:{
      labels:labs.length?labs:['Hoje'],
      datasets:[{label:'kg',data:vals.length?vals:[baseWeight],
        borderColor:'#00d4aa',backgroundColor:'rgba(0,212,170,.1)',
        borderWidth:2,pointBackgroundColor:'#00d4aa',pointRadius:4,fill:true,tension:0.4}]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:'#8892a4',font:{size:10}},grid:{color:'#252a3a'}},
        y:{ticks:{color:'#8892a4',font:{size:10}},grid:{color:'#252a3a'}}
      }
    }
  });
}
function regPeso(){
  const v=parseFloat(document.getElementById('pesoVal').value);
  if(isNaN(v)||v<50||v>200){ toast('Peso inválido','err'); return; }
  S.weights[tod()]=v; saveS(); updateStats();
  wChart.data.labels=Object.keys(S.weights).map(d=>d.slice(5));
  wChart.data.datasets[0].data=Object.values(S.weights);
  wChart.update(); document.getElementById('pesoVal').value='';
  toast(`⚖️ ${v} kg registrado!`,'ok');
}

// ── ÁGUA ──────────────────────────────────────────────────────
function buildCopos(){
  const w=document.getElementById('copos'); w.innerHTML='';
  for(let i=0;i<13;i++){
    const g=document.createElement('div'); g.className='gl'; g.id='g'+i;
    g.onclick=()=>togCopo(i);
    g.innerHTML=`<div class="glf"></div><div class="gll">${i+1}</div>`;
    w.appendChild(g);
  }
}
function togCopo(idx){
  const t=tod(); const cur=S.water[t]||0;
  const nv=idx<cur?idx:idx+1; S.water[t]=nv;
  for(let i=0;i<13;i++){ const g=document.getElementById('g'+i); if(g) i<nv?g.classList.add('on'):g.classList.remove('on'); }
  updWater(nv); saveS();
}
function updWater(n){
  const ml=n*300;
  document.getElementById('wtotal').textContent=ml.toLocaleString('pt-BR');
  document.getElementById('wbar').style.width=Math.min(ml/3000*100,100)+'%';
}

// ── STATS ─────────────────────────────────────────────────────
function updateStats(){
  const d=curDay(); document.getElementById('sDia').textContent=d;
  const ws=Object.values(S.weights); const lw=ws.length?ws[ws.length-1]:S.initW;
  document.getElementById('sPeso').textContent=lw;
  const diff=lw-S.initW; const del=document.getElementById('sDelta');
  if(diff<0){ del.textContent=diff.toFixed(1)+' kg'; del.className='d dn'; }
  else if(diff>0){ del.textContent='+'+diff.toFixed(1)+' kg'; del.className='d dp'; }
  else{ del.textContent='–'; del.className='d'; }
  let streak=0;
  for(let i=0;i<30;i++){
    const dt=new Date(); dt.setDate(dt.getDate()-i);
    const s=dt.toISOString().split('T')[0]; const c=S.checks[s];
    if(c&&Object.values(c).filter(Boolean).length>=5) streak++;
    else if(i>0) break;
  }
  document.getElementById('sStreak').textContent=streak;
  document.getElementById('sDoneDays').textContent=completedDaysCount();
  const totalDays=currentUser?.goalDays||30;
  const p1Days=Math.min(7,totalDays);
  const p2Days=Math.max(totalDays-p1Days,1);
  const ph1=Math.min(Math.max(d-1,0),p1Days);
  const ph2=Math.max(0,Math.min(d-p1Days-1,p2Days));
  document.getElementById('phase1Name').textContent=currentUser?.strategy==='pesado'&&currentUser?.goal==='perder'?'Fase 1 — 1 refeição/dia':'Fase 1 — arranque';
  document.getElementById('phase2Name').textContent=currentUser?.goal==='ganhar'?'Fase 2 — progressão de massa':'Fase 2 — continuidade';
  document.getElementById('p1b').style.width=(ph1/p1Days*100)+'%';
  document.getElementById('p2b').style.width=(ph2/p2Days*100)+'%';
  document.getElementById('p1l').textContent=ph1+'/'+p1Days;
  document.getElementById('p2l').textContent=ph2+'/'+p2Days;
  document.getElementById('sPct').textContent=Math.round((d-1)/totalDays*100)+'%';
  document.getElementById('sCredits').textContent=currentUser?.aiCredits ?? 0;
}

// ── FASES ─────────────────────────────────────────────────────
function fase(n,btn){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('on')); btn.classList.add('on');
  document.getElementById('f1').style.display=n===1?'':'none';
  document.getElementById('f2').style.display=n===2?'':'none';
}

// ── FOTO ──────────────────────────────────────────────────────
function uploadFoto(e){
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=ev=>{
    const p=document.getElementById('prev'); p.src=ev.target.result; p.style.display='block';
    photoB64=ev.target.result.split(',')[1];
    document.getElementById('btnFoto').style.display='inline-flex';
    document.getElementById('fotoBtns').style.display='flex';
  };
  r.readAsDataURL(f);
}
function limparFoto(){
  photoB64=null;
  document.getElementById('prev').style.display='none';
  document.getElementById('btnFoto').style.display='none';
  document.getElementById('fInput').value='';
  document.getElementById('fotoBox').classList.remove('show');
  document.getElementById('fotoBtns').style.display='none';
}
async function analisarFoto(){
  if(!photoB64){ toast('Selecione uma foto primeiro','err'); return; }
  if((currentUser?.aiCredits ?? 0) <= 0){ toast('Você não tem mais consultas de IA disponíveis','err'); return; }
  setBtn('btnFoto',true,'🤖 Analisar com IA');
  const box=document.getElementById('fotoBox'); const cnt=document.getElementById('fotoContent');
  box.classList.add('show'); cnt.textContent='Analisando sua foto...';
  try{
    const resp=await aiVision([{role:'user',content:[
      {type:'text',text:`${sysPrompt()}\n\nAnalise esta foto de refeição e responda:\n1. 🍽 O que identifica no prato\n2. 📊 Estimativa de calorias (range)\n3. 🥩 Estimativa de % proteína\n4. ✅ ou ❌ Está dentro do protocolo OMAD?\n5. 💡 1 sugestão de melhoria\n\nSeja objetivo e direto.`},
      {type:'image_url',image_url:{url:'data:image/jpeg;base64,'+photoB64}}
    ]}]);
    cnt.textContent=resp;
    await useAiCredit();
    addLog('Refeição analisada por foto 📸','ok');
  }catch(e){ cnt.textContent='❌ Erro: '+e.message; }
  setBtn('btnFoto',false,'🤖 Analisar com IA');
}

// ── REFEIÇÃO ──────────────────────────────────────────────────
async function avaliarRefeicao(){
  const txt=document.getElementById('mealTxt').value.trim();
  if(!txt){ toast('Descreva a refeição primeiro','err'); return; }
  if((currentUser?.aiCredits ?? 0) <= 0){ toast('Você não tem mais consultas de IA disponíveis','err'); return; }
  setBtn('btnMeal',true,'🤖 Avaliar com IA');
  const box=document.getElementById('mealBox'); const cnt=document.getElementById('mealContent');
  box.classList.add('show'); cnt.textContent='Avaliando sua refeição...';
  try{
    const resp=await ai([
      {role:'system',content:sysPrompt()},
      {role:'user',content:`Avaliei minha refeição OMAD: "${txt}"\n\nMe dê:\n1. 📊 Estimativa de calorias e macros (proteína/carbo/gordura)\n2. ✅ ou ❌ Se está dentro do protocolo\n3. 🏆 Nota de 1 a 10\n4. 💡 O que melhorar na próxima refeição`}
    ]);
    cnt.textContent=resp;
    await useAiCredit();
    const nota=resp.match(/(\d+)\s*\/?\s*10/); const n=nota?parseInt(nota[1]):5;
    const score=n>=8?'bom':n>=5?'ok':'ruim';
    addLog(txt,score); document.getElementById('mealTxt').value='';
  }catch(e){ cnt.textContent='❌ Erro: '+e.message; }
  setBtn('btnMeal',false,'🤖 Avaliar com IA');
}
function regManual(){
  const txt=document.getElementById('mealTxt').value.trim();
  if(!txt){ toast('Descreva a refeição','err'); return; }
  addLog(txt,'ok'); document.getElementById('mealTxt').value=''; toast('🍽 Registrado!','ok');
}
function addLog(txt,score){
  const t=tod(); if(!S.meals[t]) S.meals[t]=[];
  const now=new Date(); const hr=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
  S.meals[t].push({hr,txt,score}); saveS(); renderLog();
}
function renderLog(){
  const t=tod(); const ms=S.meals[t]||[];
  const el=document.getElementById('mLog');
  if(!ms.length){ el.innerHTML='<div style="color:var(--m);font-size:.82rem;padding:8px 0">Nenhuma refeição registrada.</div>'; return; }
  el.innerHTML=ms.slice().reverse().map(m=>{
    const sc=m.score==='bom'?'sg':m.score==='ok'?'so':'sb';
    const sl=m.score==='bom'?'✅ Ótimo':m.score==='ok'?'⚠️ Ok':'❌ Fora';
    return `<div class="li"><span class="lt">${m.hr}</span><span class="lx">${m.txt}</span><span class="ls ${sc}">${sl}</span></div>`;
  }).join('');
}

// ── COACH ─────────────────────────────────────────────────────
async function perguntarCoach(){
  const txt=document.getElementById('coachTxt').value.trim();
  if(!txt){ toast('Escreva sua pergunta','err'); return; }
  setBtn('btnCoach',true,'🤖 Perguntar ao coach');
  const box=document.getElementById('coachBox'); const cnt=document.getElementById('coachContent');
  box.classList.add('show'); cnt.textContent='Pensando na melhor resposta para você...';
  try{
    const d=curDay(); const ph=d<=7?'Fase 1 (hardcore)':'Fase 2 (sustentável)';
    const resp=await ai([
      {role:'system',content:sysPrompt()},
      {role:'user',content:`Estou no dia ${d} do protocolo, ${ph}. Minha pergunta: ${txt}`}
    ]);
    cnt.textContent=resp; document.getElementById('coachTxt').value='';
  }catch(e){ cnt.textContent='❌ Erro: '+e.message; }
  setBtn('btnCoach',false,'🤖 Perguntar ao coach');
}

// ── SUGESTÃO ──────────────────────────────────────────────────
async function sugerir(tipo){
  const map={almoco:'almoço OMAD (12h-14h)',janta:'jantar OMAD (18h-20h)',rapido:'refeição rápida em 15 minutos',cheat:'refeição cheat controlada que não arruíne o protocolo'};
  const box=document.getElementById('sugBox'); const cnt=document.getElementById('sugContent');
  box.classList.add('show'); cnt.textContent='Montando sugestão personalizada...';
  try{
    const d=curDay(); const ph=d<=7?'Fase 1 hardcore':'Fase 2 sustentável';
    const resp=await ai([
      {role:'system',content:sysPrompt()},
      {role:'user',content:`Sugira uma ${map[tipo]} para mim. Estou no dia ${d}, ${ph}. Inclua: ingredientes com quantidades, modo de preparo rápido, estimativa de calorias e macros. Priorize saciedade máxima e proteína.`}
    ]);
    cnt.textContent=resp;
  }catch(e){ cnt.textContent='❌ Erro: '+e.message; }
}

// ── NOTURNO ───────────────────────────────────────────────────
function decidir(tipo){
  const box=document.getElementById('nightBox'); const cnt=document.getElementById('nightContent');
  box.classList.add('show');
  if(tipo==='fome'){
    cnt.textContent='🥩 Fome real — tudo bem comer algo leve. Escolha: 2 ovos mexidos, 100-150g de frango desfiado, cottage com chia, ou iogurte grego sem açúcar. Isso vai manter você no protocolo sem prejudicar o resultado.';
  }else{
    cnt.textContent='🧠 É ansiedade — você não precisa comer. Estratégias: tomar água com gás + rodela de limão, fazer uma caminhada de 10 minutos, escovar os dentes (inibe vontade de comer), ou simplesmente esperar 20 minutos. A sensação vai passar.';
  }
}
async function conselhNoturno(){
  const box=document.getElementById('nightBox'); const cnt=document.getElementById('nightContent');
  box.classList.add('show'); cnt.textContent='Buscando conselho personalizado...';
  try{
    const resp=await ai([
      {role:'system',content:sysPrompt()},
      {role:'user',content:`É tarde da noite e estou sentindo fome ou vontade de comer. Estou no dia ${curDay()} do protocolo. O que você recomenda especificamente para eu aguentar até amanhã? Dê estratégias práticas e diretas.`}
    ]);
    cnt.textContent=resp;
  }catch(e){ cnt.textContent='❌ Erro: '+e.message; }
}

// ── ALTERNATIVAS ──────────────────────────────────────────────
function addAlt(){
  const v=document.getElementById('altTxt').value.trim(); if(!v) return;
  S.alts.push(v); document.getElementById('altTxt').value=''; saveS(); renderAlts();
}
function remAlt(i){ S.alts.splice(i,1); saveS(); renderAlts(); }
function renderAlts(){
  const el=document.getElementById('altList');
  if(!S.alts.length){ el.innerHTML='<span style="color:var(--m);font-size:.82rem">Nenhuma alternativa cadastrada.</span>'; return; }
  el.innerHTML=S.alts.map((a,i)=>`<div class="at">${a}<button onclick="remAlt(${i})">✕</button></div>`).join('');
}
async function iaAlts(){
  const box=document.getElementById('altBox'); const cnt=document.getElementById('altContent');
  box.classList.add('show'); cnt.textContent='Buscando alternativas inteligentes...';
  try{
    const resp=await ai([
      {role:'system',content:sysPrompt()},
      {role:'user',content:`Sugira 8 opções de alimentos "plano B" que eu possa comer caso sinta muita fome fora da janela OMAD, sem quebrar demais o protocolo. Quero opções práticas, fáceis de ter em casa, com baixa caloria e alta saciedade. Liste de forma simples com calorias aproximadas.`}
    ]);
    cnt.textContent=resp;
  }catch(e){ cnt.textContent='❌ Erro: '+e.message; }
}

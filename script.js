/* script.js — EcoTrackAI logic
   - modular, per-user local storage
   - Chart.js charts: weekly trend
   - natural-language parsing (rule-based) for demo
   - credits and leaderboard management
*/

/* ---------- Storage keys ---------- */
const STORAGE = {
  USERS: 'ecotrack_users_v1',           // object { username: { password, credits, initials } }
  CURRENT: 'ecotrack_current_user_v1',  // string username
  ACTIVITIES_PREFIX: 'ecotrack_acts_'   // per-user: key = ACTIVITIES_PREFIX + username -> array of activity objects
};

/* ---------- Utilities ---------- */
function el(id){ return document.getElementById(id); }
function nowDayKey(ts = Date.now()){
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/* ---------- User management ---------- */
function getUsers(){ return JSON.parse(localStorage.getItem(STORAGE.USERS) || '{}'); }
function saveUsers(u){ localStorage.setItem(STORAGE.USERS, JSON.stringify(u)); }
function setCurrentUser(name){
  localStorage.setItem(STORAGE.CURRENT, name);
}
function getCurrentUser(){ return localStorage.getItem(STORAGE.CURRENT); }
function userKeyActs(user){ return STORAGE.ACTIVITIES_PREFIX + user; }

/* ---------- Init UI elements ---------- */
const authScreen = el('auth-screen');
const appDiv = el('app');

const loginForm = el('login-form'), signupForm = el('signup-form');
const loginBtn = el('login-btn'), signupBtn = el('signup-btn');
const showSignup = el('show-signup'), showLogin = el('show-login');

const logoutBtn = el('logout'), userNameEl = el('user-name'), userAvatar = el('user-avatar');
const userCreditsEl = el('user-credits'), welcomeEl = el('welcome');

const navButtons = document.querySelectorAll('.nav-btn');
const pages = document.querySelectorAll('.page');

const parseBtn = el('parse-btn'), nlText = el('nl-text'), parsedOutput = el('parsed-output');
const quickAddBtn = el('quick-add-btn'), quickActivity = el('quick-activity'), quickAmount = el('quick-amount');
const quickAddTop = el('quick-add');

const breakdownEl = el('breakdown'), todayCo2El = el('today-co2'), weekAvgEl = el('week-avg'), showCreditsEl = el('show-credits');
const badgesEl = el('badges'), tipsBox = el('tips-box'), leaderList = el('leader-list');

/* ---------- Chart setup (weekly trend) ---------- */
let trendChart;
function initTrendChart(labels = [], data = []){
  const ctx = document.getElementById('trendChart').getContext('2d');
  if(trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'kg CO₂', data, backgroundColor: '#34d399' }] },
    options: { responsive: true, plugins:{ legend:{display:false} }, scales:{ y:{beginAtZero:true} } }
  });
}

/* ---------- Authentication handlers ---------- */
function showSignupForm(){
  loginForm.classList.add('hidden'); signupForm.classList.remove('hidden');
}
function showLoginForm(){
  signupForm.classList.add('hidden'); loginForm.classList.remove('hidden');
}

/* Signup */
signupBtn.addEventListener('click', ()=>{
  const u = el('signup-username').value.trim();
  const p = el('signup-password').value.trim();
  if(!u || !p){ alert('Enter username & password'); return; }
  const users = getUsers();
  if(users[u]){ alert('Username taken'); return; }
  users[u] = { password: p, credits: 0, initials: u.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase() };
  saveUsers(users);
  // create empty activities list
  localStorage.setItem(userKeyActs(u), JSON.stringify([]));
  alert('Account created — sign in now.');
  showLoginForm();
});

/* Login */
loginBtn.addEventListener('click', ()=>{
  const u = el('login-username').value.trim();
  const p = el('login-password').value.trim();
  if(!u || !p){ alert('Enter username & password'); return; }
  const users = getUsers();
  if(!users[u] || users[u].password !== p){ alert('Invalid credentials'); return; }
  setCurrentUser(u);
  loadAppForUser(u);
});

/* Switch links */
el('show-signup').addEventListener('click', showSignupForm);
el('show-login').addEventListener('click', showLoginForm);

/* Logout */
logoutBtn.addEventListener('click', ()=>{
  localStorage.removeItem(STORAGE.CURRENT);
  // reset UI
  appDiv.classList.add('hidden');
  authScreen.classList.remove('hidden');
  // clear sensitive UI
  el('login-username').value = ''; el('login-password').value = '';
});

/* ---------- Page navigation ---------- */
navButtons.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    navButtons.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const page = btn.dataset.page;
    pages.forEach(p=> p.id === `page-${page}` ? p.classList.remove('hidden') : p.classList.add('hidden'));
    // show tips update when user visits
    if(page === 'tips') updateTips();
  });
});
quickAddTop && quickAddTop.addEventListener('click', ()=> {
  // switch to add page
  document.querySelector('[data-page="add"]').click();
  window.scrollTo({top:0, behavior:'smooth'});
});

/* ---------- Carbon factors (same as before) ---------- */
const carbonFactors = {
  car: 0.12, bus: 0.07, bike: 0.02, walk: 0,
  ac: 1.30, electricity: 0.90,
  beef: 27, chicken: 6.5, veg: 2.0, train: 0.05
};

/* ---------- Activity storage per-user ---------- */
function loadActivitiesFor(user){
  try { return JSON.parse(localStorage.getItem(userKeyActs(user)) || '[]'); } catch(e){ return []; }
}
function saveActivitiesFor(user, arr){
  localStorage.setItem(userKeyActs(user), JSON.stringify(arr));
}

/* ---------- Parse natural input (rule-based demo) ---------- */
function parseNaturalText(text){
  text = (text||'').toLowerCase();
  const acts = [];
  if(!text) return acts;
  // simple patterns (travel)
  const travel = /(?:drove|drove|drive|driving|biked|biked|bike|cycled|rode)\s*(\d+(\.\d+)?)/g;
  let m;
  while((m = travel.exec(text)) !== null){
    const val = parseFloat(m[1]);
    const seg = m[0];
    let mode = /bike|biked|cycled/.test(seg) ? 'bike' : 'car';
    acts.push({activity:mode, amount: val, unit:'km', co2: +(carbonFactors[mode]*val).toFixed(3)});
  }
  // AC
  const ac = /(?:ac|air conditioner|aircon)\s*(?:for)?\s*(\d+(\.\d+)?)/g;
  while((m = ac.exec(text)) !== null){
    const hrs = parseFloat(m[1]);
    acts.push({activity:'ac', amount: hrs, unit:'hours', co2: +(carbonFactors.ac * hrs).toFixed(3)});
  }
  // electricity
  const el = /(?:kwh|electricity)\s*(\d+(\.\d+)?)/g;
  while((m = el.exec(text)) !== null){
    const k = parseFloat(m[1]); acts.push({activity:'electricity', amount:k, unit:'kWh', co2: +(carbonFactors.electricity * k).toFixed(3)});
  }
  // food
  if(/beef|steak/.test(text)) acts.push({activity:'beef', amount:1, unit:'serving', co2: carbonFactors.beef});
  if(/chicken/.test(text)) acts.push({activity:'chicken', amount:1, unit:'serving', co2: carbonFactors.chicken});
  if(/vegetarian|veg|salad/.test(text) && !/chicken|beef|fish/.test(text)) acts.push({activity:'veg', amount:1, unit:'serving', co2: carbonFactors.veg});

  // fallback heuristics if nothing found
  if(acts.length === 0){
    if(/drove|drive|driving/.test(text)) acts.push({activity:'car', amount:5, unit:'km', co2: +(carbonFactors.car*5).toFixed(3)});
    if(/bike|biked|cycle/.test(text)) acts.push({activity:'bike', amount:3, unit:'km', co2: +(carbonFactors.bike*3).toFixed(3)});
    if(/ac/.test(text)) acts.push({activity:'ac', amount:1, unit:'hours', co2: +(carbonFactors.ac*1).toFixed(3)});
  }

  // combine duplicates
  const grouped = {};
  acts.forEach(a=>{
    const k = `${a.activity}|${a.unit}`;
    if(!grouped[k]) grouped[k] = {...a};
    else { grouped[k].amount += a.amount; grouped[k].co2 += a.co2; }
  });
  return Object.values(grouped).map(x => ({...x, co2: +x.co2.toFixed(3)}));
}

/* ---------- Add parsed activities (store) ---------- */
function addParsedActivitiesForUser(user, parsed){
  if(!user) return;
  const arr = loadActivitiesFor(user);
  const day = nowDayKey();
  parsed.forEach(p=>{
    arr.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2,5),
      day,
      activity: p.activity,
      amount: p.amount,
      unit: p.unit,
      co2: p.co2,
      ts: Date.now()
    });
  });
  saveActivitiesFor(user, arr);
  recalcAndRenderFor(user);
}

/* ---------- Credits & badge logic ---------- */
function awardCreditsIfEligibleFor(user){
  const arr = loadActivitiesFor(user);
  const today = nowDayKey();
  const todayTotal = arr.filter(a=>a.day===today).reduce((s,x)=>s+x.co2,0);
  // compute weekly avg
  const weekTotals = getLast7DaysTotalsFor(user);
  const weekAvg = weekTotals.reduce((a,b)=>a+b,0)/7 || 0;
  const users = getUsers();
  const profile = users[user] || { credits:0 };
  // daily log bonus
  if(arr.some(a=>a.day===today)){
    const lastGiven = localStorage.getItem(`${user}_last_consistency`) || '';
    if(lastGiven !== today){
      profile.credits = (profile.credits||0) + 5;
      localStorage.setItem(`${user}_last_consistency`, today);
    }
  }
  // reduction bonus
  if(todayTotal > 0 && todayTotal < weekAvg){
    const lastAward = localStorage.getItem(`${user}_last_reduce`) || '';
    if(lastAward !== today){
      profile.credits = (profile.credits||0) + 10;
      localStorage.setItem(`${user}_last_reduce`, today);
    }
  }
  // save profile back
  users[user] = users[user] || {};
  users[user].credits = profile.credits;
  saveUsers(users);
}

/* ---------- Dashboard calculations ---------- */
function getLast7DaysTotalsFor(user){
  const arr = loadActivitiesFor(user);
  const totals = [];
  for(let i=6;i>=0;i--){
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const s = arr.filter(a=>a.day===key).reduce((sum,x)=>sum+x.co2,0);
    totals.push(+s.toFixed(3));
  }
  return totals;
}

function recalcAndRenderFor(user){
  const arr = loadActivitiesFor(user);
  const today = nowDayKey();
  const todayTotal = arr.filter(a=>a.day===today).reduce((s,x)=>s+x.co2,0);
  todayCo2El.innerText = `${todayTotal.toFixed(3)} kg`;
  // weekly avg
  const weekTotals = getLast7DaysTotalsFor(user);
  const weekAvg = (weekTotals.reduce((a,b)=>a+b,0)/7) || 0;
  weekAvgEl.innerText = `${weekAvg.toFixed(3)} kg`;

  // breakdown
  const todays = arr.filter(a=>a.day===today);
  if(!todays.length) breakdownEl.innerHTML = `<div class="muted">No activities yet — add one from "Add Activity".</div>`;
  else {
    breakdownEl.innerHTML = '';
    todays.forEach(it=>{
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div><strong>${capitalize(it.activity)}</strong> <span class="muted">(${it.amount} ${it.unit})</span></div><div class="muted">${it.co2} kg</div>`;
      breakdownEl.appendChild(row);
    });
  }

  // award credits if eligible and update UI
  awardCreditsIfEligibleFor(user);
  const users = getUsers();
  const credits = (users[user] && users[user].credits) || 0;
  showCreditsEl.innerText = credits;
  userCreditsEl.innerText = credits;

  // badges
  const badges = [];
  if(credits >= 300) badges.push('🏅 Platinum');
  else if(credits >= 200) badges.push('🥈 Silver');
  else if(credits >= 100) badges.push('🥇 Gold');
  if(!badges.length) badgesEl.innerHTML = `<span class="chip muted">No badges yet</span>`;
  else badgesEl.innerHTML = badges.map(b=>`<span class="chip">${b}</span>`).join('');

  // update trend chart
  const labels = last7DayLabels();
  const data = getLast7DaysTotalsFor(user);
  initTrendChart(labels, data);

  // update leaderboard (simple)
  renderLeaderboard();
}

/* ---------- Helpers ---------- */
function capitalize(s){ return s ? s[0].toUpperCase() + s.slice(1) : s; }
function last7DayLabels(){
  const out = [];
  for(let i=6;i>=0;i--){
    const d = new Date(); d.setDate(d.getDate() - i);
    out.push(`${d.getMonth()+1}/${d.getDate()}`);
  }
  return out;
}

/* ---------- Leaderboard ---------- */
function renderLeaderboard(){
  // build from users storage
  const users = getUsers();
  const arr = Object.keys(users).map(u => ({ name: u, credits: users[u].credits || 0, initials: users[u].initials || u[0] }));
  arr.sort((a,b)=>b.credits - a.credits);
  if(!arr.length) { leaderList.innerHTML = `<div class="muted">No users yet.</div>`; return; }
  leaderList.innerHTML = '';
  arr.slice(0,10).forEach((u, idx)=>{
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `<div style="display:flex;gap:10px;align-items:center"><div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(90deg,#c7f9dc,#8ff3b0);display:flex;align-items:center;justify-content:center;font-weight:700">${u.initials}</div><div><strong>${u.name}</strong><div class="muted small">Rank #${idx+1}</div></div></div><div class="muted">${u.credits}</div>`;
    leaderList.appendChild(row);
  });
}

/* ---------- Tips (rule-based demo) ---------- */
function updateTips(){
  const user = getCurrentUser();
  if(!user){ tipsBox.innerHTML = `<span class="chip muted">Sign in to get personalized tips</span>`; return; }
  const arr = loadActivitiesFor(user);
  // look at today's activities
  const today = nowDayKey();
  const todayActs = arr.filter(a=>a.day===today).map(a=>a.activity);
  const tips = new Set();
  todayActs.forEach(act=>{
    if(['car','bus','train'].includes(act)) tips.add('Consider carpooling or public transport for short trips.');
    if(act === 'ac') tips.add('Reduce AC runtime by 1 hour — set thermostat +2°C and use a fan.');
    if(['beef','chicken'].includes(act)) tips.add('Try a meat-free meal once this week.');
    if(act === 'electricity') tips.add('Unplug idle devices and use energy-efficient bulbs.');
  });
  if(!tips.size) tips.add('Log some activities to receive personalized tips.');
  tipsBox.innerHTML = Array.from(tips).map(t=>`<span class="chip">${t}</span>`).join('');
}

/* ---------- Event: parse NL input ---------- */
parseBtn.addEventListener('click', ()=>{
  const txt = nlText.value.trim();
  if(!txt){ alert('Type an activity like "I drove 10 km today"'); return; }
  const parsed = parseNaturalText(txt);
  if(!parsed.length){ parsedOutput.innerHTML = `<div class="muted">No recognized activities. Try shorter sentences.</div>`; return; }
  parsedOutput.innerHTML = parsed.map(p => `<div><strong>${capitalize(p.activity)}</strong> — ${p.amount} ${p.unit} — <span class="muted">${p.co2} kg CO₂</span></div>`).join('');
  // store for signed user
  const user = getCurrentUser();
  if(!user){ alert('Please sign in to save activities.'); return; }
  addParsedActivitiesForUser(user, parsed);
  // empty input
  nlText.value = '';
  // show tips
  updateTips();
});

/* ---------- Quick add ---------- */
quickAddBtn.addEventListener('click', ()=>{
  const activity = quickActivity.value;
  const amount = parseFloat(quickAmount.value);
  if(!activity || !amount){ alert('Choose activity and amount'); return; }
  const co2 = (carbonFactors[activity] || 0) * amount;
  const parsed = [{ activity, amount, unit: activity==='ac' ? 'hours' : activity==='electricity' ? 'kWh' : (activity==='chicken'||activity==='beef') ? 'serving' : 'km', co2: +co2.toFixed(3) }];
  const user = getCurrentUser();
  if(!user){ alert('Sign in to save activities'); return; }
  addParsedActivitiesForUser(user, parsed);
  quickActivity.value = ''; quickAmount.value = '';
  updateTips();
});

/* ---------- App loader ---------- */
function loadAppForUser(username){
  // hide auth, show app
  authScreen.classList.add('hidden');
  appDiv.classList.remove('hidden');
  // set UI
  const users = getUsers();
  const profile = users[username] || { initials: username[0].toUpperCase(), credits: 0 };
  userNameEl.innerText = username;
  userAvatar.innerText = profile.initials || username[0].toUpperCase();
  userCreditsEl.innerText = profile.credits || 0;
  welcomeEl.innerText = `Welcome, ${username}`;
  // initial render
  recalcAndRenderFor(username);
}

/* ---------- On load: if user logged in auto open ---------- */
window.addEventListener('load', ()=>{
  const cur = getCurrentUser();
  if(cur){
    loadAppForUser(cur);
  } else {
    // show auth screen
    authScreen.classList.remove('hidden');
    appDiv.classList.add('hidden');
  }
});

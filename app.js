let QA = [];
let CONTACTS = [];

const $ = (sel) => document.querySelector(sel);
const answerEl = $("#answer");
const contactsEl = $("#contacts");
const contactListEl = $("#contactList");
const qInput = $("#q");
const btnSearch = $("#btnSearch");
const btnClear = $("#btnClear");

function norm(s){ return (s||"").toString().toLowerCase().trim(); }
function tokens(s){ return norm(s).split(/[^가-힣a-z0-9]+/).filter(Boolean); }

const SYN = {
  "연락": ["전화","번호","담당","상담","문의","문의처"],
  "전화": ["연락","번호","상담"],
  "담당자": ["담당","담당부서","담당 팀"],
  "검사": ["점검","확인","시험"],
  "신청": ["접수","제출","요청"],
  "기한": ["마감","데드라인","제출기한","만료"],
  "담당": ["담당자","담당부서"],
  "문의처": ["연락처","연락"]
};

function expandQuery(q){
  const out = new Set([q]);
  const qs = tokens(q);
  Object.entries(SYN).forEach(([k, vs]) => {
    const nk = norm(k);
    if (qs.includes(nk)) vs.forEach(v => out.add(q.replaceAll(k, v)));
    vs.forEach(v => { if (qs.includes(norm(v))) out.add(q.replaceAll(v, k)); });
  });
  return [...out];
}

function scoreQA(item, query){
  let score = 0;
  const q = norm(query);
  const qts = tokens(query);
  const fields = { question:5, tags:4, answer:3, policy_id:1 };
  for (const [field,w] of Object.entries(fields)){
    const v = norm(Array.isArray(item[field])? item[field].join(" ") : item[field]);
    if (!v) continue;
    if (v.includes(q)) score += 3*w;
    const vts = tokens(v);
    const overlap = qts.filter(t => vts.includes(t)).length;
    score += overlap*w;
  }
  return score;
}

function scoreContact(item, query){
  let score = 0;
  const q = norm(query);
  const qts = tokens(query);
  const fields = { dept:5, person:4, tags:4, note:2, phone:3 };
  for (const [field,w] of Object.entries(fields)){
    const v = norm(Array.isArray(item[field])? item[field].join(" "): item[field]);
    if (!v) continue;
    if (v.includes(q)) score += 3*w;
    const vts = tokens(v);
    const overlap = qts.filter(t => vts.includes(t)).length;
    score += overlap*w;
  }
  return score;
}

async function loadData(){
  try{
    const res = await fetch("data.json", { cache: "no-store" });
    if(!res.ok) throw new Error(`data.json load failed: ${res.status}`);
    const data = await res.json();
    QA = data.qa || [];
    CONTACTS = data.contacts || [];
  }catch(err){
    answerEl.innerHTML = `<div class='card'><p><strong>초기화 실패:</strong> ${err.message}</p></div>`;
    console.error(err);
  }
}

function renderAnswer(results, query){
  answerEl.innerHTML = "";
  if (!results.length){
    answerEl.innerHTML = `<div class='card'><p>해당 내용을 찾지 못했어요. 다른 표현으로 질문해 보세요.</p></div>`;
    contactsEl.classList.add("hidden");
    return;
  }
  const [top, ...rest] = results.slice(0,3);
  const item = top.item;
  const html = `
    <article class='card'>
      <h2>${item.question}</h2>
      <div class='answer'>${(item.answer||'').replace(/\n/g,'<br>')}</div>
      <button class='call-btn' onclick=\"window.location.href='tel:0514401005'\">📞 문의처 051-440-1005</button>
    </article>`;
  answerEl.insertAdjacentHTML("beforeend", html);

  if (rest.length){
    const sugg = rest.map(r => `<li><button class='sugg-btn' data-q='${r.item.question}'>${r.item.question}</button></li>`).join("");
    answerEl.insertAdjacentHTML("beforeend", `<aside class='sugg'><strong>관련 질문</strong><ul>${sugg}</ul></aside>`);
    document.querySelectorAll(".sugg-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        qInput.value = e.target.dataset.q;
        doSearch();
      });
    });
  }

  const phoneHints = ['연락','전화','번호','담당','상담','문의','문의처','contact','phone'];
  const needContacts = phoneHints.some(h => norm(query).includes(norm(h)));
  showContacts(needContacts ? query : "");
}

function showContacts(query){
  if (!query){
    contactsEl.classList.add("hidden");
    contactListEl.innerHTML = "";
    return;
  }
  const expanded = expandQuery(query);
  let scored = [];
  for (const q of expanded){
    CONTACTS.forEach(c => scored.push({ item:c, score: scoreContact(c,q) }));
  }
  const best = new Map();
  scored.forEach(({item, score}) => {
    const key = JSON.stringify(item);
    best.set(key, Math.max(best.get(key)||0, score));
  });
  const sorted = [...best.entries()].map(([key,score])=>({item:JSON.parse(key),score}))
    .filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,5);

  if (!sorted.length){
    contactsEl.classList.add("hidden");
    contactListEl.innerHTML = "";
    return;
  }

  contactListEl.innerHTML = sorted.map(r => {
    const c = r.item;
    return `<li class='contact'>
      <div>
        <div class='dept'>${c.dept||''}</div>
        <div class='person'>${c.person? c.person+' ' : ''}<span class='phone'>${c.phone||''}</span></div>
        ${c.note? `<div class='note'>${c.note}</div>`:''}
      </div>
      <div class='btns'>
        <button class='copy' data-text='${(c.phone||'').replace(/"/g,'&quot;')}'>복사</button>
        <a class='call' href='tel:${(c.phone||'').replace(/-/g,'')}' target='_blank' rel='noopener'>전화</a>
      </div>
    </li>`;
  }).join("");

  contactsEl.classList.remove("hidden");

  document.querySelectorAll('.copy').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      try{
        await navigator.clipboard.writeText(e.target.dataset.text);
        btn.textContent = '복사됨';
        setTimeout(()=> btn.textContent = '복사', 1200);
      }catch(err){
        alert('복사 실패: 권한을 확인하세요.');
      }
    });
  });
}

function doSearch(){
  const query = qInput.value.trim();
  if (!query) return;
  const expanded = expandQuery(query);

  let scored = [];
  for (const q of expanded){
    QA.forEach(it => scored.push({ item:it, score: scoreQA(it,q) }));
  }
  const best = new Map();
  scored.forEach(({item, score}) => {
    const key = JSON.stringify(item);
    best.set(key, Math.max(best.get(key)||0, score));
  });
  const sorted = [...best.entries()].map(([key,score])=>({item:JSON.parse(key),score}))
    .filter(r=>r.score>0).sort((a,b)=>b.score-a.score);

  renderAnswer(sorted, query);
}

function syncClearVisibility(){
  if (qInput.value.trim()) btnClear.classList.remove('hidden');
  else btnClear.classList.add('hidden');
}
function clearQuery(){
  qInput.value = '';
  syncClearVisibility();
  qInput.focus();
}

window.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  btnSearch.addEventListener('click', doSearch);
  qInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
    if (e.key === 'Escape') clearQuery();
  });
  qInput.addEventListener('input', syncClearVisibility);
  btnClear.addEventListener('click', clearQuery);
  syncClearVisibility();
});

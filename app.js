import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers/dist/transformers.min.js';

let QA = [];
let CONTACTS = [];

const $ = (sel) => document.querySelector(sel);
const answerEl = $("#answer");
const contactsEl = $("#contacts");
const contactListEl = $("#contactList");
const qInput = $("#q");
const btnSearch = $("#btnSearch");
const btnClear = $("#btnClear");
const noticeEl = $("#notice");
const searchBoxEl = document.querySelector(".search-box");

function lower(s){ return (s||'').toString().trim().toLowerCase(); }
function tokens(s){ return lower(s).split(/[^가-힣a-z0-9]+/).filter(Boolean); }

let embedder = null;
async function getEmbedder(){
  if (embedder) return embedder;
  embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  return embedder;
}

async function embedText(text){
  const extractor = await getEmbedder();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

function cosineSim(a,b){
  let s=0, n=Math.min(a.length,b.length);
  for (let i=0;i<n;i++) s += a[i]*b[i];
  return s;
}

let QA_EMBEDS = [];
let DATA_KEY = null;

function hashString(s){
  let h = 2166136261;
  for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h += (h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24); }
  return (h>>>0).toString(16);
}

async function loadData(){
  const res = await fetch('data.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('data.json load failed');
  const data = await res.json();
  QA = data.qa || [];
  CONTACTS = data.contacts || [];

  const sig = JSON.stringify({ n: QA.length, f: QA[0]||null, l: QA[QA.length-1]||null });
  DATA_KEY = 'qa_embeds_' + hashString(sig);

  const cached = localStorage.getItem(DATA_KEY);
  if (cached){
    try{
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length === QA.length){
        QA_EMBEDS = parsed;
        return;
      }
    }catch{}
  }
  const extractor = await getEmbedder();
  QA_EMBEDS = [];
  for (const item of QA){
    const text = [
      item.question || '',
      Array.isArray(item.tags) ? item.tags.join(' ') : (item.tags || ''),
      item.answer || ''
    ].join(' \n ');
    const out = await extractor(text, { pooling: 'mean', normalize: true });
    QA_EMBEDS.push(Array.from(out.data));
  }
  try{ localStorage.setItem(DATA_KEY, JSON.stringify(QA_EMBEDS)); }catch{}
}

function placeNoticeBelowSearch(){
  if (!noticeEl || !searchBoxEl) return;
  searchBoxEl.insertAdjacentElement('afterend', noticeEl);
}
function placeNoticeBelowAnswer(){
  if (!noticeEl) return;
  answerEl.insertAdjacentElement('afterend', noticeEl);
}

function scoreContact(item, query){
  let score = 0;
  const q = lower(query);
  const qts = tokens(query);
  const fields = { dept:5, person:4, tags:4, note:2, phone:3 };
  for (const [field,w] of Object.entries(fields)){
    const v = lower(Array.isArray(item[field])? item[field].join(' ') : item[field] || '');
    if (!v) continue;
    if (v.includes(q)) score += 3*w;
    const vts = tokens(v);
    const overlap = qts.filter(t => vts.includes(t)).length;
    score += overlap*w;
  }
  return score;
}

function renderAnswer(sorted, query){
  answerEl.innerHTML = '';
  if (!sorted.length){
    answerEl.innerHTML = `<div class="card"><p>해당 내용을 찾지 못했어요. 다른 표현으로 질문해 보세요.</p></div>`;
    contactsEl.classList.add('hidden');
    placeNoticeBelowSearch();
    return;
  }
  const [top, ...rest] = sorted.slice(0,3);
  const item = top.item;
  const html = `
    <article class="card">
      <h2>${item.question}</h2>
      <div class="answer">${(item.answer||"").replace(/\n/g,"<br>")}</div>
      <button class="call-btn" onclick="window.location.href='tel:0514401005'">📞 문의처 051-440-1005</button>
    </article>`;
  answerEl.insertAdjacentHTML('beforeend', html);

  if (rest.length){
    const sugg = rest.map(r => `<li><button class="sugg-btn" data-q="${r.item.question}">${r.item.question}</button></li>`).join('');
    answerEl.insertAdjacentHTML('beforeend', `<aside class="sugg"><strong>관련 질문</strong><ul>${sugg}</ul></aside>`);
    document.querySelectorAll('.sugg-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        qInput.value = e.target.dataset.q;
        doSearch();
      });
    });
  }
  placeNoticeBelowAnswer();

  const phoneHints = ['연락','전화','번호','담당','상담','문의','문의처','contact','phone'];
  const needContacts = phoneHints.some(h => lower(query).includes(lower(h)));
  showContacts(needContacts ? query : '');
}

function showContacts(query){
  if (!query){
    contactsEl.classList.add('hidden');
    contactListEl.innerHTML = '';
    return;
  }
  let scored = CONTACTS.map(c => ({ item: c, score: scoreContact(c, query) }));
  const sorted = scored.filter(r => r.score>0).sort((a,b)=>b.score-a.score).slice(0,5);

  if (!sorted.length){
    contactsEl.classList.add('hidden');
    contactListEl.innerHTML = '';
    return;
  }
  contactListEl.innerHTML = sorted.map(r => {
    const c = r.item;
    return `<li class="contact">
      <div>
        <div class="dept">${c.dept||""}</div>
        <div class="person">${c.person? c.person+" " : ""}<span class="phone">${c.phone||""}</span></div>
        ${c.note? `<div class="note">${c.note}</div>`:""}
      </div>
      <div class="btns">
        <button class="copy" data-text="${(c.phone||'').replace(/"/g,'&quot;')}">복사</button>
        <a class="call" href="tel:${(c.phone||'').replace(/-/g,'')}" target="_blank" rel="noopener">전화</a>
      </div>
    </li>`;
  }).join('');
  contactsEl.classList.remove('hidden');

  document.querySelectorAll('.copy').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      try{
        await navigator.clipboard.writeText(e.target.dataset.text);
        btn.textContent = '복사됨';
        setTimeout(()=> btn.textContent = '복사', 1200);
      }catch(err){ alert('복사 실패: 권한을 확인하세요.'); }
    });
  });
}

async function doSearch(){
  const query = qInput.value.trim();
  if (!query) return;
  if (!QA_EMBEDS.length){
    answerEl.innerHTML = `<div class="card"><p>초기 준비 중입니다… 잠시만요.</p></div>`;
    await loadData();
  }
  const qvec = await embedText(query);
  const scored = QA.map((item,i)=>({ item, score: cosineSim(qvec, QA_EMBEDS[i]||[]) }));
  const THRESH = 0.35;
  let sorted = scored.filter(r=>r.score>=THRESH).sort((a,b)=>b.score-a.score);
  if (!sorted.length) sorted = scored.sort((a,b)=>b.score-a.score).slice(0,1);
  renderAnswer(sorted, query);
}

function syncClearVisibility(){
  if (qInput.value.trim()) btnClear.classList.remove('hidden');
  else btnClear.classList.add('hidden');
}
function clearQuery(){
  qInput.value='';
  syncClearVisibility();
  placeNoticeBelowSearch();
  qInput.focus();
}

window.addEventListener('DOMContentLoaded', async () => {
  try{ await loadData(); }catch(err){
    answerEl.innerHTML = `<div class="card"><p><strong>초기화 실패:</strong> ${err.message}</p></div>`;
    console.error(err);
  }
  btnSearch.addEventListener('click', doSearch);
  qInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
    if (e.key === 'Escape') clearQuery();
  });
  qInput.addEventListener('input', syncClearVisibility);
  btnClear.addEventListener('click', clearQuery);
  syncClearVisibility();
});

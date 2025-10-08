// Minimal client-side search using Fuse.js (original UI behavior)
let QA = [];
let CONTACTS = [];
let fuse;

// Utility
const $ = (sel) => document.querySelector(sel);
const answerEl = $("#answer");
const contactsEl = $("#contacts");
const contactListEl = $("#contactList");
const qInput = $("#q");
const btnSearch = $("#btnSearch");

async function loadData() {
  const qaRes = await fetch("data.json");
  const data = await qaRes.json();
  QA = data.qa || [];
  CONTACTS = data.contacts || [];

  fuse = new Fuse(QA, {
    includeScore: true,
    threshold: 0.3, // original stricter setting
    keys: ["question", "answer", "tags", "policy_id"]
  });
}

function renderAnswer(resultItems, query) {
  answerEl.innerHTML = "";
  if (!resultItems.length) {
    answerEl.innerHTML = `<div class="card"><p>해당 내용을 찾지 못했어요. 다른 표현으로 질문해 보세요.<br>
    예: "검사 준비사항", "검사기한", "담당자 연락처"</p></div>`;
    contactsEl.classList.add("hidden");
    return;
  }

  const [top, ...rest] = resultItems.slice(0, 3);
  const item = top.item;

  const policyBlock = item.policy_id || item.source_url || item.version
    ? `<div class="meta">[근거] ${item.policy_id || "-"}  ${item.version ? "· 개정: " + item.version : ""} ${item.source_url ? `· <a href="${item.source_url}" target="_blank" rel="noopener">원문</a>` : ""}</div>`
    : "";

  const html = `
    <article class="card">
      <h2>${item.question}</h2>
      <div class="answer">${item.answer.replace(/\n/g, "<br>")}</div>
      ${policyBlock}
    </article>
  `;
  answerEl.insertAdjacentHTML("beforeend", html);

  if (rest.length) {
    const sugg = rest.map(r => `<li><button class="sugg-btn" data-q="${r.item.question}">${r.item.question}</button></li>`).join("");
    answerEl.insertAdjacentHTML("beforeend",
      `<aside class="sugg"><strong>관련 질문</strong><ul>${sugg}</ul></aside>`);
    document.querySelectorAll(".sugg-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        qInput.value = e.target.dataset.q;
        doSearch();
      });
    });
  }

  const phoneHints = ["연락", "전화", "번호", "담당", "상담", "contact", "phone"];
  const needContacts = phoneHints.some(h => query.includes(h));
  showContacts(needContacts ? query : "");
}

function normalize(s) { return (s || "").toLowerCase(); }

function showContacts(query) {
  if (!query) {
    contactsEl.classList.add("hidden");
    contactListEl.innerHTML = "";
    return;
  }

  const q = normalize(query);
  const filtered = CONTACTS
    .map(c => ({ c, score:
      (c.dept && normalize(c.dept).includes(q) ? 0 : 1) +
      (c.tags && c.tags.some(t => normalize(t).includes(q)) ? 0 : 1)
    }))
    .sort((a,b) => a.score - b.score)
    .slice(0, 5)
    .map(x => x.c);

  if (!filtered.length) {
    contactsEl.classList.add("hidden");
    contactListEl.innerHTML = "";
    return;
  }

  contactListEl.innerHTML = filtered.map(c => `
    <li class="contact">
      <div>
        <div class="dept">${c.dept}</div>
        <div class="person">${c.person ? c.person + " " : ""}<span class="phone">${c.phone}</span></div>
        ${c.note ? `<div class="note">${c.note}</div>` : ""}
      </div>
      <div class="btns">
        <button class="copy" data-text="${c.phone}">복사</button>
        <a class="call" href="tel:${c.phone.replace(/-/g,'')}" target="_blank" rel="noopener">전화</a>
      </div>
    </li>
  `).join("");

  contactsEl.classList.remove("hidden");

  document.querySelectorAll(".copy").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      try {
        await navigator.clipboard.writeText(e.target.dataset.text);
        btn.textContent = "복사됨";
        setTimeout(() => btn.textContent = "복사", 1200);
      } catch (err) {
        alert("복사 실패: 권한을 확인하세요.");
      }
    });
  });
}

function doSearch() {
  const query = qInput.value.trim();
  if (!query) return;

  const res = fuse.search(query);
  renderAnswer(res, query);
}

window.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  btnSearch.addEventListener("click", doSearch);
  qInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch();
  });
});

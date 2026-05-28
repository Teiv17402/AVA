/* 21D AI Challenge - Interview Bot
 * Frontend logic: load questions, render chat flow, submit to backend.
 */

const chatEl = document.getElementById('chat');
const composerEl = document.getElementById('composer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

const state = {
  questions: [],
  intro: '',
  outro_loading: '',
  outro_success: '',
  answers: {},
  idx: -1, // -1 = intro screen
};

// ---------- Utilities ----------
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Strict validators
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// VN phone: bắt đầu 0 hoặc +84, 9-10 số. Đầu số 03/05/07/08/09 (di động) hoặc 02 (cố định)
const PHONE_RE = /^(?:\+?84|0)(?:3[2-9]|5[2|5|6|8|9]|7[06-9]|8[1-9]|9[0-9]|2[0-9])\d{7}$/;

function syncComposerPadding() {
  // Đảm bảo nội dung chat không bị composer che mất khi list option dài
  const h = composerEl.offsetHeight || 80;
  chatEl.style.paddingBottom = (h + 32) + 'px';
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    syncComposerPadding();
    const last = chatEl.lastElementChild;
    if (last) {
      last.scrollIntoView({ block: 'end', behavior: 'smooth' });
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  });
}

function renderMarkdownInline(text) {
  // very lightweight: **bold**, line breaks via \n
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function interpolate(str, vars) {
  return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function addBotMessage(text) {
  const tpl = document.getElementById('tpl-bot').content.cloneNode(true);
  tpl.querySelector('.bubble-text').innerHTML = renderMarkdownInline(text);
  chatEl.appendChild(tpl);
  scrollToBottom();
}

function addUserMessage(text) {
  const tpl = document.getElementById('tpl-user').content.cloneNode(true);
  tpl.querySelector('.bubble-text').innerHTML = renderMarkdownInline(text);
  chatEl.appendChild(tpl);
  scrollToBottom();
}

function showTyping() {
  const tpl = document.getElementById('tpl-typing').content.cloneNode(true);
  const node = tpl.querySelector('.typing');
  chatEl.appendChild(tpl);
  scrollToBottom();
  return node;
}

function hideTyping(node) {
  if (node && node.parentNode) node.parentNode.removeChild(node);
}

async function botSays(text, typingMs = 800) {
  const t = showTyping();
  await delay(typingMs);
  hideTyping(t);
  addBotMessage(text);
  await delay(200);
}

function updateProgress() {
  const total = state.questions.length;
  const answered = Object.keys(state.answers).length;
  const pct = total === 0 ? 0 : Math.round((answered / total) * 100);
  progressFill.style.width = pct + '%';
  progressText.textContent = `${answered} / ${total}`;
}

// ---------- Composer renderers ----------
function clearComposer() { composerEl.innerHTML = ''; }

function renderStartButton() {
  clearComposer();
  const row = document.createElement('div');
  row.className = 'input-row';
  row.innerHTML = `<button class="btn" id="startBtn" style="width:100%">Bắt đầu phỏng vấn →</button>`;
  composerEl.appendChild(row);
  document.getElementById('startBtn').addEventListener('click', startInterview);
}

function renderTextInput(q) {
  clearComposer();
  const wrap = document.createElement('div');
  wrap.style.width = '100%';

  const row = document.createElement('div');
  row.className = 'input-row';

  const isLong = q.type === 'textarea';
  const inputType = q.type === 'email' ? 'email' : q.type === 'tel' ? 'tel' : 'text';
  const inputMode = q.type === 'tel' ? 'numeric' : q.type === 'email' ? 'email' : 'text';

  if (isLong) {
    row.innerHTML = `
      <textarea id="answerInput" rows="2" placeholder="${q.placeholder || 'Nhập câu trả lời...'}"></textarea>
      <button class="btn" id="sendBtn">Gửi</button>
    `;
  } else {
    row.innerHTML = `
      <input id="answerInput" type="${inputType}" inputmode="${inputMode}" placeholder="${q.placeholder || 'Nhập câu trả lời...'}" autocomplete="off" />
      <button class="btn" id="sendBtn">Gửi</button>
    `;
  }
  wrap.appendChild(row);
  const errEl = document.createElement('div');
  errEl.className = 'error';
  errEl.id = 'inputError';
  errEl.style.display = 'none';
  wrap.appendChild(errEl);
  composerEl.appendChild(wrap);
  syncComposerPadding();

  const input = document.getElementById('answerInput');
  const btn = document.getElementById('sendBtn');
  input.focus();

  const showError = (msg) => {
    errEl.textContent = msg;
    errEl.style.display = 'block';
    shake(input);
  };
  const clearError = () => {
    errEl.style.display = 'none';
    errEl.textContent = '';
  };
  input.addEventListener('input', clearError);

  const submit = () => {
    let val = input.value.trim();

    // Required check
    if (q.required !== false && !val) {
      showError('Vui lòng nhập thông tin để tiếp tục nhé!');
      return;
    }

    // Strict EMAIL validation
    if (q.type === 'email') {
      if (!val) { showError('Email là bắt buộc để gửi lộ trình.'); return; }
      if (!EMAIL_RE.test(val)) {
        showError('Email không đúng định dạng. Ví dụ: ten@gmail.com');
        return;
      }
      val = val.toLowerCase();
    }

    // Strict PHONE validation (VN)
    if (q.type === 'tel') {
      if (!val) { showError('Vui lòng nhập số điện thoại.'); return; }
      // Loại bỏ space, dash, dấu chấm để check
      const clean = val.replace(/[\s\-\.\(\)]/g, '');
      if (!PHONE_RE.test(clean)) {
        showError('Số điện thoại không hợp lệ. Ví dụ: 0901234567 hoặc +84901234567');
        return;
      }
      val = clean;
    }

    // Min length for textarea
    if (q.type === 'textarea' && q.required !== false && val.length < 5) {
      showError('Hãy chia sẻ chi tiết hơn một chút (ít nhất 5 ký tự).');
      return;
    }

    clearError();
    handleAnswer(q, val || '(bỏ qua)');
  };

  btn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });
}

function renderChoices(q) {
  clearComposer();
  const wrap = document.createElement('div');
  wrap.className = 'choices';
  q.options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.textContent = opt;
    btn.addEventListener('click', () => handleAnswer(q, opt));
    wrap.appendChild(btn);
  });
  composerEl.appendChild(wrap);
  syncComposerPadding();
}

function shake(el) {
  el.style.borderColor = '#ff7a7a';
  el.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
    { duration: 250 }
  );
  setTimeout(() => { el.style.borderColor = ''; }, 800);
}

// ---------- Flow ----------
async function loadQuestions() {
  const res = await fetch('questions.json');
  const data = await res.json();
  state.questions = data.questions;
  state.intro = data.intro;
  state.outro_loading = data.outro_loading;
  state.outro_success = data.outro_success;
  updateProgress();
}

async function showIntro() {
  await botSays(state.intro, 600);
  renderStartButton();
}

async function startInterview() {
  clearComposer();
  state.idx = 0;
  await askNext();
}

async function askNext() {
  if (state.idx >= state.questions.length) {
    return finish();
  }
  const q = state.questions[state.idx];
  const text = interpolate(q.question, state.answers);
  await botSays(text, 700);

  if (q.type === 'choice') renderChoices(q);
  else rende
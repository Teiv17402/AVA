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

function scrollToBottom() {
  requestAnimationFrame(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
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
  const row = document.createElement('div');
  row.className = 'input-row';

  const isLong = q.type === 'textarea';
  const inputType = q.type === 'email' ? 'email' : q.type === 'tel' ? 'tel' : 'text';

  if (isLong) {
    row.innerHTML = `
      <textarea id="answerInput" rows="2" placeholder="${q.placeholder || 'Nhập câu trả lời...'}"></textarea>
      <button class="btn" id="sendBtn">Gửi</button>
    `;
  } else {
    row.innerHTML = `
      <input id="answerInput" type="${inputType}" placeholder="${q.placeholder || 'Nhập câu trả lời...'}" autocomplete="off" />
      <button class="btn" id="sendBtn">Gửi</button>
    `;
  }
  composerEl.appendChild(row);

  const input = document.getElementById('answerInput');
  const btn = document.getElementById('sendBtn');
  input.focus();

  const submit = () => {
    const val = input.value.trim();
    if (q.required !== false && !val) {
      shake(input);
      return;
    }
    if (q.type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      shake(input);
      return;
    }
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
  else renderTextInput(q);
}

async function handleAnswer(q, value) {
  state.answers[q.id] = value;
  addUserMessage(value);
  clearComposer();
  updateProgress();
  state.idx += 1;
  await delay(400);
  await askNext();
}

async function finish() {
  clearComposer();
  await botSays(state.outro_loading, 600);
  const t = showTyping();

  let analysis = null;
  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: state.answers, submittedAt: new Date().toISOString() }),
    });
    const data = await res.json();
    analysis = data.analysis;
  } catch (err) {
    console.error('submit failed', err);
  }

  hideTyping(t);

  const outro = interpolate(state.outro_success, state.answers);
  addBotMessage(outro);

  if (analysis) {
    const card = document.createElement('div');
    card.className = 'msg msg-bot';
    card.innerHTML = `
      <div class="avatar">🧠</div>
      <div class="bubble" style="max-width: 85%;">
        <div class="success-card">
          <h3>Phân tích cá nhân hoá</h3>
          <div class="bubble-text">${renderMarkdownInline(analysis)}</div>
        </div>
      </div>
    `;
    chatEl.appendChild(card);
    scrollToBottom();
  } else {
    addBotMessage('⚠️ Không thể tạo phân tích AI lúc này, nhưng thông tin của bạn đã được lưu lại. Đội ngũ sẽ liên hệ sớm!');
  }
}
  // Final CTA
  const row = document.createElement('div');
  row.className = 'input-row';
  row.innerHTML = `
    <button class="btn btn-secondary" id="restartBtn" style="flex:1;">Phỏng vấn lại</button>
    <button class="btn" id="ctaBtn" style="flex:1;">Tham gia ngay</button>
  `;
  composerEl.appendChild(row);
  document.getElementById('restartBtn').addEventListener('click', () => location.reload());
  document.getElementById('ctaBtn').addEventListener('click', () => {
    // TODO: replace with your registration URL
window.open('https://teiv17402.github.io/AVA-Study/login.html?from=test', '_blank');});


// ---------- Boot ----------
(async function init() {
  try {
    await loadQuestions();
    await showIntro();
  } catch (err) {
    console.error(err);
    addBotMessage('⚠️ Có lỗi khi tải câu hỏi. Vui lòng tải lại trang.');
  }
})();

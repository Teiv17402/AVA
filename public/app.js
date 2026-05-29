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
  idx: -1,
};

// Strict validators
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_RE = /^(?:\+?84|0)(?:3[2-9]|5[2|5|6|8|9]|7[06-9]|8[1-9]|9[0-9]|2[0-9])\d{7}$/;

// Anti-lazy: detect tra-loi-qua-loa
function isLazyAnswer(val, opts) {
  const minLen = opts?.minLen || 15;
  const minWords = opts?.minWords || 3;
  if (!val) return 'Vui long tra loi day du de minh tu van chinh xac nhe!';
  const v = String(val).trim().toLowerCase();
  if (v.length < minLen) return 'Cau tra loi qua ngan. Hay chia se cu the hon (it nhat ' + minLen + ' ky tu).';
  const words = v.split(/\s+/).filter(w => w.length > 0);
  if (words.length < minWords) return 'Hay viet day du hon, it nhat ' + minWords + ' tu.';
  const flat = v.replace(/\s+/g, '');
  // All same char: "aaaaa", "11111"
  if (/^(.)\1+$/.test(flat)) return 'Cau tra loi nhin nhu danh dai phim. Ban viet that long nhe!';
  // Only digits / symbols
  if (/^[\d\s\.\?\!\-_=*,;:]+$/.test(v)) return 'Vui long mo ta bang chu, dung chi go so/dau cau.';
  // Common lazy phrases (vi - khong dau)
  const lazyExact = [
    'khong biet','k biet','ko biet','chang biet','chua biet','khong ro','khong co',
    'khong co gi','khong biet nua','binh thuong','tuy','sao cung duoc','cung duoc',
    'abc','xyz','asdf','qwerty','test','aaaa','bbbb','1234','12345','...','.....',
    'no','yes','ok','okay','co','khong','chua','chua co','sao','gi','nope','idk',
  ];
  if (lazyExact.includes(v) || lazyExact.includes(flat)) return 'Cau tra loi qua chung chung. Hay chia se cu the hon nhe!';
  // Keyboard mashing detect: 3+ chars but no real word structure (no vowel)
  if (flat.length < 8 && !/[aeiouy]/i.test(flat)) return 'Hay viet day du tieng Viet hoac tieng Anh nhe.';
  return null; // OK
}

function isLazyName(val) {
  if (!val) return 'Vui long nhap ten cua ban.';
  const v = val.trim();
  if (v.length < 2) return 'Ten qua ngan. Vui long nhap day du ten cua ban.';
  // Must contain at least 1 letter (kept simple, allow Vietnamese diacritics)
  if (!/[a-zA-ZaAcCdDeEgGhHiIkKlLmMnNoOpPqQrRsStTuUvVxXyYbBfFjJwWzZáàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ]/.test(v)) {
    return 'Ten phai co it nhat 1 chu cai.';
  }
  const vlow = v.toLowerCase();
  const lazyNames = ['abc','xyz','asd','asdf','qwe','qwerty','test','aaa','bbb','xxx','aaaaa','no name','idk','khong','khong co','blah','none','---'];
  if (lazyNames.includes(vlow)) return 'Ten khong hop le. Vui long nhap ten that.';
  if (/^(.)\1{2,}$/.test(vlow.replace(/\s+/g,''))) return 'Ten qua chung chung. Vui long nhap ten that.';
  // Pure digits
  if (/^\d+$/.test(vlow)) return 'Ten khong duoc chi la so.';
  return null;
}


function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function syncComposerPadding() {
  const h = composerEl.offsetHeight || 80;
  const total = h + 60;
  // Chat padding pushes content up so it's not buried under fixed composer
  chatEl.style.paddingBottom = total + 'px';
  // Body/html is the actual scroller — set scroll-padding-bottom there for anchor scrolls
  document.documentElement.style.scrollPaddingBottom = total + 'px';
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    syncComposerPadding();
    const last = chatEl.lastElementChild;
    if (!last) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      return;
    }
    // Chat <main> is grid 1fr and extends behind the fixed composer — the BODY is the real scroller.
    // Compute exact scroll delta so the last message sits 24px above the composer top.
    const composerH = composerEl.offsetHeight || 80;
    const lastRect = last.getBoundingClientRect();
    const targetBottom = window.innerHeight - composerH - 24;
    const delta = lastRect.bottom - targetBottom;
    if (Math.abs(delta) > 4) {
      window.scrollBy({ top: delta, behavior: 'smooth' });
    }
  });
}

function renderMarkdownInline(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function interpolate(str, vars) {
  return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] != null ? vars[k] : '');
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

async function botSays(text, typingMs) {
  if (typingMs == null) typingMs = 800;
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
  progressText.textContent = answered + ' / ' + total;
}

function clearComposer() { composerEl.innerHTML = ''; }

function renderStartButton() {
  clearComposer();
  const row = document.createElement('div');
  row.className = 'input-row';
  row.innerHTML = '<button class="btn" id="startBtn" style="width:100%">Bắt đầu phỏng vấn →</button>';
  composerEl.appendChild(row);
  syncComposerPadding();
  document.getElementById('startBtn').addEventListener('click', startInterview);
}

function shake(el) {
  el.style.borderColor = '#ff7a7a';
  if (el.animate) {
    el.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
      { duration: 250 }
    );
  }
  setTimeout(function () { el.style.borderColor = ''; }, 800);
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
  const ph = q.placeholder || 'Nhập câu trả lời...';

  if (isLong) {
    row.innerHTML = '<textarea id="answerInput" rows="2" placeholder="' + ph + '"></textarea>' +
      '<button class="btn" id="sendBtn">Gửi</button>';
  } else {
    row.innerHTML = '<input id="answerInput" type="' + inputType + '" inputmode="' + inputMode +
      '" placeholder="' + ph + '" autocomplete="off" />' +
      '<button class="btn" id="sendBtn">Gửi</button>';
  }
  wrap.appendChild(row);

  const errEl = document.createElement('div');
  errEl.className = 'error';
  errEl.id = 'inputError';
  errEl.style.display = 'none';
  wrap.appendChild(errEl);
  composerEl.appendChild(wrap);
  requestAnimationFrame(() => {
    syncComposerPadding();
    requestAnimationFrame(() => scrollToBottom());
  });

  const input = document.getElementById('answerInput');
  const btn = document.getElementById('sendBtn');
  input.focus();

  function showError(msg) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
    shake(input);
    syncComposerPadding();
  }
  function clearError() {
    errEl.style.display = 'none';
    errEl.textContent = '';
    syncComposerPadding();
  }
  input.addEventListener('input', clearError);

  function submit() {
    let val = input.value.trim();

    if (q.required !== false && !val) {
      showError('Vui lòng nhập thông tin để tiếp tục nhé!');
      return;
    }

    if (q.type === 'email') {
      if (!val) { showError('Email là bắt buộc để gửi lộ trình.'); return; }
      if (!EMAIL_RE.test(val)) {
        showError('Email không đúng định dạng. Ví dụ: ten@gmail.com');
        return;
      }
      val = val.toLowerCase();
    }

    if (q.type === 'tel') {
      if (!val) { showError('Vui lòng nhập số điện thoại.'); return; }
      const clean = val.replace(/[\s\-\.\(\)]/g, '');
      if (!PHONE_RE.test(clean)) {
        showError('Số điện thoại không hợp lệ. Ví dụ: 0901234567 hoặc +84901234567');
        return;
      }
      val = clean;
    }

    if (q.type === 'textarea' && q.required !== false) {
      const lazyMsg = isLazyAnswer(val, { minLen: 15, minWords: 3 });
      if (lazyMsg) { showError(lazyMsg); return; }
    }

    // Name field: stricter check (must look like a real name)
    if (q.id === 'name') {
      const nameMsg = isLazyName(val);
      if (nameMsg) { showError(nameMsg); return; }
    }

    clearError();
    handleAnswer(q, val || '(bỏ qua)');
  }

  btn.addEventListener('click', submit);
  input.addEventListener('keydown', function (e) {
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
  q.options.forEach(function (opt) {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.textContent = opt;
    btn.addEventListener('click', function () { handleAnswer(q, opt); });
    wrap.appendChild(btn);
  });
  composerEl.appendChild(wrap);
  // Wait for layout, sync padding, then scroll the latest bot message into view
  requestAnimationFrame(() => {
    syncComposerPadding();
    requestAnimationFrame(() => scrollToBottom());
  });
}

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
    card.innerHTML =
      '<div class="avatar">🧠</div>' +
      '<div class="bubble" style="max-width: 85%;">' +
      '<div class="success-card">' +
      '<h3>Phân tích cá nhân hoá</h3>' +
      '<div class="bubble-text">' + renderMarkdownInline(analysis) + '</div>' +
      '</div></div>';
    chatEl.appendChild(card);
    scrollToBottom();
  } else {
    addBotMessage('⚠️ Không thể tạo phân tích AI lúc này, nhưng thông tin của bạn đã được lưu lại. Đội ngũ sẽ liên hệ sớm!');
  }

  const row = document.createElement('div');
  row.className = 'input-row';
  row.innerHTML =
    '<button class="btn btn-secondary" id="restartBtn" style="flex:1;">Phỏng vấn lại</button>' +
    '<button class="btn" id="ctaBtn" style="flex:1;">Tham gia ngay</button>';
  composerEl.appendChild(row);
  syncComposerPadding();
  document.getElementById('restartBtn').addEventListener('click', function () { location.reload(); });
  document.getElementById('ctaBtn').addEventListener('click', function () {
    const name = encodeURIComponent(state.answers.name || '');
    const email = encodeURIComponent(state.answers.email || '');
    window.open('https://arado.ink/from-bot.html?name=' + name + '&email=' + email + '&from=bot', '_blank');
  });
}

(async function init() {
  try {
    await loadQuestions();
    await showIntro();
  } catch (err) {
    console.error(err);
    addBotMessage('⚠️ Có lỗi khi tải câu hỏi. Vui lòng tải lại trang.');
  }
})();

window.addEventListener('resize', function () { syncComposerPadding(); });
if (typeof ResizeObserver !== 'undefined') {
  let lastH = 0;
  new ResizeObserver(function () {
    syncComposerPadding();
    const nh = composerEl.offsetHeight || 0;
    // If composer just grew taller (e.g., choices appeared), re-anchor the chat to the latest message
    if (nh > lastH + 20) scrollToBottom();
    lastH = nh;
  }).observe(composerEl);
}

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
      // OTP: gửi mã + show OTP input, chỉ proceed sau khi verified
      clearError();
      requestOtpAndVerify(val, q, btn);
      return; // chặn handleAnswer ở dưới — sẽ gọi từ trong OTP flow
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

    if (q.type === 'textarea' && q.required !== false && val.length < 5) {
      showError('Hãy chia sẻ chi tiết hơn một chút (ít nhất 5 ký tự).');
      return;
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
  document.getElementById('ctaBtn').addEventListener('click', async function () {
    const btn = this;
    const name = state.answers.name || '';
    const email = state.answers.email || '';
    if (!email) {
      // Fallback nếu thiếu email
      window.open('https://arado.ink', '_blank');
      return;
    }
    btn.disabled = true;
    btn.textContent = '⏳ Đang gửi link đăng nhập...';
    try {
      const r = await fetch('/api/grant-arado-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, name: name })
      });
      const j = await r.json();
      if (j.ok) {
        const success = document.createElement('div');
        success.className = 'msg msg-bot';
        success.innerHTML =
          '<div class="avatar">🚀</div>' +
          '<div class="bubble" style="max-width:88%">' +
          '<div class="success-card" style="background:linear-gradient(135deg, rgba(212,175,110,0.18), rgba(212,175,110,0.05));border:1px solid rgba(212,175,110,0.35);padding:18px;border-radius:12px">' +
          '<h3 style="color:#d4af6e;margin:0 0 8px;font-size:18px">📧 Đã gửi link đăng nhập!</h3>' +
          '<p style="margin:0 0 10px;font-size:14px;line-height:1.6">' +
          'Mình vừa gửi <b>link đăng nhập tự động</b> vào email <b>' + email + '</b>.<br>' +
          'Bấm vào link đó → <b>vào dashboard AVA Study ngay</b>, không cần tạo mật khẩu.' +
          '</p>' +
          '<p style="margin:0;font-size:12px;color:#999">⏰ Link có hiệu lực 1 giờ. Check inbox + Spam nhé!</p>' +
          '</div></div>';
        chatEl.appendChild(success);
        const row = btn.closest('.input-row');
        if (row) row.remove();
        scrollToBottom();
      } else {
        btn.disabled = false;
        btn.textContent = '🔄 Thử lại';
        const err = document.createElement('div');
        err.style.cssText = 'color:#ef4444;font-size:13px;margin-top:10px;text-align:center';
        err.textContent = '❌ ' + (j.error || 'Lỗi gửi link');
        const row = btn.closest('.input-row');
        if (row && row.parentElement) row.parentElement.insertBefore(err, row.nextSibling);
      }
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Thử lại';
      addBotMessage('⚠️ Lỗi mạng: ' + e.message + '. Bạn có thể vào trực tiếp arado.ink');
    }
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

// ============================================
// OTP EMAIL VERIFICATION
// ============================================
async function requestOtpAndVerify(email, emailQ, sendBtn) {
  // Disable original Send button while sending OTP
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '⏳ Đang gửi OTP...'; }
  let r, j;
  try {
    r = await fetch('/api/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    j = await r.json();
  } catch (e) {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Gửi'; }
    const errEl = document.getElementById('inputError');
    if (errEl) { errEl.textContent = 'Lỗi mạng: ' + e.message; errEl.style.display = 'block'; }
    return;
  }
  if (!j.ok) {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Gửi'; }
    const errEl = document.getElementById('inputError');
    if (errEl) { errEl.textContent = j.error || 'Không gửi được OTP'; errEl.style.display = 'block'; }
    return;
  }
  // Lưu email tạm
  state.answers[emailQ.id] = email;
  addUserMessage(email);
  clearComposer();
  await botSays('📧 Mình vừa gửi <b>mã 6 số</b> vào <b>' + email + '</b>. Check inbox (hoặc thư mục Spam/Promotions) và nhập mã dưới đây để xác thực nhé. Mã có hiệu lực <b>5 phút</b>.', 600);
  renderOtpInput(email, emailQ);
}

function renderOtpInput(email, emailQ) {
  clearComposer();
  const wrap = document.createElement('div');
  wrap.style.width = '100%';
  const row = document.createElement('div');
  row.className = 'input-row';
  row.innerHTML =
    '<input id="otpInput" type="text" inputmode="numeric" maxlength="6" placeholder="Nhập 6 số" ' +
    'autocomplete="one-time-code" style="font-size:22px;letter-spacing:8px;text-align:center" />' +
    '<button class="btn" id="otpSubmitBtn">Xác thực</button>';
  wrap.appendChild(row);

  const meta = document.createElement('div');
  meta.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:13px';
  meta.innerHTML =
    '<span id="otpStatus" style="color:#888"></span>' +
    '<button id="otpResendBtn" style="background:none;border:none;color:#d4af6e;cursor:pointer;font-size:13px;font-weight:600" disabled>Gửi lại (60s)</button>';
  wrap.appendChild(meta);

  composerEl.appendChild(wrap);
  requestAnimationFrame(() => { syncComposerPadding(); scrollToBottom(); });

  const input = document.getElementById('otpInput');
  const btn = document.getElementById('otpSubmitBtn');
  const statusEl = document.getElementById('otpStatus');
  const resendBtn = document.getElementById('otpResendBtn');
  input.focus();

  // Cooldown 60s cho nút "Gửi lại"
  function startCooldown() {
    let n = 60;
    resendBtn.disabled = true;
    resendBtn.textContent = 'Gửi lại (' + n + 's)';
    const t = setInterval(() => {
      n--;
      if (n <= 0) { clearInterval(t); resendBtn.disabled = false; resendBtn.textContent = '🔄 Gửi lại mã'; }
      else { resendBtn.textContent = 'Gửi lại (' + n + 's)'; }
    }, 1000);
  }
  startCooldown();

  async function submitOtp() {
    const code = (input.value || '').trim();
    if (!/^\d{6}$/.test(code)) {
      statusEl.style.color = '#ef4444';
      statusEl.textContent = '⚠ Nhập đúng 6 số';
      return;
    }
    btn.disabled = true;
    btn.textContent = '⏳';
    statusEl.style.color = '#888';
    statusEl.textContent = 'Đang xác thực...';
    let j;
    try {
      const r = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code })
      });
      j = await r.json();
    } catch (e) {
      statusEl.style.color = '#ef4444';
      statusEl.textContent = '⚠ Lỗi mạng';
      btn.disabled = false; btn.textContent = 'Xác thực';
      return;
    }
    if (!j.ok) {
      statusEl.style.color = '#ef4444';
      statusEl.textContent = '❌ ' + (j.error || 'Sai mã');
      shake(input);
      btn.disabled = false; btn.textContent = 'Xác thực';
      input.select();
      return;
    }
    // Pass — đi tiếp câu tiếp theo
    clearComposer();
    addUserMessage('✓ Đã xác thực email');
    state.answers._email_verified = true;
    state.idx += 1;
    updateProgress();
    setTimeout(() => askNext(), 400);
  }

  btn.addEventListener('click', submitOtp);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submitOtp(); });

  resendBtn.addEventListener('click', async () => {
    if (resendBtn.disabled) return;
    resendBtn.disabled = true;
    resendBtn.textContent = 'Đang gửi...';
    statusEl.style.color = '#888';
    statusEl.textContent = 'Đang gửi mã mới...';
    try {
      const r = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const j = await r.json();
      if (j.ok) {
        statusEl.style.color = '#16a34a';
        statusEl.textContent = '✓ Đã gửi mã mới';
        startCooldown();
      } else {
        statusEl.style.color = '#ef4444';
        statusEl.textContent = '⚠ ' + (j.error || 'Lỗi');
        resendBtn.disabled = false;
        resendBtn.textContent = '🔄 Thử lại';
      }
    } catch (e) {
      statusEl.style.color = '#ef4444';
      statusEl.textContent = '⚠ Lỗi mạng';
      resendBtn.disabled = false;
      resendBtn.textContent = '🔄 Thử lại';
    }
  });
}

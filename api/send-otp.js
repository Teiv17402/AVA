/* /api/send-otp - Gen 6-digit OTP, save DB, send email via Resend
 * Rate limit: 3 requests / 10 min / IP
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND = process.env.RESEND_API_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!supabase) {
    return res.status(500).json({ ok: false, error: 'Supabase not configured' });
  }
  if (!RESEND) {
    return res.status(500).json({ ok: false, error: 'Email service not configured' });
  }

  const { email } = req.body || {};
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'Email không hợp lệ' });
  }
  const e = email.toLowerCase().trim();
  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim()
    || req.headers['x-real-ip'] || 'unknown';

  // Rate limit: max 3 OTP / 10 phút / IP
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recent, error: rateErr } = await supabase
    .from('interview_otp')
    .select('email')
    .eq('ip', ip)
    .gte('created_at', tenMinAgo);
  if (rateErr) console.error('[rate-limit query]', rateErr);
  if ((recent || []).length >= 3) {
    return res.status(429).json({
      ok: false,
      error: 'Đã yêu cầu OTP quá nhiều lần. Đợi 10 phút rồi thử lại.'
    });
  }

  // Gen 6-digit OTP
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 min TTL

  // Upsert (1 active OTP per email)
  const { error: upErr } = await supabase.from('interview_otp').upsert({
    email: e,
    code,
    expires_at: expiresAt,
    attempts: 0,
    ip,
    created_at: new Date().toISOString()
  }, { onConflict: 'email' });
  if (upErr) {
    console.error('[upsert OTP]', upErr);
    return res.status(500).json({ ok: false, error: 'Lưu OTP thất bại' });
  }

  // Send email via Resend
  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'AVA Study <noreply@arado.ink>',
        to: [e],
        subject: code + ' - Mã xác thực phỏng vấn AVA',
        html: `
          <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2 style="color:#d4af6e;margin:0 0 10px">🔐 Mã xác thực phỏng vấn</h2>
            <p style="color:#333;font-size:14px;line-height:1.5">
              Bạn đang đăng ký phỏng vấn vào <b>21D AI Challenge</b>.<br>
              Nhập mã 6 số dưới đây vào bot để tiếp tục:
            </p>
            <div style="font-size:42px;font-weight:700;letter-spacing:10px;background:#f5f0e6;color:#1a1400;padding:24px;border-radius:10px;text-align:center;margin:18px 0;font-family:monospace">${code}</div>
            <p style="color:#666;font-size:13px">⏱ Mã có hiệu lực <b>5 phút</b>. Không chia sẻ cho ai.</p>
            <p style="color:#999;font-size:11px;margin-top:18px;border-top:1px solid #eee;padding-top:12px">
              Nếu không phải bạn yêu cầu — bỏ qua email này.
            </p>
          </div>
        `
      })
    });
    if (!emailRes.ok) {
      const errBody = await emailRes.text().catch(() => '');
      console.error('[resend]', emailRes.status, errBody.slice(0, 200));
      return res.status(500).json({ ok: false, error: 'Không gửi được email — thử lại.' });
    }
  } catch (err) {
    console.error('[resend exception]', err.message);
    return res.status(500).json({ ok: false, error: 'Lỗi mạng khi gửi email.' });
  }

  return res.status(200).json({
    ok: true,
    expires_in: 300,
    message: 'OTP đã gửi vào email'
  });
};

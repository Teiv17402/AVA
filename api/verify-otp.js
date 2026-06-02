/* /api/verify-otp - Verify 6-digit OTP code
 * Max 3 wrong attempts then auto-delete row → user phải gửi mã mới
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!supabase) {
    return res.status(500).json({ ok: false, error: 'Supabase not configured' });
  }

  const { email, code } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ ok: false, error: 'Thiếu email hoặc mã' });
  }
  const e = String(email).toLowerCase().trim();
  const c = String(code).trim();

  if (!/^\d{6}$/.test(c)) {
    return res.status(400).json({ ok: false, error: 'Mã phải là 6 chữ số' });
  }

  const { data: row, error: fetchErr } = await supabase
    .from('interview_otp')
    .select('*')
    .eq('email', e)
    .maybeSingle();

  if (fetchErr) {
    console.error('[fetch OTP]', fetchErr);
    return res.status(500).json({ ok: false, error: 'Lỗi DB' });
  }
  if (!row) {
    return res.status(400).json({ ok: false, error: 'Không có mã OTP — bấm "Gửi lại mã".' });
  }
  if (row.expires_at < Date.now()) {
    await supabase.from('interview_otp').delete().eq('email', e);
    return res.status(400).json({ ok: false, error: 'Mã đã hết hạn — bấm "Gửi lại mã".' });
  }
  if (row.attempts >= 3) {
    await supabase.from('interview_otp').delete().eq('email', e);
    return res.status(400).json({ ok: false, error: 'Sai mã 3 lần — bấm "Gửi lại mã".' });
  }
  if (row.code !== c) {
    const newAttempts = row.attempts + 1;
    await supabase.from('interview_otp').update({ attempts: newAttempts }).eq('email', e);
    const left = 3 - newAttempts;
    return res.status(400).json({
      ok: false,
      error: left > 0 ? `Sai mã. Còn ${left} lần thử.` : 'Sai mã 3 lần — bấm "Gửi lại mã".',
      attempts_left: left
    });
  }

  // Pass — xóa OTP để dùng 1 lần
  await supabase.from('interview_otp').delete().eq('email', e);
  return res.status(200).json({ ok: true, verified: true });
};

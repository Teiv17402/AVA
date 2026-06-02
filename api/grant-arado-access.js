/* /api/grant-arado-access
 * Sau khi user complete phỏng vấn (đã OTP verify):
 * 1. Verify lead exists trong interview_leads
 * 2. Create/get Supabase auth user
 * 3. Generate magic link → gửi vào email user
 * → User click → tự động login vào arado.ink
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND = process.env.RESEND_API_KEY;
const REDIRECT_URL = 'https://arado.ink/home.html?from=bot';

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!supabase) return res.status(500).json({ ok: false, error: 'Supabase not configured' });
  if (!RESEND) return res.status(500).json({ ok: false, error: 'Email service not configured' });

  const { email, name } = req.body || {};
  if (!email) return res.status(400).json({ ok: false, error: 'Missing email' });
  const e = String(email).toLowerCase().trim();
  const displayName = String(name || '').trim() || e.split('@')[0];

  // 1. Verify lead exists (interview within last 2h)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: lead, error: leadErr } = await supabase
    .from('interview_leads')
    .select('id, email, name')
    .eq('email', e)
    .gte('created_at', twoHoursAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (leadErr) {
    console.error('[lead check]', leadErr);
    return res.status(500).json({ ok: false, error: 'Lỗi kiểm tra lead' });
  }
  if (!lead) {
    return res.status(400).json({ ok: false, error: 'Không tìm thấy lead — vui lòng phỏng vấn lại trong 2h gần đây.' });
  }

  // 2. Create or get Supabase auth user
  let isNew = false;
  let userId = null;
  try {
    const { data: existingList } = await supabase.auth.admin.listUsers({
      page: 1, perPage: 1000
    });
    const existing = (existingList?.users || []).find(u => (u.email || '').toLowerCase() === e);
    if (existing) {
      userId = existing.id;
    } else {
      const randPwd = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12) + 'Aa1!';
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: e,
        email_confirm: true,
        password: randPwd,
        user_metadata: { full_name: displayName, source: 'ava-bot', source_lead_id: lead.id }
      });
      if (createErr) {
        console.error('[createUser]', createErr);
        return res.status(500).json({ ok: false, error: 'Tạo tài khoản thất bại: ' + createErr.message });
      }
      userId = created?.user?.id;
      isNew = true;
    }
  } catch (err) {
    console.error('[user check/create]', err.message);
    return res.status(500).json({ ok: false, error: 'Lỗi xử lý user: ' + err.message });
  }

  // 3. Generate magic link
  let magicUrl = '';
  try {
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: e,
      options: { redirectTo: REDIRECT_URL }
    });
    if (linkErr || !linkData?.properties?.action_link) {
      console.error('[generateLink]', linkErr);
      return res.status(500).json({ ok: false, error: 'Không tạo được magic link' });
    }
    magicUrl = linkData.properties.action_link;
  } catch (err) {
    console.error('[generateLink exception]', err.message);
    return res.status(500).json({ ok: false, error: 'Lỗi gen magic link' });
  }

  // 4. Send email via Resend
  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'AVA Study <noreply@arado.ink>',
        to: [e],
        subject: `🎯 ${displayName}, vào học AVA Study — link đăng nhập`,
        html: `
          <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:540px;margin:0 auto;padding:24px;background:#0a0a0a;color:#eee">
            <h2 style="color:#d4af6e;margin:0 0 12px">Chào ${displayName}! 👋</h2>
            <p style="font-size:15px;line-height:1.6;color:#ccc;margin:0 0 18px">
              Cảm ơn bạn đã hoàn thành phỏng vấn vào <b>21D AI Challenge</b>.<br>
              Bấm nút bên dưới để vào dashboard học ngay — <b>không cần tạo mật khẩu</b>:
            </p>
            <p style="text-align:center;margin:28px 0">
              <a href="${magicUrl}" style="display:inline-block;background:#d4af6e;color:#1a1400;font-weight:800;padding:16px 42px;border-radius:8px;text-decoration:none;font-size:16px;letter-spacing:0.3px">
                🚀 VÀO HỌC NGAY
              </a>
            </p>
            <p style="font-size:13px;color:#888;line-height:1.6">
              ⏰ Link có hiệu lực <b>1 giờ</b>. Click vào sẽ tự động đăng nhập vào tài khoản đã được tạo sẵn cho bạn.
            </p>
            <hr style="border:0;border-top:1px solid #222;margin:20px 0">
            <p style="font-size:11px;color:#666;line-height:1.5">
              Nếu nút không bấm được, copy link này dán vào trình duyệt:<br>
              <code style="font-size:10px;word-break:break-all;color:#999">${magicUrl}</code>
            </p>
            <p style="font-size:11px;color:#555;margin-top:18px">
              Email này chỉ gửi tới những ai đã đăng ký phỏng vấn. Nếu không phải bạn, vui lòng bỏ qua.
            </p>
          </div>
        `
      })
    });
    if (!emailRes.ok) {
      const errBody = await emailRes.text().catch(() => '');
      console.error('[resend]', emailRes.status, errBody.slice(0, 300));
      return res.status(500).json({ ok: false, error: 'Gửi email thất bại' });
    }
  } catch (err) {
    console.error('[resend exception]', err.message);
    return res.status(500).json({ ok: false, error: 'Lỗi mạng khi gửi email' });
  }

  return res.status(200).json({
    ok: true,
    isNew,
    userId,
    email: e,
    message: 'Đã gửi link đăng nhập vào email'
  });
};

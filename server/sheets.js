/* Google Sheets writer via Apps Script Webhook
 *
 * Setup:
 *   1. Tao Google Sheet
 *   2. Extensions -> Apps Script -> dan code apps-script.gs
 *   3. Deploy as Web app -> quyen "Anyone" -> copy Web app URL
 *   4. Set GOOGLE_SHEETS_WEBHOOK_URL trong .env
 */

const HEADER_KEYS = [
  'submittedAt',
  'name',
  'email',
  'phone',
  'occupation',
  'ai_level',
  'goal',
  'pain_point',
  'time_commit',
  'budget',
  'expectation',
  'channel',
  'ai_analysis',
];

async function appendInterview({ answers, submittedAt, analysis }) {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error('GOOGLE_SHEETS_WEBHOOK_URL is not configured');
  }

  const row = HEADER_KEYS.map((k) => {
    if (k === 'submittedAt') return submittedAt || new Date().toISOString();
    if (k === 'ai_analysis') return analysis || '';
    return answers?.[k] || '';
  });

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ row }),
    redirect: 'follow',
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Apps Script error ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json().catch(() => ({}));
  if (data && data.ok === false) {
    throw new Error(`Apps Script returned error: ${data.error || 'unknown'}`);
  }
}

module.exports = { appendInterview };

/* 21D AI Challenge - Supabase data layer
 * Replaces server/sheets.js
 * Saves each interview to public.interview_leads table.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
} else {
  console.warn('[supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — data will NOT be saved.');
}

/**
 * Append one interview record to Supabase.
 * Keeps the same signature as the old appendInterview from sheets.js
 * so server/index.js doesn't need other changes.
 */
async function appendInterview({ answers, submittedAt, analysis, segment }) {
  if (!supabase) {
    throw new Error('Supabase client not configured (missing env vars).');
  }

  const row = {
    name: answers?.name || null,
    email: answers?.email || null,
    phone: answers?.phone || null,
    answers: answers || null,
    ai_analysis: analysis || null,
    metadata: {
      submittedAt: submittedAt || new Date().toISOString(),
      segment: segment || 'newbie',
    },
  };

  const { data, error } = await supabase
    .from('interview_leads')
    .insert([row])
    .select()
    .single();

  if (error) {
    console.error('[supabase] insert error:', error);
    throw new Error(error.message);
  }

  console.log('[supabase] saved lead id:', data.id);
  return data;
}

module.exports = { appendInterview };

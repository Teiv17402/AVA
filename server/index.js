/* 21D AI Challenge - Interview Bot Server
 * Serves static frontend + POST /api/submit endpoint
 * that calls Gemini for analysis and forwards data to Apps Script webhook.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const { analyzeInterview } = require('./gemini');
const { appendInterview } = require('./supabase');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Main endpoint
app.post('/api/submit', async (req, res) => {
  const { answers, submittedAt } = req.body || {};

  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ ok: false, error: 'answers is required' });
  }
  if (!answers.name || !answers.email) {
    return res.status(400).json({ ok: false, error: 'name and email required' });
  }

  let analysis = null;
  let analysisError = null;
  try {
    analysis = await analyzeInterview(answers);
  } catch (err) {
    analysisError = err.message;
    console.error('[gemini]', err.message);
  }

  let savedToSheet = false;
  try {
    await appendInterview({ answers, submittedAt, analysis });
    savedToSheet = true;
  } catch (err) {
    console.error('[sheets]', err.message);
  }

  return res.json({
    ok: true,
    analysis,
    savedToSheet,
    analysisError,
  });
});

// Friendly fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('Interview bot running on http://localhost:' + PORT);
  console.log('   Gemini key:     ' + (process.env.GEMINI_API_KEY ? 'set' : 'MISSING'));
  console.log('   Supabase:       ' + (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING'));
});

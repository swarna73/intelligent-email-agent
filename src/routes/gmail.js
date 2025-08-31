// src/routes/gmail.js (or routes/gmail.js)
const express = require('express');
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();

/* ----------------------------- OAuth2 Client ----------------------------- */
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI // e.g. http://localhost:3000/api/gmail/callback
);

/* ----------------------------- Gmail Scopes ------------------------------ */
// Readonly is safest. Use gmail.modify if you plan to label/move messages.
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly'
];

/* --------------------------- Token Persistence --------------------------- */
const TOKENS_DIR = path.join(process.cwd(), 'data');
const TOKENS_FILE = path.join(TOKENS_DIR, 'gmail_tokens.json');

async function ensureDir(dir) {
  try { await fs.mkdir(dir, { recursive: true }); } catch {}
}

async function saveTokens(tokens) {
  await ensureDir(TOKENS_DIR);
  await fs.writeFile(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf8');
  console.log('💾 Saved Gmail tokens to', TOKENS_FILE);
}

async function loadTokens() {
  try {
    const raw = await fs.readFile(TOKENS_FILE, 'utf8');
    const tokens = JSON.parse(raw);
    oauth2Client.setCredentials(tokens); // enables auto refresh via refresh_token
    console.log('✅ Gmail tokens loaded');
    return true;
  } catch {
    console.log('ℹ️  No saved Gmail tokens found');
    return false;
  }
}

/* ------------------------------ Auth Routes ----------------------------- */
// Start the OAuth flow
router.get('/auth', async (_req, res) => {
  try {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',           // required for refresh_token
      prompt: 'consent',                // force refresh_token on first run
      scope: SCOPES,
    });
    res.redirect(url);
  } catch (err) {
    console.error('Auth URL error:', err);
    res.status(500).send('Failed to initiate Google OAuth.');
  }
});

// OAuth callback (MUST match GOOGLE_REDIRECT_URI)
router.get('/callback', async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error) {
      return res.status(400).send(`
        <h1>❌ Authorization Denied</h1>
        <p>Error: ${error}</p>
        <a href="/api/gmail/auth">Try Again</a>
      `);
    }
    if (!code) {
      return res.status(400).send(`
        <h1>❌ Authorization Failed</h1>
        <p>No authorization code received from Google.</p>
        <a href="/api/gmail/auth">Try Again</a>
      `);
    }

    console.log('✅ Received authorization code:', String(code).slice(0, 20) + '…');

    // Exchange code → tokens (includes refresh_token on first consent)
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens || !tokens.access_token) {
      throw new Error('No access token received from Google');
    }

    // Persist and set credentials
    await saveTokens(tokens);
    oauth2Client.setCredentials(tokens);

    // Quick connection test
    const gmailAuthed = google.gmail({ version: 'v1', auth: oauth2Client });
    let testHtml = '';
    try {
      const profile = await gmailAuthed.users.getProfile({ userId: 'me' });
      testHtml = `<p style="color:green">✅ Connected as <b>${profile.data.emailAddress}</b> • Total messages: ${profile.data.messagesTotal}</p>`;
    } catch (testErr) {
      console.error('Profile check failed:', testErr);
      testHtml = `<p style="color:orange">⚠️ Tokens saved, but profile check failed: ${testErr.message}</p>`;
    }

    // Friendly success page
    res.send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8"/>
          <title>Gmail Connected</title>
          <style>
            body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; max-width: 820px; margin: 60px auto; padding: 0 20px; }
            .btn { display:inline-block; background:#111; color:#fff; padding:10px 16px; border-radius:8px; text-decoration:none; margin-right:8px; }
            .btn.secondary { background:#555; }
            .card { background:#f6f7f8; padding:16px; border-radius:10px; margin:18px 0; }
            code { background:#eee; padding:2px 6px; border-radius:6px; }
          </style>
        </head>
        <body>
          <h1>🎉 Gmail Successfully Connected</h1>
          <div class="card">${testHtml}</div>
          <div class="card">
            <a class="btn" href="/api/gmail/test">🔍 Test Connection</a>
            <a class="btn" href="/api/gmail/emails">📥 View Recent Emails</a>
            <a class="btn secondary" href="/">🏠 Back to Dashboard</a>
          </div>
          <div class="card">
            <b>Debug</b><br/>
            Access Token: ${tokens.access_token ? '✅ present' : '❌ missing'}<br/>
            Refresh Token: ${tokens.refresh_token ? '✅ present' : '❌ missing (revoke access & re-consent)'}<br/>
            Expires: ${tokens.expiry_date ? new Date(tokens.expiry_date).toLocaleString() : 'unknown'}<br/>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('OAuth callback failed:', err);
    res.status(500).send(`
      <h1>❌ Authorization Failed</h1>
      <p>${err.message}</p>
      <p><a href="/api/gmail/auth">Try Again</a></p>
    `);
  }
});

/* --------------------------- Utility/Test Routes ------------------------ */
// Verify we can call Gmail with stored tokens
router.get('/test', async (_req, res) => {
  try {
    const hasTokens = await loadTokens();
    if (!hasTokens) {
      return res.status(401).send('Not authenticated with Google. Visit <a href="/api/gmail/auth">/api/gmail/auth</a>.');
    }
    const gmailAuthed = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmailAuthed.users.getProfile({ userId: 'me' });
    res.json({
      email: profile.data.emailAddress,
      messagesTotal: profile.data.messagesTotal,
      threadsTotal: profile.data.threadsTotal,
    });
  } catch (err) {
    console.error('/test failed:', err);
    res.status(500).send(err.message);
  }
});

// List a few recent emails
router.get('/emails', async (req, res) => {
  try {
    const hasTokens = await loadTokens();
    if (!hasTokens) {
      return res.status(401).send('Not authenticated with Google. Visit <a href="/api/gmail/auth">/api/gmail/auth</a>.');
    }

    const maxResults = Number(req.query.max || 10);
    const gmailAuthed = google.gmail({ version: 'v1', auth: oauth2Client });

    const listResp = await gmailAuthed.users.messages.list({
      userId: 'me',
      maxResults,
      q: 'in:inbox',
    });

    const messages = listResp.data.messages || [];
    const details = [];
    for (const msg of messages) {
      const full = await gmailAuthed.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date']
      });
      const headers = full.data.payload?.headers || [];
      const get = (name) => headers.find(h => h.name === name)?.value || '';
      details.push({
        id: msg.id,
        snippet: full.data.snippet || '',
        from: get('From'),
        to: get('To'),
        subject: get('Subject'),
        date: get('Date')
      });
    }

    res.json({ count: details.length, messages: details });
  } catch (err) {
    console.error('/emails failed:', err);
    res.status(500).send(err.message);
  }
});

/* ------------------------------ Export Router --------------------------- */
module.exports = router;

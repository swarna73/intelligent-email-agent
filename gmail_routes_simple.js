const express = require('express');
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();

// Gmail OAuth setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify'
];

// Start Gmail OAuth flow
router.get('/auth', (req, res) => {
  try {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });

    res.json({ 
      success: true,
      authUrl,
      message: 'Click the URL to authorize Gmail access'
    });
  } catch (error) {
    console.error('Auth URL generation failed:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// Handle OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).send(`
        <h1>❌ Authorization Failed</h1>
        <p>No authorization code received from Google.</p>
        <a href="/api/gmail/auth">Try Again</a>
      `);
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getAccessToken(code);
    oauth2Client.setCredentials(tokens);

    // Save tokens to file
    await saveTokens(tokens);

    res.send(`
      <h1>✅ Gmail Connected Successfully!</h1>
      <p>Your Email Agent can now access Gmail.</p>
      <h3>Next Steps:</h3>
      <ul>
        <li><a href="/api/gmail/test">Test Gmail Connection</a></li>
        <li><a href="/api/gmail/emails">Fetch Recent Emails</a></li>
        <li><a href="/">Return to Dashboard</a></li>
      </ul>
    `);

  } catch (error) {
    console.error('OAuth callback failed:', error);
    res.status(500).send(`
      <h1>❌ Authorization Failed</h1>
      <p>Error: ${error.message}</p>
      <a href="/api/gmail/auth">Try Again</a>
    `);
  }
});

// Test Gmail connection
router.get('/test', async (req, res) => {
  try {
    // Load saved tokens
    const tokensLoaded = await loadTokens();
    if (!tokensLoaded) {
      return res.json({
        success: false,
        error: 'Gmail not authorized',
        message: 'Please authorize Gmail access first',
        authUrl: '/api/gmail/auth'
      });
    }

    // Test API call - get user profile
    const profile = await gmail.users.getProfile({ userId: 'me' });
    
    res.json({
      success: true,
      message: 'Gmail connection successful!',
      profile: {
        email: profile.data.emailAddress,
        messagesTotal: profile.data.messagesTotal,
        threadsTotal: profile.data.threadsTotal
      }
    });

  } catch (error) {
    console.error('Gmail test failed:', error);
    res.status(500).json({ 
      success: false,
      error: 'Gmail connection failed',
      message: error.message 
    });
  }
});

// Fetch recent emails
router.get('/emails', async (req, res) => {
  try {
    // Load tokens
    const tokensLoaded = await loadTokens();
    if (!tokensLoaded) {
      return res.json({
        success: false,
        error: 'Gmail not authorized',
        authUrl: '/api/gmail/auth'
      });
    }

    const maxResults = parseInt(req.query.maxResults) || 10;

    // Get message list
    const messagesResponse = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: 'in:inbox' // Only inbox emails
    });

    if (!messagesResponse.data.messages) {
      return res.json({
        success: true,
        emails: [],
        message: 'No emails found'
      });
    }

    // Get detailed email data
    const emails = [];
    
    for (const message of messagesResponse.data.messages.slice(0, 5)) { // Limit to 5 for demo
      try {
        const emailDetail = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        });

        const headers = emailDetail.data.payload.headers;
        const getHeader = (name) => {
          const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
          return header ? header.value : '';
        };

        const email = {
          id: message.id,
          subject: getHeader('subject'),
          from: getHeader('from'),
          to: getHeader('to'),
          date: getHeader('date'),
          snippet: emailDetail.data.snippet,
          isUnread: emailDetail.data.labelIds?.includes('UNREAD') || false
        };

        emails.push(email);
      } catch (error) {
        console.error(`Failed to fetch email ${message.id}:`, error.message);
      }
    }

    res.json({
      success: true,
      count: emails.length,
      emails,
      message: `Fetched ${emails.length} recent emails`
    });

  } catch (error) {
    console.error('Failed to fetch emails:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch emails',
      message: error.message 
    });
  }
});

// Helper functions
async function saveTokens(tokens) {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, 'gmail_tokens.json'),
      JSON.stringify(tokens, null, 2)
    );
    console.log('✅ Gmail tokens saved successfully');
  } catch (error) {
    console.error('Failed to save tokens:', error);
  }
}

async function loadTokens() {
  try {
    const tokenPath = path.join(process.cwd(), 'data', 'gmail_tokens.json');
    const tokens = JSON.parse(await fs.readFile(tokenPath, 'utf8'));
    oauth2Client.setCredentials(tokens);
    console.log('✅ Gmail tokens loaded successfully');
    return true;
  } catch (error) {
    console.log('ℹ️  No saved Gmail tokens found');
    return false;
  }
}

module.exports = router;
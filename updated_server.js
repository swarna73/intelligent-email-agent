const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

class EmailAgentServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        version: '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    // Main dashboard
    this.app.get('/', (req, res) => {
      const hasOpenAI = !!process.env.OPENAI_API_KEY;
      const hasGoogleAuth = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
      
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>🤖 Intelligent Email Agent</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .status { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
            .status.good { background: #d4edda; color: #155724; }
            .status.bad { background: #f8d7da; color: #721c24; }
            .api-section { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .buttons { margin: 30px 0; }
            .btn { display: inline-block; padding: 12px 24px; margin: 8px; background: #007bff; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; }
            .btn:hover { background: #0056b3; }
            .btn.secondary { background: #6c757d; }
            .feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 30px 0; }
            .feature { background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #007bff; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🤖 Intelligent Email Agent</h1>
            <p>AI-powered email management with smart categorization and auto-responses</p>
            
            <div class="api-section">
              <h3>🔑 API Configuration Status</h3>
              <ul>
                <li>OpenAI API: <span class="status ${hasOpenAI ? 'good' : 'bad'}">${hasOpenAI ? '✅ Connected' : '❌ Missing'}</span></li>
                <li>Google OAuth: <span class="status ${hasGoogleAuth ? 'good' : 'bad'}">${hasGoogleAuth ? '✅ Configured' : '❌ Missing'}</span></li>
              </ul>
              ${!hasOpenAI || !hasGoogleAuth ? '<p><strong>⚠️ Configure missing API keys in your .env file to unlock all features</strong></p>' : ''}
            </div>

            <div class="feature-grid">
              <div class="feature">
                <h4>📧 Gmail Integration</h4>
                <p>Connect your Gmail account to fetch and analyze emails</p>
              </div>
              <div class="feature">
                <h4>🎯 Smart Categorization</h4>
                <p>AI automatically sorts emails into work, personal, urgent, etc.</p>
              </div>
              <div class="feature">
                <h4>⚡ Urgency Detection</h4>
                <p>Intelligent scoring system identifies high-priority emails</p>
              </div>
              <div class="feature">
                <h4>✍️ Auto-Responses</h4>
                <p>Generate professional email replies with AI assistance</p>
              </div>
            </div>

            <div class="buttons">
              <h3>🚀 Quick Actions</h3>
              ${hasGoogleAuth ? '<a href="/api/gmail/auth" class="btn">📧 Connect Gmail</a>' : ''}
              <a href="/api/gmail/test" class="btn secondary">🔍 Test Gmail Connection</a>
              <a href="/api/gmail/emails" class="btn secondary">📥 View Recent Emails</a>
              <a href="/health" class="btn secondary">❤️ Health Check</a>
            </div>

            <div class="api-section">
              <h3>🛠 Developer API Endpoints</h3>
              <ul>
                <li><code>GET /api/gmail/emails</code> - Fetch recent emails</li>
                <li><code>POST /api/agent/categorize</code> - Categorize single email</li>
                <li><code>POST /api/agent/urgency</code> - Calculate urgency score</li>
                <li><code>POST /api/agent/respond</code> - Generate email response</li>
                <li><code>POST /api/agent/process-batch</code> - Process multiple emails</li>
              </ul>
            </div>
          </div>
        </body>
        </html>
      `);
    });

    // Gmail routes
    try {
      const gmailRoutes = require('./routes/gmail');
      this.app.use('/api/gmail', gmailRoutes);
      console.log('✅ Gmail routes loaded');
    } catch (error) {
      console.log('⚠️ Gmail routes not loaded:', error.message);
    }

    // AI agent routes  
    try {
      const agentRoutes = require('./routes/agent');
      this.app.use('/api/agent', agentRoutes);
      console.log('✅ AI agent routes loaded');
    } catch (error) {
      console.log('⚠️ AI agent routes not loaded:', error.message);
    }

    // API documentation endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        name: 'Intelligent Email Agent API',
        version: '1.0.0',
        endpoints: {
          gmail: {
            'GET /api/gmail/auth': 'Start Gmail OAuth flow',
            'GET /api/gmail/test': 'Test Gmail connection',
            'GET /api/gmail/emails': 'Fetch recent emails'
          },
          agent: {
            'POST /api/agent/categorize': 'Categorize single email',
            'POST /api/agent/urgency': 'Calculate urgency score',
            'POST /api/agent/respond': 'Generate email response',
            'POST /api/agent/process-batch': 'Process multiple emails'
          }
        }
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ 
        error: 'Endpoint not found',
        availableEndpoints: ['/health', '/api', '/api/gmail/auth', '/api/agent/categorize']
      });
    });
  }

  setupErrorHandling() {
    this.app.use((err, req, res, next) => {
      console.error('Unhandled error:', err);
      res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
      });
    });
  }

  start() {
    this.app.listen(this.port, () => {
      console.log('\n=================================');
      console.log('🤖 INTELLIGENT EMAIL AGENT');
      console.log('=================================');
      console.log(`🚀 Server: http://localhost:${this.port}`);
      console.log(`📊 Health: http://localhost:${this.port}/health`);
      console.log(`📡 API: http://localhost:${this.port}/api`);
      console.log('=================================\n');
      
      // Status checks
      if (!process.env.OPENAI_API_KEY) {
        console.log('⚠️  Warning: OPENAI_API_KEY not set - AI features disabled');
      }
      if (!process.env.GOOGLE_CLIENT_ID) {
        console.log('⚠️  Warning: GOOGLE_CLIENT_ID not set - Gmail integration disabled');
      }
      if (process.env.OPENAI_API_KEY && process.env.GOOGLE_CLIENT_ID) {
        console.log('✅ All systems ready! Visit the dashboard to get started.');
      }
    });
  }
}

const server = new EmailAgentServer();
server.start();
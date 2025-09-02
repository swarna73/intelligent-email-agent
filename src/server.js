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
    // Configure helmet with relaxed CSP for development
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts
          styleSrc: ["'self'", "'unsafe-inline'"],  // Allow inline styles
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"]
        }
      }
    }));
    
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Add request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
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

    // Gmail routes
    try {
      const gmailRoutes = require('./routes/gmail');
      this.app.use('/api/gmail', gmailRoutes);
      console.log('✅ Gmail routes loaded successfully');
    } catch (error) {
      console.log('⚠️ Gmail routes failed to load:', error.message);
    }

    // AI agent routes with debugging
    try {
      const agentRoutes = require('./routes/agent');
      this.app.use('/api/agent', agentRoutes);
      console.log('✅ AI agent routes loaded successfully');
    } catch (error) {
      console.log('❌ AI agent routes failed to load:', error.message);
    }

    // Debug route to show all available endpoints
    this.app.get('/api/routes', (req, res) => {
      res.json({
        success: true,
        message: 'All available routes',
        routes: {
          gmail: [
            'GET /api/gmail/auth - Start OAuth',
            'GET /api/gmail/test - Test connection', 
            'GET /api/gmail/emails - Fetch emails'
          ],
          agent: [
            'GET /api/agent/test - Test AI',
            'POST /api/agent/categorize - Categorize email',
            'POST /api/agent/urgency - Calculate urgency',
            'POST /api/agent/respond - Generate response'
          ]
        },
        timestamp: new Date().toISOString()
      });
    });

    // Main dashboard with working JavaScript
    this.app.get('/', (req, res) => {
      const hasOpenAI = !!process.env.OPENAI_API_KEY;
      const hasGoogleAuth = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
      
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>🤖 Intelligent Email Agent</title>
          <meta charset="utf-8">
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
            .form-group { margin: 15px 0; }
            .form-control { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
            textarea.form-control { height: 80px; resize: vertical; }
            .btn-primary { background: #007bff; color: white; padding: 12px 24px; border: none; border-radius: 6px; font-weight: 500; cursor: pointer; }
            .btn-primary:hover { background: #0056b3; }
            .result-box { margin-top: 20px; padding: 20px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #007bff; display: none; }
            .result-box.success { border-left-color: #28a745; background: #d4edda; }
            .result-box.error { border-left-color: #dc3545; background: #f8d7da; }
            pre { background: white; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
            .loading { color: #007bff; font-style: italic; }
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
            </div>

            <div class="buttons">
              <h3>🚀 Quick Actions</h3>
              <a href="/api/gmail/test" class="btn secondary" target="_blank">🔍 Test Gmail</a>
              <a href="/api/gmail/emails" class="btn secondary" target="_blank">📥 Get Emails</a>
              <a href="/api/agent/test" class="btn secondary" target="_blank">🤖 Test AI Agent</a>
              <a href="/api/routes" class="btn secondary" target="_blank">📋 Show All Routes</a>
            </div>

            <div class="api-section">
              <h3>🧪 Test AI Email Categorization</h3>
              <p>Try categorizing an email with AI:</p>
              
              <form id="categorizeForm">
                <div class="form-group">
                  <input type="text" id="subject" class="form-control" placeholder="Email subject (e.g., 'URGENT: Meeting moved to tomorrow')" required>
                </div>
                <div class="form-group">
                  <input type="email" id="from" class="form-control" placeholder="From email (e.g., 'boss@company.com')">
                </div>
                <div class="form-group">
                  <textarea id="snippet" class="form-control" placeholder="Email content (e.g., 'Please confirm you can attend the emergency meeting...')" required></textarea>
                </div>
                <button type="submit" class="btn-primary">🎯 Categorize with AI</button>
              </form>
              
              <div id="result" class="result-box"></div>
            </div>

            <div class="api-section">
              <h3>📊 Sample Test Data</h3>
              <p>Click to auto-fill the form with test data:</p>
              <button type="button" onclick="fillUrgentExample()" class="btn secondary">⚡ Urgent Email</button>
              <button type="button" onclick="fillMeetingExample()" class="btn secondary">📅 Meeting Email</button>
              <button type="button" onclick="fillNewsletterExample()" class="btn secondary">📰 Newsletter</button>
            </div>
          </div>

          <script>
            // Form submission handler
            document.getElementById('categorizeForm').addEventListener('submit', async function(e) {
              e.preventDefault();
              
              const subject = document.getElementById('subject').value;
              const from = document.getElementById('from').value;
              const snippet = document.getElementById('snippet').value;
              const resultDiv = document.getElementById('result');
              
              // Show loading state
              resultDiv.style.display = 'block';
              resultDiv.className = 'result-box';
              resultDiv.innerHTML = '<div class="loading">🤖 AI is analyzing your email...</div>';
              
              try {
                console.log('Sending request to /api/agent/categorize');
                
                const response = await fetch('/api/agent/categorize', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    subject: subject,
                    from: from,
                    snippet: snippet
                  })
                });
                
                console.log('Response status:', response.status);
                const data = await response.json();
                console.log('Response data:', data);
                
                if (data.success) {
                  resultDiv.className = 'result-box success';
                  resultDiv.innerHTML = \`
                    <h4>✅ Email Categorized Successfully!</h4>
                    <p><strong>Category:</strong> \${data.category.toUpperCase()}</p>
                    <p><strong>Confidence:</strong> \${Math.round(data.confidence * 100)}%</p>
                    <p><strong>Reasoning:</strong> \${data.reasoning}</p>
                    <details>
                      <summary>Full Response</summary>
                      <pre>\${JSON.stringify(data, null, 2)}</pre>
                    </details>
                  \`;
                } else {
                  resultDiv.className = 'result-box error';
                  resultDiv.innerHTML = \`
                    <h4>❌ Categorization Failed</h4>
                    <p><strong>Error:</strong> \${data.error}</p>
                    <pre>\${JSON.stringify(data, null, 2)}</pre>
                  \`;
                }
                
              } catch (error) {
                console.error('Request failed:', error);
                resultDiv.className = 'result-box error';
                resultDiv.innerHTML = \`
                  <h4>❌ Request Failed</h4>
                  <p><strong>Error:</strong> \${error.message}</p>
                  <p>Check the browser console for more details.</p>
                \`;
              }
            });
            
            // Sample data functions
            function fillUrgentExample() {
              document.getElementById('subject').value = 'URGENT: Project deadline moved to tomorrow';
              document.getElementById('from').value = 'manager@company.com';
              document.getElementById('snippet').value = 'Hi team, due to client feedback, we need to deliver the final presentation tomorrow morning instead of next week. Please confirm you can make the changes tonight.';
            }
            
            function fillMeetingExample() {
              document.getElementById('subject').value = 'Team meeting next Tuesday at 2pm';
              document.getElementById('from').value = 'hr@company.com';
              document.getElementById('snippet').value = 'Please join us for the weekly team sync. We will discuss project updates and next quarter planning.';
            }
            
            function fillNewsletterExample() {
              document.getElementById('subject').value = 'Weekly Tech News - AI Breakthroughs';
              document.getElementById('from').value = 'newsletter@techdigest.com';
              document.getElementById('snippet').value = 'This week in technology: Major AI developments, new programming frameworks, and startup funding news.';
            }
            
            console.log('Email Agent Dashboard loaded successfully');
          </script>
        </body>
        </html>
      `);
    });

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
            'GET /api/agent/test': 'Test AI agent status',
            'POST /api/agent/categorize': 'Categorize single email',
            'POST /api/agent/urgency': 'Calculate urgency score',
            'POST /api/agent/respond': 'Generate email response'
          }
        }
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      console.log(`404 - ${req.method} ${req.path}`);
      res.status(404).json({ 
        error: 'Endpoint not found',
        requestedPath: req.path,
        method: req.method,
        suggestion: 'Visit /api/routes to see all available endpoints'
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
      console.log(`📋 Routes: http://localhost:${this.port}/api/routes`);
      console.log('=================================\n');
    });
  }
}

const server = new EmailAgentServer();
server.start();

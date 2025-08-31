#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

class EmailAgentSetup {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async prompt(question) {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  async setup() {
    console.log('\n🤖 INTELLIGENT EMAIL AGENT - SETUP WIZARD');
    console.log('==========================================\n');

    console.log('Welcome! Let\'s get your Email Agent configured.\n');
    console.log('You\'ll need:');
    console.log('✓ OpenAI API Key (for AI processing)');
    console.log('✓ Google Cloud Console project (for Gmail access)');
    console.log('✓ A few minutes to set everything up\n');

    const proceed = await this.prompt('Ready to start? (y/n): ');
    if (proceed.toLowerCase() !== 'y') {
      console.log('Setup cancelled. Run "npm run setup" when ready!');
      process.exit(0);
    }

    const config = {};

    // OpenAI API Key
    console.log('\n📝 Step 1: OpenAI API Key');
    console.log('Get your API key from: https://platform.openai.com/api-keys');
    config.OPENAI_API_KEY = await this.prompt('Enter your OpenAI API key: ');

    // Google OAuth
    console.log('\n📧 Step 2: Gmail Integration');
    console.log('Set up Google OAuth at: https://console.cloud.google.com/');
    console.log('1. Create/select a project');
    console.log('2. Enable Gmail API');
    console.log('3. Create OAuth 2.0 credentials');
    console.log('4. Add redirect URI: http://localhost:3000/api/gmail/callback\n');
    
    config.GOOGLE_CLIENT_ID = await this.prompt('Enter Google Client ID: ');
    config.GOOGLE_CLIENT_SECRET = await this.prompt('Enter Google Client Secret: ');

    // Optional settings
    console.log('\n⚙️  Step 3: Optional Configuration');
    const port = await this.prompt('Port number (default: 3000): ');
    config.PORT = port || '3000';

    const environment = await this.prompt('Environment (development/production) [development]: ');
    config.NODE_ENV = environment || 'development';

    // Create directories
    await this.createDirectories();

    // Create .env file
    await this.createEnvFile(config);

    // Create database
    await this.setupDatabase();

    // Success message
    console.log('\n🎉 Setup Complete!');
    console.log('==================');
    console.log('Your Email Agent is ready to use!');
    console.log('\nNext steps:');
    console.log('1. Run: npm start');
    console.log('2. Open: http://localhost:' + config.PORT);
    console.log('3. Authorize Gmail access');
    console.log('4. Start managing emails with AI!\n');

    console.log('💡 Pro tip: Check out the README.md for advanced configuration options.');

    this.rl.close();
  }

  async createDirectories() {
    const dirs = ['data', 'logs', 'public'];
    
    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
        console.log(`✓ Created ${dir}/ directory`);
      } catch (error) {
        console.log(`⚠️  ${dir}/ directory already exists`);
      }
    }
  }

  async createEnvFile(config) {
    const envContent = `# Intelligent Email Agent Configuration
# Generated on ${new Date().toISOString()}

# OpenAI Configuration
OPENAI_API_KEY=${config.OPENAI_API_KEY}

# Gmail API Configuration  
GOOGLE_CLIENT_ID=${config.GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${config.GOOGLE_CLIENT_SECRET}
GOOGLE_REDIRECT_URI=http://localhost:${config.PORT}/api/gmail/callback

# Server Configuration
PORT=${config.PORT}
NODE_ENV=${config.NODE_ENV}

# Security
ALLOWED_ORIGINS=http://localhost:${config.PORT},http://127.0.0.1:${config.PORT}

# Database
DATABASE_URL=sqlite:./data/emails.db

# Optional: Redis for job queues (uncomment if using Redis)
# REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/email-agent.log
`;

    try {
      await fs.writeFile('.env', envContent);
      console.log('✓ Created .env configuration file');
    } catch (error) {
      console.error('✗ Failed to create .env file:', error.message);
    }
  }

  async setupDatabase() {
    const schema = `-- Email Agent Database Schema
-- SQLite database for storing processed emails and user preferences

CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    gmail_id TEXT UNIQUE,
    thread_id TEXT,
    subject TEXT,
    sender TEXT,
    recipient TEXT,
    body TEXT,
    category TEXT,
    urgency_score INTEGER,
    is_urgent BOOLEAN,
    needs_response BOOLEAN,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    labels TEXT -- JSON array of labels
);

CREATE TABLE IF NOT EXISTS user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS processing_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emails_processed INTEGER,
    categories_assigned INTEGER,
    responses_generated INTEGER,
    date DATE DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_emails_category ON emails(category);
CREATE INDEX IF NOT EXISTS idx_emails_urgency ON emails(urgency_score);
CREATE INDEX IF NOT EXISTS idx_emails_processed_at ON emails(processed_at);
`;

    try {
      await fs.writeFile('./data/schema.sql', schema);
      console.log('✓ Created database schema');
    } catch (error) {
      console.error('✗ Failed to create database schema:', error.message);
    }
  }
}

// Run setup if called directly
if (require.main === module) {
  const setup = new EmailAgentSetup();
  setup.setup().catch(error => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
}

module.exports = EmailAgentSetup;
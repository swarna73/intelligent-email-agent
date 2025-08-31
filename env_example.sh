# Intelligent Email Agent Configuration
# Copy this to .env and fill in your values

# OpenAI Configuration (Required)
OPENAI_API_KEY=sk-your-openai-api-key-here

# Gmail API Configuration (Required)
GOOGLE_CLIENT_ID=your-google-client-id.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/gmail/callback

# Server Configuration
PORT=3000
NODE_ENV=development

# Security
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Database
DATABASE_URL=sqlite:./data/emails.db

# Optional: Redis for job queues
# REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/email-agent.log

# Optional: Custom AI Settings
# AI_MODEL=gpt-4
# AI_TEMPERATURE=0.7
# MAX_TOKENS=150
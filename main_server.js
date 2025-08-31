const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('rate-limiter-flexible');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const gmailRoutes = require('./routes/gmail');
const agentRoutes = require('./routes/agent');
const { logger } = require('./utils/logger');
const { setupDatabase } = require('./utils/database');

class EmailAgentServer {
  constructor() {
    this.app = express();
    this.prisma = new PrismaClient();
    this.port = process.env.PORT || 3000;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Security
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    }));

    // Rate limiting
    const rateLimiter = new rateLimit.RateLimiterMemory({
      keyGenerator: (req) => req.ip,
      points: 100, // Number of requests
      duration: 60, // Per 60 seconds
    });

    this.app.use(async (req, res, next) => {
      try {
        await rateLimiter.consume(req.ip);
        next();
      } catch (rejRes) {
        res.status(429).json({ error: 'Too many requests' });
      }
    });

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, { ip: req.ip });
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime()
      });
    });

    // API routes
    this.app.use('/api/gmail', gmailRoutes);
    this.app.use('/api/agent', agentRoutes);

    // Serve static files (for web interface)
    this.app.use(express.static('public'));

    // Catch-all for SPA
    this.app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API endpoint not found' });
      } else {
        res.sendFile(path.join(__dirname, '../public/index.html'));
      }
    });
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

    // Global error handler
    this.app.use((err, req, res, next) => {
      logger.error('Unhandled error:', err);
      
      if (process.env.NODE_ENV === 'development') {
        res.status(500).json({ 
          error: 'Internal server error',
          details: err.message,
          stack: err.stack
        });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  async start() {
    try {
      // Setup database
      await setupDatabase(this.prisma);
      
      // Start server
      this.app.listen(this.port, () => {
        logger.info(`🚀 Email Agent Server running on port ${this.port}`);
        logger.info(`📧 Dashboard: http://localhost:${this.port}`);
        logger.info(`🔧 API: http://localhost:${this.port}/api`);
        
        console.log('\n=================================');
        console.log('🤖 INTELLIGENT EMAIL AGENT');
        console.log('=================================');
        console.log(`Server: http://localhost:${this.port}`);
        console.log(`Status: READY`);
        console.log('=================================\n');
      });

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async shutdown() {
    logger.info('Shutting down server...');
    await this.prisma.$disconnect();
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  if (global.server) {
    await global.server.shutdown();
  }
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  if (global.server) {
    await global.server.shutdown();
  }
});

// Start server if this file is run directly
if (require.main === module) {
  const server = new EmailAgentServer();
  global.server = server;
  server.start();
}

module.exports = EmailAgentServer;

// routes/gmail.js
const express = require('express');
const GmailService = require('../services/gmail');
const IntelligentEmailAgent = require('../services/agent');
const { logger } = require('../utils/logger');

const router = express.Router();
const gmailService = new GmailService();
const emailAgent = new IntelligentEmailAgent();

// Gmail OAuth Routes
router.get('/auth', async (req, res) => {
  try {
    const authUrl = gmailService.getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    logger.error('Gmail auth error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'Authorization code required' });
    }

    const tokens = await gmailService.handleCallback(code);
    res.json({ 
      success: true, 
      message: 'Gmail connected successfully!',
      hasTokens: !!tokens.access_token 
    });
  } catch (error) {
    logger.error('Gmail callback error:', error);
    res.status(400).json({ error: 'Authorization failed' });
  }
});

// Email fetching and processing
router.get('/emails', async (req, res) => {
  try {
    // Check if tokens are available
    const hasTokens = await gmailService.loadTokens();
    if (!hasTokens) {
      return res.status(401).json({ 
        error: 'Gmail not authorized', 
        authUrl: gmailService.getAuthUrl() 
      });
    }

    const {
      maxResults = 20,
      query = '',
      category = '',
      processWithAI = true
    } = req.query;

    // Fetch emails
    const emails = await gmailService.fetchEmails({
      maxResults: parseInt(maxResults),
      query
    });

    // Process with AI if requested
    let processedEmails = emails;
    if (processWithAI === 'true') {
      processedEmails = await emailAgent.processBatch(emails);
    }

    // Filter by category if specified
    if (category) {
      processedEmails = processedEmails.filter(
        email => email.aiAnalysis?.category === category
      );
    }

    res.json({
      success: true,
      count: processedEmails.length,
      emails: processedEmails,
      processedWithAI: processWithAI === 'true'
    });

  } catch (error) {
    logger.error('Email fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

router.post('/send', async (req, res) => {
  try {
    const { to, subject, body, inReplyTo, threadId } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ 
        error: 'Missing required fields: to, subject, body' 
      });
    }

    const messageId = await gmailService.sendEmail({
      to, subject, body, inReplyTo, threadId
    });

    res.json({ 
      success: true, 
      messageId,
      message: 'Email sent successfully' 
    });

  } catch (error) {
    logger.error('Send email error:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

module.exports = router;

// routes/agent.js
const express = require('express');
const IntelligentEmailAgent = require('../services/agent');
const { logger } = require('../utils/logger');

const agentRouter = express.Router();
const emailAgent = new IntelligentEmailAgent();

// Single email categorization
agentRouter.post('/categorize', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.subject || !email.body) {
      return res.status(400).json({ 
        error: 'Email object with subject and body required' 
      });
    }

    const result = await emailAgent.categorizeEmail(email);
    
    res.json({
      success: true,
      category: result.category,
      confidence: result.confidence,
      reasoning: result.reasoning
    });

  } catch (error) {
    logger.error('Categorization error:', error);
    res.status(500).json({ error: 'Failed to categorize email' });
  }
});

// Generate response
agentRouter.post('/respond', async (req, res) => {
  try {
    const { email, responseType = 'general' } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email object required' });
    }

    const response = await emailAgent.generateResponse(email, responseType);
    
    res.json({
      success: true,
      response,
      responseType,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Response generation error:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

// Calculate urgency score
agentRouter.post('/urgency', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email object required' });
    }

    const urgencyScore = await emailAgent.calculateUrgencyScore(email);
    
    res.json({
      success: true,
      urgencyScore,
      isUrgent: urgencyScore >= 7,
      level: urgencyScore >= 8 ? 'critical' : 
             urgencyScore >= 6 ? 'high' : 
             urgencyScore >= 4 ? 'medium' : 'low'
    });

  } catch (error) {
    logger.error('Urgency calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate urgency' });
  }
});

// Batch processing
agentRouter.post('/process-batch', async (req, res) => {
  try {
    const { emails } = req.body;
    
    if (!Array.isArray(emails)) {
      return res.status(400).json({ error: 'Emails array required' });
    }

    const processed = await emailAgent.processBatch(emails);
    
    // Analytics
    const analytics = {
      totalProcessed: processed.length,
      categories: {},
      urgencyDistribution: { low: 0, medium: 0, high: 0, critical: 0 },
      needsResponse: 0
    };

    processed.forEach(email => {
      if (email.aiAnalysis) {
        // Count categories
        const category = email.aiAnalysis.category;
        analytics.categories[category] = (analytics.categories[category] || 0) + 1;
        
        // Count urgency levels
        const urgency = email.aiAnalysis.urgencyScore;
        if (urgency >= 8) analytics.urgencyDistribution.critical++;
        else if (urgency >= 6) analytics.urgencyDistribution.high++;
        else if (urgency >= 4) analytics.urgencyDistribution.medium++;
        else analytics.urgencyDistribution.low++;
        
        // Count response needed
        if (email.aiAnalysis.needsResponse) analytics.needsResponse++;
      }
    });

    res.json({
      success: true,
      processed,
      analytics
    });

  } catch (error) {
    logger.error('Batch processing error:', error);
    res.status(500).json({ error: 'Failed to process email batch' });
  }
});

// Get processing analytics
agentRouter.get('/analytics', async (req, res) => {
  try {
    // This would typically query your database for historical data
    // For now, return sample analytics
    const analytics = {
      summary: {
        emailsProcessedToday: 45,
        categoriesAssigned: 45,
        responsesGenerated: 12,
        avgUrgencyScore: 4.2
      },
      categories: {
        work: 18,
        personal: 8,
        urgent: 5,
        newsletter: 10,
        promotion: 4
      },
      urgencyTrends: [
        { date: '2024-01-01', avgUrgency: 3.8 },
        { date: '2024-01-02', avgUrgency: 4.2 },
        { date: '2024-01-03', avgUrgency: 5.1 }
      ],
      responseTypes: {
        acknowledgment: 8,
        meeting_accept: 2,
        info_request: 2
      }
    };

    res.json({ success: true, analytics });

  } catch (error) {
    logger.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

module.exports = agentRouter;
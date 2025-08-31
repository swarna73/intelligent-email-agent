const express = require('express');
const OpenAI = require('openai');

const router = express.Router();

// Initialize OpenAI (check if API key exists)
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
} else {
  console.log('⚠️ OPENAI_API_KEY not found - AI features will use mock responses');
}

// Email categories
const CATEGORIES = {
  URGENT: 'urgent',
  WORK: 'work', 
  PERSONAL: 'personal',
  NEWSLETTER: 'newsletter',
  PROMOTION: 'promotion',
  SPAM: 'spam',
  MEETING: 'meeting',
  INVOICE: 'invoice'
};

// Test endpoint
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: '🤖 AI Agent is working!',
    features: ['categorize', 'urgency', 'respond', 'process-batch'],
    openaiStatus: openai ? 'connected' : 'not configured',
    timestamp: new Date().toISOString()
  });
});

// Categorize single email
router.post('/categorize', async (req, res) => {
  try {
    const { subject, from, snippet, to } = req.body;

    if (!subject && !snippet) {
      return res.status(400).json({ 
        error: 'Email subject or snippet required',
        example: {
          subject: 'Meeting today at 3pm',
          from: 'boss@company.com',
          snippet: 'We need to discuss the project updates'
        }
      });
    }

    // If no OpenAI, return mock response
    if (!openai) {
      const mockCategory = subject?.toLowerCase().includes('urgent') ? 'urgent' :
                          subject?.toLowerCase().includes('meeting') ? 'meeting' :
                          from?.includes('newsletter') ? 'newsletter' : 'work';
      
      return res.json({
        success: true,
        category: mockCategory,
        confidence: 0.85,
        reasoning: 'Mock classification (OpenAI not configured)',
        processedAt: new Date().toISOString()
      });
    }

    const prompt = `
    Categorize this email into one of these categories: ${Object.values(CATEGORIES).join(', ')}
    
    Subject: ${subject || 'No subject'}
    From: ${from || 'Unknown'}
    To: ${to || 'Unknown'}
    Content: ${snippet || 'No content'}
    
    Respond with JSON format only:
    {"category": "category_name", "confidence": 0.95, "reasoning": "brief explanation"}
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system', 
          content: 'You are an expert email classifier. Respond only with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 150
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    res.json({
      success: true,
      ...result,
      processedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Categorization failed:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to categorize email',
      details: error.message 
    });
  }
});

// Calculate urgency score
router.post('/urgency', async (req, res) => {
  try {
    const { subject, from, snippet } = req.body;

    if (!subject && !snippet) {
      return res.status(400).json({ 
        error: 'Email subject or snippet required' 
      });
    }

    // Rule-based urgency scoring
    let score = 0;
    const text = `${subject || ''} ${snippet || ''}`.toLowerCase();

    // Check for urgent keywords
    const urgentWords = ['urgent', 'asap', 'immediate', 'emergency', 'deadline', 'today', 'now', 'critical'];
    urgentWords.forEach(word => {
      if (text.includes(word)) score += 2;
    });

    // Check sender importance (basic example)
    if (from) {
      const fromLower = from.toLowerCase();
      if (fromLower.includes('boss') || fromLower.includes('ceo') || fromLower.includes('director') || fromLower.includes('manager')) {
        score += 3;
      }
    }

    // Meeting urgency
    if (text.includes('meeting') && (text.includes('today') || text.includes('tomorrow'))) {
      score += 2;
    }

    // Financial terms
    if (text.includes('invoice') || text.includes('payment') || text.includes('overdue') || text.includes('bill')) {
      score += 2;
    }

    // Time sensitivity
    if (text.includes('deadline') || text.includes('due date') || text.includes('expires')) {
      score += 1;
    }

    // Cap at 10
    score = Math.min(score, 10);

    res.json({
      success: true,
      urgencyScore: score,
      level: score >= 8 ? 'critical' : 
             score >= 6 ? 'high' : 
             score >= 4 ? 'medium' : 'low',
      isUrgent: score >= 7,
      reasoning: `Analyzed keywords, sender, and context. Keywords found: ${urgentWords.filter(word => text.includes(word)).join(', ') || 'none'}`,
      processedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Urgency calculation failed:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to calculate urgency',
      details: error.message 
    });
  }
});

// Generate email response
router.post('/respond', async (req, res) => {
  try {
    const { subject, from, snippet, responseType = 'acknowledgment' } = req.body;

    if (!subject && !snippet) {
      return res.status(400).json({ 
        error: 'Email subject or snippet required' 
      });
    }

    // Mock response if no OpenAI
    if (!openai) {
      const mockResponses = {
        acknowledgment: 'Thank you for your email. I have received it and will respond shortly.',
        meeting: 'Thank you for the meeting invitation. I will check my calendar and get back to you.',
        urgent: 'I understand this is urgent. I will prioritize this and respond as soon as possible.',
        general: 'Thank you for reaching out. I will review your message and respond accordingly.'
      };
      
      return res.json({
        success: true,
        response: mockResponses[responseType] || mockResponses.general,
        responseType,
        note: 'Mock response (OpenAI not configured)',
        generatedAt: new Date().toISOString()
      });
    }

    const prompt = `
    Generate a professional email response for:
    
    Original Subject: ${subject || 'No subject'}
    From: ${from || 'Unknown sender'}
    Content: ${snippet || 'No content'}
    
    Response type: ${responseType}
    
    Generate a concise, professional response (under 100 words).
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a professional email assistant. Generate polite, concise email responses.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 200
    });

    const generatedResponse = response.choices[0].message.content;

    res.json({
      success: true,
      response: generatedResponse,
      responseType,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Response generation failed:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate response',
      details: error.message 
    });
  }
});

// Process emails from Gmail with AI
router.post('/process-gmail', async (req, res) => {
  try {
    // This endpoint will integrate with Gmail to fetch and process emails
    const { maxEmails = 5 } = req.body;
    
    res.json({
      success: true,
      message: 'Gmail + AI processing endpoint ready',
      note: 'Will fetch emails from Gmail and process with AI',
      maxEmails
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Processing failed',
      details: error.message 
    });
  }
});

module.exports = router;

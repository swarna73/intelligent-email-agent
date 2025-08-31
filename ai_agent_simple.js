const express = require('express');
const OpenAI = require('openai');

const router = express.Router();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Email categories
const CATEGORIES = {
  URGENT: 'urgent',
  WORK: 'work', 
  PERSONAL: 'personal',
  NEWSLETTER: 'newsletter',
  PROMOTION: 'promotion',
  SPAM: 'spam',
  MEETING: 'meeting'
};

// Categorize single email
router.post('/categorize', async (req, res) => {
  try {
    const { subject, from, snippet } = req.body;

    if (!subject && !snippet) {
      return res.status(400).json({ 
        error: 'Email subject or snippet required' 
      });
    }

    const prompt = `
    Categorize this email into one of these categories: ${Object.values(CATEGORIES).join(', ')}
    
    Subject: ${subject || 'No subject'}
    From: ${from || 'Unknown'}
    Content: ${snippet || 'No content'}
    
    Respond with JSON format:
    {"category": "category_name", "confidence": 0.95, "reasoning": "brief explanation"}
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system', 
          content: 'You are an email classifier. Respond only with valid JSON.'
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

    // Rule-based urgency scoring
    let score = 0;
    const text = `${subject || ''} ${snippet || ''}`.toLowerCase();

    // Check for urgent keywords
    const urgentWords = ['urgent', 'asap', 'immediate', 'emergency', 'deadline', 'today'];
    urgentWords.forEach(word => {
      if (text.includes(word)) score += 2;
    });

    // Check sender importance (basic example)
    if (from && (from.includes('boss') || from.includes('ceo') || from.includes('director'))) {
      score += 3;
    }

    // Meeting urgency
    if (text.includes('meeting') && (text.includes('today') || text.includes('tomorrow'))) {
      score += 2;
    }

    // Financial terms
    if (text.includes('invoice') || text.includes('payment') || text.includes('overdue')) {
      score += 2;
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
      reasoning: `Score based on keywords and sender analysis`
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

// Process multiple emails at once
router.post('/process-batch', async (req, res) => {
  try {
    const { emails } = req.body;

    if (!Array.isArray(emails)) {
      return res.status(400).json({ error: 'Emails array required' });
    }

    const processed = [];
    const analytics = {
      total: emails.length,
      categories: {},
      urgencyLevels: { low: 0, medium: 0, high: 0, critical: 0 }
    };

    for (const email of emails.slice(0, 10)) { // Limit to 10 emails for demo
      try {
        // Categorize
        const categoryResponse = await fetch(`http://localhost:${process.env.PORT}/api/agent/categorize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(email)
        });
        const categoryData = await categoryResponse.json();

        // Calculate urgency
        const urgencyResponse = await fetch(`http://localhost:${process.env.PORT}/api/agent/urgency`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(email)
        });
        const urgencyData = await urgencyResponse.json();

        const processedEmail = {
          ...email,
          aiAnalysis: {
            category: categoryData.category,
            categoryConfidence: categoryData.confidence,
            urgencyScore: urgencyData.urgencyScore,
            urgencyLevel: urgencyData.level,
            isUrgent: urgencyData.isUrgent,
            processedAt: new Date().toISOString()
          }
        };

        processed.push(processedEmail);

        // Update analytics
        analytics.categories[categoryData.category] = (analytics.categories[categoryData.category] || 0) + 1;
        analytics.urgencyLevels[urgencyData.level]++;

      } catch (error) {
        console.error(`Failed to process email ${email.id}:`, error);
        processed.push({
          ...email,
          aiAnalysis: { error: 'Processing failed' }
        });
      }
    }

    res.json({
      success: true,
      processed,
      analytics,
      message: `Processed ${processed.length} emails successfully`
    });

  } catch (error) {
    console.error('Batch processing failed:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to process email batch',
      details: error.message 
    });
  }
});

module.exports = router;
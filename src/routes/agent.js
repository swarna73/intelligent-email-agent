const express = require('express');
const Groq = require('groq-sdk');

const router = express.Router();

// Initialize Groq
let groq = null;
if (process.env.GROQ_API_KEY) {
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  console.log('✅ Groq AI initialized');
} else {
  console.log('⚠️ GROQ_API_KEY not found - using fallback responses');
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
    message: '🤖 Groq AI Agent is working!',
    groqStatus: groq ? 'connected' : 'not configured',
    model: 'llama3-8b-8192',
    timestamp: new Date().toISOString()
  });
});

// Categorize single email with Groq
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

    if (!groq) {
      return res.json({
        success: false,
        error: 'Groq not configured',
        message: 'Please add GROQ_API_KEY to your .env file'
      });
    }

    const prompt = `Analyze this email and categorize it into one of these categories: ${Object.values(CATEGORIES).join(', ')}

Email Details:
Subject: ${subject || 'No subject'}
From: ${from || 'Unknown'}
To: ${to || 'Unknown'}
Content: ${snippet || 'No content'}

Instructions:
- Consider the context, tone, and urgency level
- "urgent" should only be used for true emergencies or time-critical items
- Regular work tasks with deadlines are usually "work" category
- Be precise in your reasoning

Respond ONLY with valid JSON in this exact format:
{"category": "category_name", "confidence": 0.85, "reasoning": "brief explanation of why you chose this category"}`;

    console.log('Sending request to Groq...');
    
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: 'You are an expert email classifier. You analyze emails carefully and provide accurate categorization. Respond only with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 200
    });

    console.log('Groq response received:', response.choices[0].message.content);

    let result;
    try {
      result = JSON.parse(response.choices[0].message.content);
    } catch (parseError) {
      console.error('JSON parse failed:', parseError);
      // Try to extract JSON from the response
      const jsonMatch = response.choices[0].message.content.match(/\{.*\}/s);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Invalid JSON response from AI');
      }
    }
    
    res.json({
      success: true,
      category: result.category,
      confidence: result.confidence,
      reasoning: result.reasoning,
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      processedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Groq categorization failed:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to categorize email with Groq',
      details: error.message,
      suggestion: 'Check your GROQ_API_KEY and try again'
    });
  }
});

// Calculate urgency score with Groq AI
router.post('/urgency', async (req, res) => {
  try {
    const { subject, from, snippet } = req.body;

    if (!subject && !snippet) {
      return res.status(400).json({ 
        error: 'Email subject or snippet required' 
      });
    }

    if (!groq) {
      return res.json({
        success: false,
        error: 'Groq not configured'
      });
    }

    const prompt = `Analyze this email and rate its urgency on a scale of 0-10:

Email Details:
Subject: ${subject || 'No subject'}
From: ${from || 'Unknown'}
Content: ${snippet || 'No content'}

Urgency Scale:
0-2: Low (newsletters, routine updates)
3-4: Medium (regular work tasks, non-urgent requests)
5-6: High (tasks with near-term deadlines, important meetings)
7-8: Urgent (same-day deadlines, important issues)
9-10: Critical (true emergencies, immediate action required)

Consider:
- Time sensitivity (deadlines, meeting times)
- Sender importance
- Impact of delay
- Context and tone

Respond ONLY with valid JSON:
{"urgencyScore": 4, "level": "medium", "reasoning": "explanation for the score"}`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: 'You are an email urgency analyzer. Provide accurate urgency scoring based on context.'
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
      urgencyScore: result.urgencyScore,
      level: result.level,
      isUrgent: result.urgencyScore >= 7,
      reasoning: result.reasoning,
      provider: 'groq',
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

// Generate email response with Groq
router.post('/respond', async (req, res) => {
  try {
    const { subject, from, snippet, responseType = 'acknowledgment' } = req.body;

    if (!subject && !snippet) {
      return res.status(400).json({ 
        error: 'Email subject or snippet required' 
      });
    }

    if (!groq) {
      return res.json({
        success: false,
        error: 'Groq not configured'
      });
    }

    const prompt = `Generate a professional email response for this email:

Original Email:
Subject: ${subject || 'No subject'}
From: ${from || 'Unknown sender'}
Content: ${snippet || 'No content'}

Response Type: ${responseType}

Instructions:
- Keep it professional and concise (under 100 words)
- Match the tone appropriately
- Address the main points
- Be helpful and clear

Generate only the email response text:`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: 'You are a professional email assistant. Generate appropriate, concise email responses.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 200
    });

    const generatedResponse = response.choices[0].message.content.trim();

    res.json({
      success: true,
      response: generatedResponse,
      responseType,
      provider: 'groq',
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

// Debug endpoint for testing Groq connection
router.get('/debug-groq', async (req, res) => {
  try {
    if (!groq) {
      return res.json({
        success: false,
        error: 'Groq not initialized',
        hasApiKey: !!process.env.GROQ_API_KEY
      });
    }

    const response = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [
        {
          role: 'user',
          content: 'Say "Groq API test successful!"'
        }
      ],
      max_tokens: 20
    });

    res.json({
      success: true,
      message: 'Groq API working perfectly!',
      response: response.choices[0].message.content,
      model: response.model,
      usage: response.usage
    });

  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      hasApiKey: !!process.env.GROQ_API_KEY
    });
  }
});

module.exports = router;

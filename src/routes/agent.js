const express = require('express');
const Groq = require('groq-sdk');

const router = express.Router();

// Initialize Groq FIRST
let groq = null;
if (process.env.GROQ_API_KEY) {
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  console.log('✅ Groq AI initialized');
} else {
  console.log('⚠️ GROQ_API_KEY not found - using fallback responses');
}

// Email categories with hierarchy
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

// Advanced urgency analyzer
class AdvancedUrgencyAnalyzer {
  constructor() {
    this.urgencyFactors = {
      temporal: {
        'immediately': 4, 'asap': 4, 'urgent': 3, 'today': 3,
        'this morning': 3, 'by end of day': 2, 'by eod': 2,
        'tomorrow': 1, 'this week': 0.5, 'when you can': -1
      },
      escalation: {
        'emergency': 5, 'critical': 4, 'high priority': 3,
        'important': 2, 'please': 1, 'if possible': -1
      },
      consequences: {
        'deadline': 3, 'late': 3, 'missing': 3, 'overdue': 4,
        'expires': 2, 'final notice': 4, 'last chance': 4
      },
      authority: {
        'ceo': 4, 'president': 4, 'director': 3, 'vp': 3,
        'vice president': 3, 'manager': 2, 'boss': 2, 'lead': 1
      }
    };
  }

  analyzeUrgency(subject, from, snippet) {
    const text = `${subject || ''} ${snippet || ''}`.toLowerCase();
    const fromLower = (from || '').toLowerCase();
    
    let score = 0;
    const factors = [];

    // Check temporal urgency
    for (const [keyword, weight] of Object.entries(this.urgencyFactors.temporal)) {
      if (text.includes(keyword)) {
        score += weight;
        factors.push(`${keyword} (+${weight})`);
      }
    }

    // Check escalation words
    for (const [keyword, weight] of Object.entries(this.urgencyFactors.escalation)) {
      if (text.includes(keyword)) {
        score += weight;
        factors.push(`${keyword} (+${weight})`);
      }
    }

    // Check consequences
    for (const [keyword, weight] of Object.entries(this.urgencyFactors.consequences)) {
      if (text.includes(keyword)) {
        score += weight;
        factors.push(`${keyword} (+${weight})`);
      }
    }

    // Check sender authority
    for (const [keyword, weight] of Object.entries(this.urgencyFactors.authority)) {
      if (fromLower.includes(keyword)) {
        score += weight;
        factors.push(`authority: ${keyword} (+${weight})`);
      }
    }

    // Context patterns
    if (text.includes('meeting') && text.includes('today')) {
      score += 2;
      factors.push('same-day meeting (+2)');
    }
    if (text.includes('client') && (text.includes('waiting') || text.includes('upset'))) {
      score += 3;
      factors.push('client issue (+3)');
    }
    if (text.includes('system') && (text.includes('down') || text.includes('error'))) {
      score += 4;
      factors.push('system issue (+4)');
    }

    const finalScore = Math.min(10, Math.max(0, score));
    const level = finalScore >= 8 ? 'critical' : 
                 finalScore >= 6 ? 'high' : 
                 finalScore >= 4 ? 'medium' : 'low';

    return {
      score: finalScore,
      level,
      isUrgent: finalScore >= 7,
      factors,
      reasoning: factors.length > 0 
        ? `Score ${finalScore}/10: ${factors.join(', ')}`
        : `Score ${finalScore}/10: No urgency indicators detected`
    };
  }
}

// Auto-Response Generation System
class AutoResponseGenerator {
  constructor(groqClient) {
    this.groq = groqClient;
    
    // Base response templates by category
    this.templates = {
      urgent: {
        acknowledgment: "I've received your urgent message and will address this immediately.",
        timeline: "I understand this requires immediate attention. I'll get back to you within the next hour.",
        escalation: "Thank you for flagging this as urgent. I'm prioritizing this now and will update you shortly."
      },
      meeting: {
        accept: "Thank you for the meeting invitation. I'll be there.",
        decline: "Thank you for the invitation, but I won't be able to attend this meeting.",
        reschedule: "I'd like to attend but need to reschedule. Are there alternative times that work?",
        confirmation: "Meeting confirmed. Looking forward to our discussion."
      },
      work: {
        acknowledgment: "Thank you for your email. I've received it and will review the details.",
        update: "I'll look into this and provide an update by end of day.",
        question: "Thank you for reaching out. I'll gather the information you need and get back to you.",
        completion: "I'll take care of this and confirm once completed."
      },
      personal: {
        friendly: "Thanks for reaching out! I'll get back to you soon.",
        informal: "Got it, thanks! I'll take a look and let you know.",
        supportive: "Thank you for sharing this with me. I'll give it proper attention."
      },
      newsletter: {
        unsubscribe: "Please remove me from this mailing list.",
        acknowledge: "Thank you for the update."
      },
      invoice: {
        received: "Invoice received. I'll process this with our accounting team.",
        question: "I have a question about this invoice. Can we discuss the details?",
        payment: "Thank you for the invoice. Payment will be processed according to our standard terms."
      }
    };

    this.responseTypes = [
      'acknowledgment',
      'accept', 
      'decline',
      'question',
      'update_request',
      'schedule',
      'custom'
    ];
  }

  analyzeSenderRelationship(fromEmail, fromName = '') {
    const email = (fromEmail || '').toLowerCase();
    const name = (fromName || '').toLowerCase();
    const combined = `${email} ${name}`;

    if (combined.includes('ceo') || combined.includes('president') || combined.includes('director')) {
      return 'boss';
    }
    if (combined.includes('manager') || combined.includes('supervisor') || combined.includes('lead')) {
      return 'boss';
    }
    if (email.includes('client') || email.includes('customer')) {
      return 'client';
    }
    if (email.includes('vendor') || email.includes('supplier') || email.includes('sales')) {
      return 'vendor';
    }
    if (email.includes('gmail.com') || email.includes('yahoo.com') || email.includes('hotmail.com')) {
      return 'personal';
    }
    
    return 'colleague';
  }

  determineResponseType(subject, content, category) {
    const text = `${subject || ''} ${content || ''}`.toLowerCase();

    if (category === 'meeting' || text.includes('meeting') || text.includes('call')) {
      if (text.includes('invitation') || text.includes('invite')) {
        return text.includes('decline') || text.includes('can\'t') ? 'decline' : 'accept';
      }
      if (text.includes('reschedule') || text.includes('move')) {
        return 'schedule';
      }
      return 'acknowledgment';
    }

    if (text.includes('?') || text.includes('question') || text.includes('clarify')) {
      return 'question';
    }

    if (text.includes('update') || text.includes('status') || text.includes('progress')) {
      return 'update_request';
    }

    return 'acknowledgment';
  }

  async generateAIResponse(emailData, responseType, senderRelationship, urgencyLevel) {
    if (!this.groq) {
      return this.generateTemplateResponse(emailData.category, responseType, senderRelationship);
    }

    try {
      const toneGuide = this.getToneGuide(senderRelationship, urgencyLevel);
      
      const prompt = `Generate a professional email response:

ORIGINAL EMAIL:
Subject: ${emailData.subject || 'No subject'}
From: ${emailData.from || 'Unknown'}
Content: ${emailData.content || 'No content'}

RESPONSE CONTEXT:
- Category: ${emailData.category}
- Response Type: ${responseType}
- Sender Relationship: ${senderRelationship}
- Urgency Level: ${urgencyLevel}
- Tone: ${toneGuide}

REQUIREMENTS:
- Keep response under 80 words
- Match the urgency level (urgent = immediate acknowledgment)
- Use appropriate formality for relationship
- Address main points without being redundant
- Be helpful and actionable
- Don't repeat information from original email
- End professionally but don't be overly formal

Generate ONLY the email response text (no subject line or signatures):`;

      const response = await this.groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: 'You are a professional email assistant. Generate concise, contextually appropriate responses that match the relationship and urgency level. Always be helpful and professional.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 150
      });

      return response.choices[0].message.content.trim();

    } catch (error) {
      console.error('AI response generation failed:', error);
      return this.generateTemplateResponse(emailData.category, responseType, senderRelationship);
    }
  }

  getToneGuide(senderRelationship, urgencyLevel) {
    let tone = '';
    
    switch (senderRelationship) {
      case 'boss':
        tone = 'Respectful and professional, acknowledge authority';
        break;
      case 'client':
        tone = 'Professional and helpful, customer service oriented';
        break;
      case 'colleague':
        tone = 'Professional but friendly, collaborative';
        break;
      case 'vendor':
        tone = 'Business-like and clear, transactional';
        break;
      case 'personal':
        tone = 'Friendly and casual, personal relationship';
        break;
      default:
        tone = 'Professional and courteous';
    }

    if (urgencyLevel === 'critical' || urgencyLevel === 'high') {
      tone += ', acknowledge urgency and provide immediate attention';
    }

    return tone;
  }

  generateTemplateResponse(category, responseType, senderRelationship) {
    const categoryTemplates = this.templates[category] || this.templates.work;
    let baseResponse = categoryTemplates[responseType] || categoryTemplates.acknowledgment;

    if (senderRelationship === 'boss') {
      baseResponse = this.makeFormal(baseResponse);
    } else if (senderRelationship === 'personal') {
      baseResponse = this.makeCasual(baseResponse);
    }

    return baseResponse;
  }

  makeFormal(response) {
    return response
      .replace('Thanks', 'Thank you')
      .replace('I\'ll', 'I will')
      .replace('can\'t', 'cannot');
  }

  makeCasual(response) {
    return response
      .replace('Thank you', 'Thanks')
      .replace('I will', 'I\'ll')
      .replace('cannot', 'can\'t');
  }
}

// Initialize analyzers AFTER groq is defined
const urgencyAnalyzer = new AdvancedUrgencyAnalyzer();
const responseGenerator = new AutoResponseGenerator(groq);

// Test endpoint
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: '🤖 Smart Email Agent is working!',
    groqStatus: groq ? 'connected' : 'not configured',
    features: ['smart-categorization', 'urgency-analysis', 'auto-responses'],
    timestamp: new Date().toISOString()
  });
});

// Smart categorization with urgency awareness
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

    // First, analyze urgency to inform categorization
    const urgencyAnalysis = urgencyAnalyzer.analyzeUrgency(subject, from, snippet);

    const prompt = `Analyze this email and categorize it. IMPORTANT: If the email has urgency indicators, prioritize "urgent" category over content-based categories.

Email Details:
Subject: ${subject || 'No subject'}
From: ${from || 'Unknown'}
To: ${to || 'Unknown'}
Content: ${snippet || 'No content'}

Categories: urgent, work, personal, newsletter, promotion, spam, meeting, invoice

CATEGORIZATION RULES:
1. If subject/content contains "urgent", "emergency", "asap", "critical" OR from high-authority sender (CEO, director, etc.) with time pressure → category = "urgent"
2. If about meetings, calls, appointments → category = "meeting"  
3. If from newsletters, marketing emails → category = "newsletter"
4. If about invoices, payments, billing → category = "invoice"
5. If promotional/sales content → category = "promotion"
6. If spam/unwanted → category = "spam"
7. If personal/family related → category = "personal"
8. Otherwise → category = "work"

Pre-analysis: This email has urgency score ${urgencyAnalysis.score}/10 (${urgencyAnalysis.level})

Respond ONLY with valid JSON:
{"category": "urgent", "confidence": 0.95, "reasoning": "Contains 'urgent' keyword and from CEO with today deadline"}`;

    console.log('Sending smart categorization request to Groq...');
    
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: 'You are an expert email classifier that prioritizes urgency detection. Always follow the categorization rules strictly. When urgency indicators are present, use "urgent" category regardless of content type.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 200
    });

    let result;
    try {
      result = JSON.parse(response.choices[0].message.content);
    } catch (parseError) {
      console.error('JSON parse failed:', parseError);
      const jsonMatch = response.choices[0].message.content.match(/\{.*\}/s);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Invalid JSON response from AI');
      }
    }

    // Double-check: if urgency score is high but category isn't urgent, override
    if (urgencyAnalysis.score >= 7 && result.category !== 'urgent') {
      console.log(`Overriding category from ${result.category} to urgent due to high urgency score`);
      result.category = 'urgent';
      result.reasoning = `Urgency override: ${result.reasoning} (Urgency score: ${urgencyAnalysis.score}/10)`;
    }
    
    res.json({
      success: true,
      category: result.category,
      confidence: result.confidence,
      reasoning: result.reasoning,
      urgencyInfo: {
        score: urgencyAnalysis.score,
        level: urgencyAnalysis.level,
        isUrgent: urgencyAnalysis.isUrgent,
        factors: urgencyAnalysis.factors
      },
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      processedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Smart categorization failed:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to categorize email with AI',
      details: error.message,
      suggestion: 'Check your GROQ_API_KEY and try again'
    });
  }
});

// Enhanced urgency scoring endpoint
router.post('/urgency-enhanced', async (req, res) => {
  try {
    const { subject, from, snippet } = req.body;

    if (!subject && !snippet) {
      return res.status(400).json({ 
        error: 'Email subject or snippet required' 
      });
    }

    const ruleAnalysis = urgencyAnalyzer.analyzeUrgency(subject, from, snippet);

    let aiAnalysis = null;
    if (groq) {
      try {
        const prompt = `Rate this email's urgency from 0-10:

Subject: ${subject || 'No subject'}
From: ${from || 'Unknown'}  
Content: ${snippet || 'No content'}

Urgency Scale:
0-2: Low (routine, informational, newsletters)
3-4: Medium (normal business, can wait)
5-6: High (important, address soon)
7-8: Urgent (same-day attention needed)
9-10: Critical (immediate action required)

Respond with JSON only:
{"score": 7, "level": "urgent", "reasoning": "CEO sender with today deadline"}`;

        const response = await groq.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: 'You are an expert urgency analyzer. Provide accurate scoring based on business context.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1,
          max_tokens: 150
        });

        aiAnalysis = JSON.parse(response.choices[0].message.content);
      } catch (error) {
        console.log('AI urgency failed:', error.message);
      }
    }

    let finalScore, finalLevel;
    if (aiAnalysis) {
      finalScore = Math.round((aiAnalysis.score * 0.6) + (ruleAnalysis.score * 0.4));
      finalLevel = finalScore >= 8 ? 'critical' : finalScore >= 6 ? 'high' : finalScore >= 4 ? 'medium' : 'low';
    } else {
      finalScore = ruleAnalysis.score;
      finalLevel = ruleAnalysis.level;
    }

    res.json({
      success: true,
      urgencyScore: finalScore,
      level: finalLevel,
      isUrgent: finalScore >= 7,
      analysis: {
        ruleBasedScore: ruleAnalysis.score,
        aiScore: aiAnalysis?.score || null,
        factors: ruleAnalysis.factors,
        reasoning: aiAnalysis?.reasoning || ruleAnalysis.reasoning
      },
      provider: aiAnalysis ? 'hybrid (AI + rules)' : 'rule-based',
      processedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Enhanced urgency failed:', error);
    res.status(500).json({ 
      success: false,
      error: 'Urgency analysis failed',
      details: error.message 
    });
  }
});

// Generate professional email responses
router.post('/generate-response', async (req, res) => {
  try {
    const { 
      subject, 
      from, 
      snippet, 
      category, 
      urgencyLevel = 'medium',
      responseType = 'auto',
      customInstructions = ''
    } = req.body;

    if (!subject && !snippet) {
      return res.status(400).json({ 
        error: 'Email subject or snippet required',
        availableResponseTypes: responseGenerator.responseTypes
      });
    }

    const senderRelationship = responseGenerator.analyzeSenderRelationship(from);
    const emailData = { subject, from, content: snippet, category };
    
    const actualResponseType = responseType === 'auto' 
      ? responseGenerator.determineResponseType(subject, snippet, category)
      : responseType;

    let generatedResponse;
    
    if (customInstructions) {
      if (groq) {
        const customPrompt = `Generate an email response with these specific instructions: "${customInstructions}"

Original email:
Subject: ${subject}
From: ${from}
Content: ${snippet}

Keep it professional and under 80 words:`;

        const response = await groq.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: 'Generate custom email responses based on user instructions.' },
            { role: 'user', content: customPrompt }
          ],
          temperature: 0.7,
          max_tokens: 150
        });

        generatedResponse = response.choices[0].message.content.trim();
      } else {
        generatedResponse = "Thank you for your email. I'll address your request and get back to you soon.";
      }
    } else {
      generatedResponse = await responseGenerator.generateAIResponse(
        emailData, 
        actualResponseType, 
        senderRelationship, 
        urgencyLevel
      );
    }

    const suggestedSubject = generateSubjectLine(subject, actualResponseType);

    res.json({
      success: true,
      response: {
        body: generatedResponse,
        suggestedSubject: suggestedSubject
      },
      context: {
        originalCategory: category,
        responseType: actualResponseType,
        senderRelationship: senderRelationship,
        urgencyLevel: urgencyLevel,
        customInstructions: customInstructions || null
      },
      metadata: {
        wordCount: generatedResponse.split(' ').length,
        provider: groq ? 'groq-ai' : 'template',
        generatedAt: new Date().toISOString()
      }
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

// Multiple response options endpoint
router.post('/generate-response-options', async (req, res) => {
  try {
    const { subject, from, snippet, category, urgencyLevel = 'medium' } = req.body;

    if (!groq) {
      return res.status(400).json({
        error: 'AI not available',
        message: 'Multiple response options require Groq API'
      });
    }

    const senderRelationship = responseGenerator.analyzeSenderRelationship(from);
    const emailData = { subject, from, content: snippet, category };

    const responseOptions = [];
    const responseTypes = ['acknowledgment', 'question', 'update_request'];

    for (const type of responseTypes) {
      try {
        const response = await responseGenerator.generateAIResponse(
          emailData, 
          type, 
          senderRelationship, 
          urgencyLevel
        );
        
        responseOptions.push({
          type: type,
          response: response,
          tone: responseGenerator.getToneGuide(senderRelationship, urgencyLevel),
          wordCount: response.split(' ').length
        });
      } catch (error) {
        console.error(`Failed to generate ${type} response:`, error);
      }
    }

    res.json({
      success: true,
      options: responseOptions,
      context: {
        senderRelationship,
        urgencyLevel,
        category
      },
      recommendation: responseOptions[0] || null,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Multiple response generation failed:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate response options',
      details: error.message 
    });
  }
});

// Response templates endpoint
router.get('/response-templates', (req, res) => {
  res.json({
    success: true,
    templates: responseGenerator.templates,
    responseTypes: responseGenerator.responseTypes,
    message: 'Available response templates and types'
  });
});

// Helper function for subject lines
function generateSubjectLine(originalSubject, responseType) {
  if (!originalSubject) return 'Re: Your Email';
  
  if (originalSubject.toLowerCase().startsWith('re:')) {
    return originalSubject;
  }
  
  switch (responseType) {
    case 'question':
      return `Re: ${originalSubject} - Question`;
    case 'accept':
      return `Re: ${originalSubject} - Confirmed`;
    case 'decline':
      return `Re: ${originalSubject} - Unable to Attend`;
    case 'schedule':
      return `Re: ${originalSubject} - Reschedule Request`;
    default:
      return `Re: ${originalSubject}`;
  }
}

module.exports = router;

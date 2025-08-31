const OpenAI = require('openai');
const { logger } = require('../utils/logger');

class IntelligentEmailAgent {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Email categories
    this.categories = {
      URGENT: 'urgent',
      WORK: 'work',
      PERSONAL: 'personal',
      NEWSLETTER: 'newsletter',
      PROMOTION: 'promotion',
      SPAM: 'spam',
      MEETING: 'meeting',
      INVOICE: 'invoice'
    };

    // Response templates
    this.responseTemplates = {
      acknowledgment: "Thank you for your email. I've received it and will respond shortly.",
      meeting_accept: "Thank you for the meeting invitation. I'll be there!",
      meeting_decline: "Thank you for the invitation, but I won't be able to attend.",
      info_request: "Thank you for reaching out. Here's the information you requested:",
      follow_up: "Following up on our previous conversation..."
    };
  }

  /**
   * Categorize email using AI
   * @param {Object} email - Email object with subject, body, sender
   * @returns {Promise<Object>} Category and confidence score
   */
  async categorizeEmail(email) {
    try {
      const prompt = this.buildCategorizationPrompt(email);
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an expert email classifier. Categorize emails into one of these categories: ${Object.values(this.categories).join(', ')}. 
            
            Respond with JSON format:
            {
              "category": "category_name",
              "confidence": 0.95,
              "reasoning": "brief explanation"
            }`
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
      
      logger.info('Email categorized', {
        subject: email.subject?.substring(0, 50),
        category: result.category,
        confidence: result.confidence
      });

      return result;

    } catch (error) {
      logger.error('Categorization failed:', error);
      return {
        category: this.categories.WORK,
        confidence: 0.5,
        reasoning: 'Fallback categorization due to error'
      };
    }
  }

  /**
   * Calculate urgency score (0-10)
   * @param {Object} email - Email object
   * @returns {Promise<number>} Urgency score
   */
  async calculateUrgencyScore(email) {
    try {
      // Rule-based urgency indicators
      let score = 0;
      const subject = email.subject?.toLowerCase() || '';
      const body = email.body?.toLowerCase() || '';
      const sender = email.sender?.toLowerCase() || '';

      // Time-sensitive keywords
      const urgentKeywords = ['urgent', 'asap', 'immediate', 'emergency', 'deadline', 'today', 'now'];
      const urgentCount = urgentKeywords.filter(keyword => 
        subject.includes(keyword) || body.includes(keyword)
      ).length;
      score += urgentCount * 2;

      // Sender importance (you can customize this)
      const importantDomains = ['boss', 'ceo', 'director', 'manager'];
      if (importantDomains.some(domain => sender.includes(domain))) {
        score += 3;
      }

      // Meeting-related urgency
      if (subject.includes('meeting') && (subject.includes('today') || subject.includes('tomorrow'))) {
        score += 2;
      }

      // Financial keywords
      const financialKeywords = ['invoice', 'payment', 'overdue', 'bill'];
      if (financialKeywords.some(keyword => subject.includes(keyword) || body.includes(keyword))) {
        score += 2;
      }

      // Cap at 10
      score = Math.min(score, 10);

      // Use AI for complex urgency assessment if score is borderline
      if (score >= 4 && score <= 6) {
        score = await this.aiUrgencyAssessment(email);
      }

      return score;

    } catch (error) {
      logger.error('Urgency calculation failed:', error);
      return 5; // Default medium urgency
    }
  }

  /**
   * Generate automatic response draft
   * @param {Object} email - Original email
   * @param {string} responseType - Type of response to generate
   * @returns {Promise<string>} Generated response
   */
  async generateResponse(email, responseType = 'general') {
    try {
      const prompt = this.buildResponsePrompt(email, responseType);
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a professional email assistant. Generate concise, polite, and contextually appropriate email responses. 
            Keep responses under 100 words unless more detail is specifically needed.`
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
      
      logger.info('Response generated', {
        subject: email.subject?.substring(0, 50),
        responseType,
        length: generatedResponse.length
      });

      return generatedResponse;

    } catch (error) {
      logger.error('Response generation failed:', error);
      return this.responseTemplates.acknowledgment;
    }
  }

  /**
   * Process email batch
   * @param {Array} emails - Array of email objects
   * @returns {Promise<Array>} Processed emails with AI insights
   */
  async processBatch(emails) {
    const processed = [];
    
    for (const email of emails) {
      try {
        const [category, urgencyScore] = await Promise.all([
          this.categorizeEmail(email),
          this.calculateUrgencyScore(email)
        ]);

        processed.push({
          ...email,
          aiAnalysis: {
            category: category.category,
            categoryConfidence: category.confidence,
            urgencyScore,
            isUrgent: urgencyScore >= 7,
            needsResponse: this.needsResponse(email, category.category),
            processingTime: new Date().toISOString()
          }
        });

      } catch (error) {
        logger.error(`Failed to process email ${email.id}:`, error);
        processed.push({
          ...email,
          aiAnalysis: {
            error: 'Processing failed',
            processingTime: new Date().toISOString()
          }
        });
      }
    }

    return processed;
  }

  // Helper methods
  buildCategorizationPrompt(email) {
    return `
    Subject: ${email.subject || 'No subject'}
    From: ${email.sender || 'Unknown sender'}
    Body: ${(email.body || '').substring(0, 500)}...
    
    Categorize this email and provide reasoning.
    `;
  }

  buildResponsePrompt(email, responseType) {
    return `
    Generate a professional email response for:
    
    Original Subject: ${email.subject}
    From: ${email.sender}
    Body: ${(email.body || '').substring(0, 300)}...
    
    Response Type: ${responseType}
    
    Generate an appropriate response that addresses the main points.
    `;
  }

  async aiUrgencyAssessment(email) {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Rate email urgency from 1-10. Respond only with a number.'
          },
          {
            role: 'user',
            content: `Subject: ${email.subject}\nBody: ${email.body?.substring(0, 200)}`
          }
        ],
        temperature: 0.1,
        max_tokens: 10
      });

      return parseInt(response.choices[0].message.content) || 5;
    } catch (error) {
      return 5;
    }
  }

  needsResponse(email, category) {
    const noResponseCategories = ['newsletter', 'promotion', 'spam'];
    return !noResponseCategories.includes(category) && 
           !email.subject?.toLowerCase().includes('no reply');
  }
}

module.exports = IntelligentEmailAgent;
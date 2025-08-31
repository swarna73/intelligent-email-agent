const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');

class GmailService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/gmail/callback'
    );
    
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    this.scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify'
    ];
  }

  /**
   * Generate OAuth URL for user authorization
   * @returns {string} Authorization URL
   */
  getAuthUrl() {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
      prompt: 'consent'
    });
  }

  /**
   * Handle OAuth callback and store tokens
   * @param {string} code - Authorization code from Google
   * @returns {Promise<Object>} Token data
   */
  async handleCallback(code) {
    try {
      const { tokens } = await this.oauth2Client.getAccessToken(code);
      this.oauth2Client.setCredentials(tokens);
      
      // Store tokens securely (you might want to encrypt these)
      await this.saveTokens(tokens);
      
      logger.info('Gmail authorization successful');
      return tokens;
    } catch (error) {
      logger.error('Gmail authorization failed:', error);
      throw new Error('Authorization failed');
    }
  }

  /**
   * Load stored tokens
   * @returns {Promise<boolean>} Success status
   */
  async loadTokens() {
    try {
      const tokenPath = path.join(process.cwd(), 'data', 'gmail_tokens.json');
      const tokens = JSON.parse(await fs.readFile(tokenPath, 'utf8'));
      this.oauth2Client.setCredentials(tokens);
      return true;
    } catch (error) {
      logger.warn('No stored Gmail tokens found');
      return false;
    }
  }

  /**
   * Fetch emails from Gmail
   * @param {Object} options - Fetch options
   * @returns {Promise<Array>} Array of email objects
   */
  async fetchEmails(options = {}) {
    try {
      const {
        maxResults = 50,
        query = '',
        labelIds = ['INBOX'],
        includeSpamTrash = false
      } = options;

      // Get message list
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults,
        q: query,
        labelIds,
        includeSpamTrash
      });

      if (!response.data.messages) {
        return [];
      }

      // Fetch full message details
      const emails = await Promise.all(
        response.data.messages.map(message => this.getEmailDetails(message.id))
      );

      logger.info(`Fetched ${emails.length} emails from Gmail`);
      return emails.filter(email => email !== null);

    } catch (error) {
      logger.error('Failed to fetch emails:', error);
      throw new Error('Failed to fetch emails from Gmail');
    }
  }

  /**
   * Get detailed email information
   * @param {string} messageId - Gmail message ID
   * @returns {Promise<Object>} Email details
   */
  async getEmailDetails(messageId) {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const message = response.data;
      const headers = message.payload.headers;
      
      // Extract headers
      const getHeader = (name) => {
        const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
        return header ? header.value : '';
      };

      // Extract body
      const body = this.extractBody(message.payload);
      
      // Extract attachments info
      const attachments = this.extractAttachments(message.payload);

      return {
        id: messageId,
        threadId: message.threadId,
        subject: getHeader('subject'),
        sender: getHeader('from'),
        recipient: getHeader('to'),
        cc: getHeader('cc'),
        bcc: getHeader('bcc'),
        date: getHeader('date'),
        body: body,
        snippet: message.snippet,
        labelIds: message.labelIds,
        attachments: attachments,
        isRead: !message.labelIds.includes('UNREAD'),
        isImportant: message.labelIds.includes('IMPORTANT'),
        timestamp: new Date(parseInt(message.internalDate))
      };

    } catch (error) {
      logger.error(`Failed to get email details for ${messageId}:`, error);
      return null;
    }
  }

  /**
   * Send email response
   * @param {Object} emailData - Email data
   * @returns {Promise<string>} Sent message ID
   */
  async sendEmail(emailData) {
    try {
      const { to, subject, body, inReplyTo, threadId } = emailData;
      
      // Create email message
      const email = [
        `To: ${to}`,
        `Subject: ${subject}`,
        inReplyTo ? `In-Reply-To: ${inReplyTo}` : '',
        'Content-Type: text/html; charset=utf-8',
        '',
        body
      ].filter(line => line).join('\r\n');

      // Encode email
      const encodedEmail = Buffer.from(email)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail,
          threadId: threadId
        }
      });

      logger.info(`Email sent successfully: ${response.data.id}`);
      return response.data.id;

    } catch (error) {
      logger.error('Failed to send email:', error);
      throw new Error('Failed to send email');
    }
  }

  /**
   * Apply labels to emails
   * @param {Array} messageIds - Array of message IDs
   * @param {Array} addLabelIds - Labels to add
   * @param {Array} removeLabelIds - Labels to remove
   */
  async modifyLabels(messageIds, addLabelIds = [], removeLabelIds = []) {
    try {
      await this.gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: {
          ids: messageIds,
          addLabelIds,
          removeLabelIds
        }
      });

      logger.info(`Modified labels for ${messageIds.length} messages`);
    } catch (error) {
      logger.error('Failed to modify labels:', error);
      throw new Error('Failed to modify email labels');
    }
  }

  /**
   * Create custom label
   * @param {string} name - Label name
   * @returns {Promise<string>} Label ID
   */
  async createLabel(name) {
    try {
      const response = await this.gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name: name,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show'
        }
      });

      logger.info(`Created label: ${name}`);
      return response.data.id;
    } catch (error) {
      logger.error(`Failed to create label ${name}:`, error);
      throw new Error('Failed to create label');
    }
  }

  // Helper methods
  extractBody(payload) {
    let body = '';

    if (payload.body && payload.body.data) {
      body = Buffer.from(payload.body.data, 'base64').toString('utf8');
    } else if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body.data) {
          body = Buffer.from(part.body.data, 'base64').toString('utf8');
          break;
        } else if (part.mimeType === 'text/html' && part.body.data && !body) {
          body = Buffer.from(part.body.data, 'base64').toString('utf8');
        }
      }
    }

    return body;
  }

  extractAttachments(payload) {
    const attachments = [];

    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.filename && part.body.attachmentId) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body.size,
            attachmentId: part.body.attachmentId
          });
        }
      }
    }

    return attachments;
  }

  async saveTokens(tokens) {
    try {
      const dataDir = path.join(process.cwd(), 'data');
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(
        path.join(dataDir, 'gmail_tokens.json'),
        JSON.stringify(tokens, null, 2)
      );
    } catch (error) {
      logger.error('Failed to save tokens:', error);
    }
  }
}

module.exports = GmailService;
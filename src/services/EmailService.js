/**
 * 📧 Email Service - Mailgun integration for error notifications
 */

const formData = require('form-data');
const Mailgun = require('mailgun.js');
const Logger = require('../utils/Logger');

class EmailService {
  constructor(config) {
    this.config = config;
    this.isEnabled = false;
    this.mailgun = null;
    this.mg = null;
    this.errorThrottle = new Map(); // Track recent error emails to avoid spam
    this.THROTTLE_DURATION = 15 * 60 * 1000; // 15 minutes
    this.MAX_ERRORS_PER_PERIOD = 5; // Max 5 error emails per 15 minutes

    // Initialize Mailgun if credentials are provided
    if (config.mailgun?.apiKey && config.mailgun?.domain) {
      try {
        const mailgun = new Mailgun(formData);
        this.mg = mailgun.client({
          username: 'api',
          key: config.mailgun.apiKey,
          url: 'https://api.eu.mailgun.net' // Use EU region
        });
        this.isEnabled = true;
        Logger.info('✅ Email service initialized with Mailgun');
      } catch (error) {
        Logger.error('❌ Failed to initialize Mailgun:', error.message);
      }
    } else {
      Logger.info('📧 Email service not configured - no Mailgun credentials provided');
    }
  }

  /**
   * Send sync error notification email
   */
  async sendSyncErrorNotification(errorDetails) {
    if (!this.isEnabled) {
      return false;
    }

    // Check throttling
    if (this.isThrottled()) {
      Logger.info('📧 Email throttled - too many error emails sent recently');
      return false;
    }

    try {
      const {
        syncType = 'Unknown',
        errorCount = 0,
        totalCount = 0,
        duration = 0,
        errors = [],
        timestamp = new Date().toISOString()
      } = errorDetails;

      // Build error summary
      const errorSummary = errors.slice(0, 10).map(err =>
        `• ${err.character || 'Unknown'}: ${err.message}`
      ).join('\n');

      const additionalErrors = errors.length > 10 ?
        `\n... and ${errors.length - 10} more errors` : '';

      const messageData = {
        from: `WoW Guild Sync <noreply@${this.config.mailgun.domain}>`,
        to: [this.config.contactEmail],
        subject: `⚠️ Guild Sync Error - ${syncType} (${errorCount} errors)`,
        text: `Guild Sync encountered errors during ${syncType} synchronization.

Sync Summary:
━━━━━━━━━━━━━━━━━━━━━
• Sync Type: ${syncType}
• Total Characters: ${totalCount}
• Errors: ${errorCount}
• Duration: ${duration}s
• Timestamp: ${timestamp}

Error Details:
━━━━━━━━━━━━━━━━━━━━━
${errorSummary}${additionalErrors}

Environment:
━━━━━━━━━━━━━━━━━━━━━
• Guild: ${this.config.guild?.name || 'Unknown'}
• Realm: ${this.config.guild?.realm || 'Unknown'}
• Region: ${this.config.guild?.region || 'Unknown'}

Please check the application logs for more details.`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0; }
    .content { background: #f7f7f7; padding: 20px; border-radius: 0 0 10px 10px; }
    .summary { background: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    .errors { background: #fff5f5; border-left: 4px solid #f56565; padding: 15px; border-radius: 4px; }
    .error-item { margin: 8px 0; font-family: monospace; font-size: 13px; }
    .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #718096; font-size: 14px; }
    .stat { display: inline-block; margin-right: 20px; }
    .stat-label { color: #718096; font-size: 12px; text-transform: uppercase; }
    .stat-value { font-size: 20px; font-weight: bold; color: #2d3748; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">⚠️ Guild Sync Error Alert</h2>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Synchronization encountered errors</p>
    </div>
    <div class="content">
      <div class="summary">
        <h3 style="margin-top: 0;">Sync Summary</h3>
        <div>
          <div class="stat">
            <div class="stat-label">Type</div>
            <div class="stat-value">${syncType}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Errors</div>
            <div class="stat-value" style="color: #f56565;">${errorCount}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Total</div>
            <div class="stat-value">${totalCount}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Duration</div>
            <div class="stat-value">${duration}s</div>
          </div>
        </div>
      </div>

      <div class="errors">
        <h4 style="margin-top: 0;">Error Details (First 10)</h4>
        ${errors.slice(0, 10).map(err =>
          `<div class="error-item">• <strong>${err.character || 'Unknown'}</strong>: ${err.message}</div>`
        ).join('')}
        ${errors.length > 10 ? `<div style="margin-top: 10px; font-style: italic;">... and ${errors.length - 10} more errors</div>` : ''}
      </div>

      <div class="footer">
        <div><strong>Guild:</strong> ${this.config.guild?.name || 'Unknown'} - ${this.config.guild?.realm || 'Unknown'} (${this.config.guild?.region || 'Unknown'})</div>
        <div><strong>Timestamp:</strong> ${timestamp}</div>
        <div style="margin-top: 10px; font-style: italic;">Check application logs for detailed information.</div>
      </div>
    </div>
  </div>
</body>
</html>`
      };

      const result = await this.mg.messages.create(this.config.mailgun.domain, messageData);

      // Track email sent for throttling
      this.recordErrorEmail();

      Logger.info(`✅ Error notification email sent: ${result.id}`);
      return true;
    } catch (error) {
      Logger.error('❌ Failed to send error notification email:', error.message);
      return false;
    }
  }

  /**
   * Send critical error notification (for complete sync failures)
   */
  async sendCriticalErrorNotification(error, context = {}) {
    if (!this.isEnabled) {
      return false;
    }

    try {
      const {
        syncType = 'Unknown',
        timestamp = new Date().toISOString()
      } = context;

      const messageData = {
        from: `WoW Guild Sync <noreply@${this.config.mailgun.domain}>`,
        to: [this.config.contactEmail],
        subject: `🚨 CRITICAL: Guild Sync Failed - ${syncType}`,
        text: `CRITICAL ERROR: Guild Sync has completely failed.

Error Details:
━━━━━━━━━━━━━━━━━━━━━
Type: ${syncType}
Error: ${error.message || error}
Stack: ${error.stack || 'No stack trace available'}
Timestamp: ${timestamp}

Environment:
━━━━━━━━━━━━━━━━━━━━━
• Guild: ${this.config.guild?.name || 'Unknown'}
• Realm: ${this.config.guild?.realm || 'Unknown'}
• Region: ${this.config.guild?.region || 'Unknown'}

IMMEDIATE ACTION REQUIRED: Please check the application immediately.`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #f56565 0%, #c53030 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0; }
    .content { background: #fff5f5; padding: 20px; border-radius: 0 0 10px 10px; border: 2px solid #f56565; }
    .error-box { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #c53030; }
    .stack-trace { background: #2d3748; color: #e2e8f0; padding: 15px; border-radius: 4px; font-family: monospace; font-size: 12px; overflow-x: auto; }
    .action-required { background: #fed7d7; padding: 15px; border-radius: 8px; margin-top: 20px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">🚨 CRITICAL SYNC FAILURE</h2>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Immediate action required</p>
    </div>
    <div class="content">
      <div class="error-box">
        <h3 style="margin-top: 0; color: #c53030;">Error Details</h3>
        <div><strong>Sync Type:</strong> ${syncType}</div>
        <div><strong>Timestamp:</strong> ${timestamp}</div>
        <div style="margin-top: 10px;"><strong>Error Message:</strong></div>
        <div style="color: #c53030; margin-top: 5px;">${error.message || error}</div>
      </div>

      ${error.stack ? `
      <div style="margin-top: 20px;">
        <h4 style="margin-bottom: 10px;">Stack Trace</h4>
        <div class="stack-trace">${error.stack.replace(/\n/g, '<br>')}</div>
      </div>
      ` : ''}

      <div class="error-box">
        <h4 style="margin-top: 0;">Environment</h4>
        <div><strong>Guild:</strong> ${this.config.guild?.name || 'Unknown'}</div>
        <div><strong>Realm:</strong> ${this.config.guild?.realm || 'Unknown'}</div>
        <div><strong>Region:</strong> ${this.config.guild?.region || 'Unknown'}</div>
      </div>

      <div class="action-required">
        ⚠️ IMMEDIATE ACTION REQUIRED: Please check the application logs and restart the service if necessary.
      </div>
    </div>
  </div>
</body>
</html>`
      };

      const result = await this.mg.messages.create(this.config.mailgun.domain, messageData);
      Logger.info(`✅ Critical error notification email sent: ${result.id}`);
      return true;
    } catch (error) {
      Logger.error('❌ Failed to send critical error notification email:', error.message);
      return false;
    }
  }

  /**
   * Check if email sending is throttled
   */
  isThrottled() {
    const now = Date.now();
    const recentEmails = [];

    // Clean up old entries and count recent ones
    for (const [timestamp] of this.errorThrottle) {
      if (now - timestamp < this.THROTTLE_DURATION) {
        recentEmails.push(timestamp);
      } else {
        this.errorThrottle.delete(timestamp);
      }
    }

    return recentEmails.length >= this.MAX_ERRORS_PER_PERIOD;
  }

  /**
   * Record that an error email was sent
   */
  recordErrorEmail() {
    const now = Date.now();
    this.errorThrottle.set(now, true);
  }

  /**
   * Send test email to verify configuration
   */
  async sendTestEmail() {
    if (!this.isEnabled) {
      Logger.error('❌ Cannot send test email - Email service not enabled');
      return false;
    }

    try {
      const messageData = {
        from: `WoW Guild Sync <noreply@${this.config.mailgun.domain}>`,
        to: [this.config.contactEmail],
        subject: '✅ Guild Sync Email Test',
        text: 'This is a test email from WoW Guild Sync. If you receive this, your email configuration is working correctly!',
        html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0; }
    .content { background: #f7f7f7; padding: 20px; border-radius: 0 0 10px 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">✅ Email Configuration Test</h2>
    </div>
    <div class="content">
      <p>This is a test email from <strong>WoW Guild Sync</strong>.</p>
      <p>Your email configuration is working correctly! You will receive notifications when sync errors occur.</p>
      <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #718096; font-size: 14px;">
        <div><strong>Guild:</strong> ${this.config.guild?.name || 'Unknown'}</div>
        <div><strong>Realm:</strong> ${this.config.guild?.realm || 'Unknown'}</div>
        <div><strong>Region:</strong> ${this.config.guild?.region || 'Unknown'}</div>
      </div>
    </div>
  </div>
</body>
</html>`
      };

      const result = await this.mg.messages.create(this.config.mailgun.domain, messageData);
      Logger.info(`✅ Test email sent successfully: ${result.id}`);
      return true;
    } catch (error) {
      Logger.error('❌ Failed to send test email:', error.message);
      return false;
    }
  }
}

module.exports = EmailService;
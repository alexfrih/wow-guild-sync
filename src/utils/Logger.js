/**
 * 📝 Logging utility with Docker-friendly output
 */

const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.levels = {
      error: 0,
      warn: 1, 
      info: 2,
      debug: 3
    };
    
    this.currentLevel = this.levels[process.env.LOG_LEVEL] || this.levels.info;
    this.logToFile = process.env.LOG_TO_FILE === 'true';
    this.logPath = process.env.LOG_PATH || './logs';
    
    // Create log directory if logging to file
    if (this.logToFile) {
      this.ensureLogDirectory();
    }
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logPath)) {
      fs.mkdirSync(this.logPath, { recursive: true });
    }
  }

  formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    const pid = process.pid;
    
    // Format additional arguments
    const additional = args.length > 0 ? ' ' + args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ') : '';
    
    return `${timestamp} [${pid}] ${levelStr}: ${message}${additional}`;
  }

  log(level, message, ...args) {
    if (this.levels[level] > this.currentLevel) {
      return; // Skip if level is too verbose
    }

    const formattedMessage = this.formatMessage(level, message, ...args);
    
    // Always log to console (Docker captures this)
    if (level === 'error') {
      console.error(formattedMessage);
    } else if (level === 'warn') {
      console.warn(formattedMessage);
    } else {
      console.log(formattedMessage);
    }

    // Optionally log to file
    if (this.logToFile) {
      this.writeToFile(level, formattedMessage);
    }
  }

  writeToFile(level, message) {
    try {
      const date = new Date().toISOString().split('T')[0];
      const filename = `guild-sync-${date}.log`;
      const filepath = path.join(this.logPath, filename);
      
      fs.appendFileSync(filepath, message + '\\n');
      
      // Rotate logs if file gets too large (100MB default)
      const stats = fs.statSync(filepath);
      const maxSize = 100 * 1024 * 1024; // 100MB
      
      if (stats.size > maxSize) {
        this.rotateLog(filepath);
      }
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  rotateLog(filepath) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedPath = filepath.replace('.log', `-${timestamp}.log`);
      
      fs.renameSync(filepath, rotatedPath);
      
      // Keep only last 5 rotated logs
      const logDir = path.dirname(filepath);
      const files = fs.readdirSync(logDir)
        .filter(file => file.startsWith('guild-sync-') && file.endsWith('.log'))
        .sort()
        .reverse();
      
      if (files.length > 5) {
        files.slice(5).forEach(file => {
          fs.unlinkSync(path.join(logDir, file));
        });
      }
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  error(message, ...args) {
    this.log('error', message, ...args);
  }

  warn(message, ...args) {
    this.log('warn', message, ...args);
  }

  info(message, ...args) {
    this.log('info', message, ...args);
  }

  debug(message, ...args) {
    this.log('debug', message, ...args);
  }

  // Structured logging for metrics
  metric(name, value, tags = {}) {
    const metric = {
      type: 'metric',
      name,
      value,
      tags,
      timestamp: new Date().toISOString()
    };
    
    this.info('📊 METRIC:', JSON.stringify(metric));
  }

  // Performance timing
  time(label) {
    console.time(label);
  }

  timeEnd(label) {
    console.timeEnd(label);
  }
}

module.exports = new Logger();
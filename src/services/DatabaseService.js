const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Updated with upsertGuildMember method

class DatabaseService {
  constructor(config) {
    this.dbPath = config.database.path;
    this.db = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  async initialize() {
    await this.connect();
    await this.initTables();
  }

  async initTables() {
    return new Promise((resolve, reject) => {
      const sql = `
        CREATE TABLE IF NOT EXISTS guild_members (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          character_name TEXT NOT NULL,
          realm TEXT NOT NULL,
          class TEXT,
          level INTEGER,
          item_level REAL,
          mythic_plus_score REAL,
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
          is_active INTEGER DEFAULT 1,
          UNIQUE(character_name, realm)
        );
        
        CREATE TABLE IF NOT EXISTS sync_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          status TEXT NOT NULL,
          message TEXT,
          character_name TEXT
        );
      `;
      
      this.db.exec(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async upsertGuildMember(member) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO guild_members 
        (character_name, realm, class, level, item_level, mythic_plus_score, last_updated, is_active)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
      `;
      
      this.db.run(sql, [
        member.character_name,
        member.realm,
        member.class,
        member.level,
        member.item_level,
        member.mythic_plus_score
      ], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async cleanupDuplicates() {
    return new Promise((resolve, reject) => {
      const sql = `
        DELETE FROM guild_members 
        WHERE id NOT IN (
          SELECT MIN(id) 
          FROM guild_members 
          GROUP BY character_name, realm
        )
      `;
      
      this.db.run(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async schedulePlayerSync(name, realm, region, syncType) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO sync_logs (character_name, status, message)
        VALUES (?, 'scheduled', ?)
      `;
      
      this.db.run(sql, [name, `Scheduled ${syncType} sync`], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async markInactiveMembers() {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE guild_members 
        SET is_active = 0 
        WHERE last_updated < datetime('now', '-7 days')
      `;
      
      this.db.run(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async getNextSyncJobs(limit = 10) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT character_name, realm 
        FROM guild_members 
        WHERE is_active = 1 
        AND (level IS NULL OR item_level IS NULL OR last_updated < datetime('now', '-1 hour'))
        ORDER BY last_updated ASC NULLS FIRST
        LIMIT ?
      `;
      
      this.db.all(sql, [limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async healthCheck() {
    return new Promise((resolve, reject) => {
      this.db.get("SELECT 1", (err) => {
        if (err) {
          reject(err);
        } else {
          resolve({ status: 'healthy' });
        }
      });
    });
  }

  async markJobProcessing(jobId) {
    // For now, just log - we're using a simple approach without job tracking
    return Promise.resolve();
  }

  async markJobCompleted(jobId, intervalMinutes) {
    // For now, just log - we're using a simple approach without job tracking  
    return Promise.resolve();
  }

  async markJobFailed(jobId, errorMessage) {
    // For now, just log - we're using a simple approach without job tracking
    return Promise.resolve();
  }

  async getMemberCount() {
    const result = await this.db.get('SELECT COUNT(*) as count FROM guild_members');
    return result.count;
  }
}

module.exports = DatabaseService;
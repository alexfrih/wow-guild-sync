const sqlite3 = require('sqlite3').verbose();
const path = require('path');

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
          is_active INTEGER DEFAULT 1
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
}

module.exports = DatabaseService;
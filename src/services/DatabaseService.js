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
          current_pvp_rating INTEGER DEFAULT 0,
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

        CREATE TABLE IF NOT EXISTS database_versions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER NOT NULL,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          description TEXT
        );
      `;
      
      this.db.exec(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          // Run database migrations
          this.runMigrations()
            .then(() => resolve())
            .catch(reject);
        }
      });
    });
  }

  async runMigrations() {
    // Get current database version
    const currentVersion = await this.getCurrentVersion();
    console.log(`📊 Current database version: ${currentVersion}`);

    const migrations = [
      {
        version: 1,
        description: 'Add current_pvp_rating column',
        sql: 'ALTER TABLE guild_members ADD COLUMN current_pvp_rating INTEGER DEFAULT 0'
      }
      // Add future migrations here with version 2, 3, etc.
    ];

    for (const migration of migrations) {
      if (currentVersion < migration.version) {
        try {
          await this.applyMigration(migration);
          console.log(`✅ Applied migration v${migration.version}: ${migration.description}`);
        } catch (error) {
          // If column already exists, ignore the error
          if (error.message && error.message.includes('duplicate column name')) {
            console.log(`⚠️  Migration v${migration.version} already applied (column exists)`);
            await this.recordMigration(migration.version, migration.description);
          } else {
            throw error;
          }
        }
      }
    }
  }

  async getCurrentVersion() {
    return new Promise((resolve, reject) => {
      this.db.get("SELECT MAX(version) as version FROM database_versions", (err, row) => {
        if (err) {
          // Table doesn't exist yet, start from version 0
          resolve(0);
        } else {
          resolve(row?.version || 0);
        }
      });
    });
  }

  async applyMigration(migration) {
    return new Promise((resolve, reject) => {
      this.db.run(migration.sql, (err) => {
        if (err) {
          reject(err);
        } else {
          this.recordMigration(migration.version, migration.description)
            .then(resolve)
            .catch(reject);
        }
      });
    });
  }

  async recordMigration(version, description) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO database_versions (version, description) VALUES (?, ?)",
        [version, description],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  async upsertGuildMember(member) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO guild_members 
        (character_name, realm, class, level, item_level, mythic_plus_score, current_pvp_rating, last_updated, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
      `;
      
      this.db.run(sql, [
        member.character_name,
        member.realm,
        member.class,
        member.level,
        member.item_level,
        member.mythic_plus_score,
        member.current_pvp_rating || 0
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
        AND (level IS NULL OR item_level IS NULL OR item_level = 0 OR last_updated < datetime('now', '-1 hour'))
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

  async resetAllData() {
    return new Promise((resolve, reject) => {
      // Get current counts before reset
      this.db.all(`
        SELECT 
          (SELECT COUNT(*) FROM guild_members) as member_count,
          (SELECT COUNT(*) FROM sync_logs) as log_count
      `, (err, result) => {
        if (err) {
          reject(err);
          return;
        }

        const beforeCounts = result[0];

        // Clear all data
        const resetSql = `
          DELETE FROM guild_members;
          DELETE FROM sync_logs;
          UPDATE database_versions SET applied_at = CURRENT_TIMESTAMP WHERE version = (SELECT MAX(version) FROM database_versions);
        `;
        
        this.db.exec(resetSql, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve({
              members_deleted: beforeCounts.member_count,
              logs_deleted: beforeCounts.log_count,
              message: 'All guild member and sync log data has been cleared'
            });
          }
        });
      });
    });
  }

  async forceAllCharactersNeedSync() {
    return new Promise((resolve, reject) => {
      // Set all active characters to need sync by setting last_updated to very old date
      const sql = `
        UPDATE guild_members 
        SET last_updated = datetime('2020-01-01 00:00:00')
        WHERE is_active = 1
      `;
      
      this.db.run(sql, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            characters_marked: this.changes,
            message: 'All active characters marked for immediate sync'
          });
        }
      });
    });
  }
}

module.exports = DatabaseService;
const { PrismaClient } = require('@prisma/client');

class PrismaService {
  constructor() {
    this.prisma = new PrismaClient();
  }

  async connect() {
    await this.prisma.$connect();
  }

  async close() {
    await this.prisma.$disconnect();
  }

  async initialize() {
    await this.connect();
  }

  async upsertGuildMember(member) {
    // Support both name and character_name fields for flexibility
    const characterName = member.character_name || member.name;
    const realm = member.realm;

    // First, ensure we have required fields
    if (!characterName || !realm) {
      throw new Error(`Invalid member data: character_name=${characterName}, realm=${realm}`);
    }

    return await this.prisma.guildMember.upsert({
      where: {
        character_name_realm: {
          character_name: characterName,
          realm: realm,
        },
      },
      update: {
        class: member.class,
        level: member.level,
        item_level: member.item_level,
        mythic_plus_score: member.mythic_plus_score,
        current_pvp_rating: member.current_pvp_rating || 0,
        last_updated: new Date(),
        is_active: true,
      },
      create: {
        character_name: characterName,
        realm: realm,
        class: member.class,
        level: member.level,
        item_level: member.item_level,
        mythic_plus_score: member.mythic_plus_score,
        current_pvp_rating: member.current_pvp_rating || 0,
        is_active: true,
      },
    });
  }

  async cleanupDuplicates() {
    // Prisma handles uniqueness automatically with the unique constraint
    // This method is kept for backward compatibility but doesn't need to do anything
    // since Prisma enforces the unique constraint on (character_name, realm)
    return Promise.resolve();
  }

  async schedulePlayerSync(characterName, realm, region, syncType) {
    return await this.prisma.syncLog.create({
      data: {
        character_name: characterName,
        status: 'scheduled',
        message: `Scheduled ${syncType} sync`,
      },
    });
  }

  async markInactiveMembers() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    return await this.prisma.guildMember.updateMany({
      where: {
        last_updated: {
          lt: weekAgo,
        },
      },
      data: {
        is_active: false,
      },
    });
  }

  async getNextSyncJobs(limit = 10) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    return await this.prisma.guildMember.findMany({
      where: {
        is_active: true,
        OR: [
          { level: null },
          { item_level: null },
          { item_level: 0 },
          { last_updated: { lt: oneHourAgo } },
        ],
      },
      select: {
        character_name: true,
        realm: true,
      },
      orderBy: {
        last_updated: 'asc',
      },
      take: limit,
    });
  }

  async healthCheck() {
    try {
      // Simple health check by counting records
      await this.prisma.guildMember.count();
      return { status: 'healthy' };
    } catch (error) {
      throw error;
    }
  }

  async markJobProcessing(jobId) {
    return Promise.resolve();
  }

  async markJobCompleted(jobId, intervalMinutes) {
    return Promise.resolve();
  }

  async markJobFailed(jobId, errorMessage) {
    return Promise.resolve();
  }

  async getMemberCount() {
    const result = await this.prisma.guildMember.count();
    return result;
  }

  async forceAllCharactersNeedSync() {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    
    const result = await this.prisma.guildMember.updateMany({
      where: {
        is_active: true,
      },
      data: {
        last_updated: twoHoursAgo,
      },
    });

    return {
      characters_marked: result.count,
      timestamp: new Date().toISOString(),
    };
  }

  async resetAllData() {
    const memberCount = await this.prisma.guildMember.count();
    const logCount = await this.prisma.syncLog.count();

    await this.prisma.guildMember.deleteMany();
    await this.prisma.syncLog.deleteMany();

    const latestVersion = await this.prisma.databaseVersion.findFirst({
      orderBy: { version: 'desc' },
    });

    if (latestVersion) {
      await this.prisma.databaseVersion.update({
        where: { id: latestVersion.id },
        data: { applied_at: new Date() },
      });
    }

    return {
      members_deleted: memberCount,
      logs_deleted: logCount,
      message: 'All guild member and sync log data has been cleared',
    };
  }

  // Migration methods are handled by Prisma migrations, but keeping for compatibility
  async runMigrations() {
    console.log('📊 Migrations are now handled by Prisma');
  }

  async getCurrentVersion() {
    const latest = await this.prisma.databaseVersion.findFirst({
      orderBy: { version: 'desc' },
    });
    return latest?.version || 0;
  }

  async applyMigration(migration) {
    console.log(`⚠️ Migrations should be handled via 'npx prisma migrate dev'`);
  }

  async recordMigration(version, description) {
    return await this.prisma.databaseVersion.create({
      data: {
        version,
        description,
      },
    });
  }

  async getGuildMembers() {
    return await this.prisma.guildMember.findMany({
      where: {
        is_active: true,
      },
      select: {
        character_name: true,
        realm: true,
        class: true,
        level: true,
        item_level: true,
        mythic_plus_score: true,
        current_pvp_rating: true,
        last_updated: true,
        is_active: true,
      },
      orderBy: [
        { item_level: 'desc' },
        { character_name: 'asc' },
      ],
    });
  }

  async logSyncError(characterName, realm, errorType, errorMessage, service, urlAttempted = null) {
    try {
      await this.prisma.syncError.create({
        data: {
          character_name: characterName,
          realm: realm,
          error_type: errorType,
          error_message: errorMessage,
          service: service,
          url_attempted: urlAttempted,
        },
      });
    } catch (error) {
      console.error('Failed to log sync error:', error);
    }
  }

  async getSyncErrors(limit = 100) {
    return await this.prisma.syncError.findMany({
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
    });
  }

  async getErrorStats() {
    const total = await this.prisma.syncError.count();
    const last24h = await this.prisma.syncError.count({
      where: {
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    const errorTypes = await this.prisma.syncError.groupBy({
      by: ['error_type'],
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
    });

    return {
      total,
      last24h,
      errorTypes: errorTypes.map(et => ({
        type: et.error_type,
        count: et._count.id,
      })),
    };
  }

  async clearOldErrors(daysToKeep = 7) {
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    const result = await this.prisma.syncError.deleteMany({
      where: {
        timestamp: {
          lt: cutoff,
        },
      },
    });
    return result.count;
  }
}

module.exports = PrismaService;
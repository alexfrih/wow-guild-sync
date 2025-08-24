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
        raid_progress: member.raid_progress,
        last_updated: new Date(),
      },
      create: {
        character_name: characterName,
        realm: realm,
        class: member.class,
        level: member.level,
        item_level: member.item_level,
        mythic_plus_score: member.mythic_plus_score,
        current_pvp_rating: member.current_pvp_rating || 0,
        raid_progress: member.raid_progress,
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

  // Removed markInactiveMembers() - was based on invented is_active field

  async getNextSyncJobs(limit = 10) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    return await this.prisma.guildMember.findMany({
      where: {
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
    const members = await this.prisma.guildMember.findMany({
      select: {
        character_name: true,
        realm: true,
        class: true,
        level: true,
        item_level: true,
        mythic_plus_score: true,
        raid_progress: true,
        last_login_timestamp: true,
        activity_status: true,
        last_activity_check: true,
        last_updated: true,
      },
      orderBy: [
        { item_level: 'desc' },
        { character_name: 'asc' },
      ],
    });
    
    // Convert BigInt to number for JSON serialization
    return members.map(member => ({
      ...member,
      last_login_timestamp: member.last_login_timestamp ? Number(member.last_login_timestamp) : null
    }));
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

  async getAllMemberNames() {
    const members = await this.prisma.guildMember.findMany({
      select: {
        character_name: true,
      },
    });
    return members.map(member => member.character_name);
  }

  async removeDepartedMembers(departedMemberNames) {
    if (departedMemberNames.length === 0) {
      return 0;
    }

    const result = await this.prisma.guildMember.deleteMany({
      where: {
        character_name: {
          in: departedMemberNames,
        },
      },
    });
    return result.count;
  }

  async getActiveCharacters(daysActive = 14) {
    const cutoffDate = new Date(Date.now() - daysActive * 24 * 60 * 60 * 1000);
    const cutoffTimestamp = cutoffDate.getTime();

    return await this.prisma.guildMember.findMany({
      where: {
        // Only characters with confirmed activity within the specified days
        last_login_timestamp: {
          gte: cutoffTimestamp,
        },
      },
      select: {
        character_name: true,
        realm: true,
        level: true,
        class: true,
        item_level: true,
        mythic_plus_score: true,
        current_pvp_rating: true,
        raid_progress: true,
        last_login_timestamp: true,
        activity_status: true,
        last_activity_check: true,
      },
      orderBy: [
        { last_login_timestamp: 'desc' },
        { character_name: 'asc' },
      ],
    });
  }

  async updateActivityStatus(characterName, realm, activityData) {
    const updateData = {
      last_activity_check: new Date(),
    };

    if (activityData.last_login_timestamp) {
      updateData.last_login_timestamp = activityData.last_login_timestamp;
      updateData.activity_status = activityData.activity_status;
    } else {
      updateData.activity_status = 'inactive';
    }

    return await this.prisma.guildMember.update({
      where: {
        character_name_realm: {
          character_name: characterName,
          realm: realm,
        },
      },
      data: updateData,
    });
  }

  async bulkUpdateActivityStatus(updates) {
    console.log(`🔄 Starting bulk activity status update for ${updates.length} characters`);
    
    const promises = updates.map(async (update, index) => {
      try {
        console.log(`📝 [${index + 1}/${updates.length}] Updating ${update.character_name} (${update.realm}) - Status: ${update.activityData.activity_status}`);
        const result = await this.updateActivityStatus(update.character_name, update.realm, update.activityData);
        console.log(`✅ Updated ${update.character_name}: ${update.activityData.activity_status}`);
        return result;
      } catch (error) {
        console.error(`❌ Failed to update ${update.character_name}: ${error.message}`);
        throw error;
      }
    });

    const results = await Promise.allSettled(promises);
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    console.log(`📊 Bulk update completed: ${successful} successful, ${failed} failed`);
    
    return results;
  }
}

module.exports = PrismaService;
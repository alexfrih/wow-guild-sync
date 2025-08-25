-- CreateTable
CREATE TABLE "guild_members" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "character_name" TEXT NOT NULL,
    "realm" TEXT NOT NULL,
    "class" TEXT,
    "level" INTEGER,
    "item_level" REAL,
    "mythic_plus_score" REAL,
    "current_saison" TEXT,
    "pvp_2v2_rating" INTEGER DEFAULT 0,
    "pvp_3v3_rating" INTEGER DEFAULT 0,
    "pvp_rbg_rating" INTEGER DEFAULT 0,
    "current_pvp_rating" INTEGER NOT NULL DEFAULT 0,
    "solo_shuffle_rating" INTEGER DEFAULT 0,
    "max_solo_shuffle_rating" INTEGER DEFAULT 0,
    "achievement_points" INTEGER DEFAULT 0,
    "raid_progress" TEXT,
    "last_login_timestamp" BIGINT,
    "activity_status" TEXT NOT NULL DEFAULT 'inactive',
    "last_activity_check" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_hourly_check" DATETIME,
    "last_updated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "character_name" TEXT
);

-- CreateTable
CREATE TABLE "database_versions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "version" INTEGER NOT NULL,
    "applied_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT
);

-- CreateTable
CREATE TABLE "sync_errors" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "character_name" TEXT NOT NULL,
    "realm" TEXT,
    "error_type" TEXT NOT NULL,
    "error_message" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "url_attempted" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "guild_members_character_name_realm_key" ON "guild_members"("character_name", "realm");

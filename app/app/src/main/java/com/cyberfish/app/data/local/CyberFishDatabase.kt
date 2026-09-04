package com.cyberfish.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [FishRecordEntity::class], version = 2, exportSchema = false)
abstract class CyberFishDatabase : RoomDatabase() {
    abstract fun fishRecordDao(): FishRecordDao

    companion object {
        @Volatile
        private var instance: CyberFishDatabase? = null

        fun get(context: Context): CyberFishDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                CyberFishDatabase::class.java,
                "cyberfish.db",
            ).addMigrations(MIGRATION_1_2).build().also { instance = it }
        }

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE fish_records ADD COLUMN misreportState TEXT NOT NULL DEFAULT 'None'")
                db.execSQL("ALTER TABLE fish_records ADD COLUMN remoteMisreportId TEXT")
                db.execSQL("ALTER TABLE fish_records ADD COLUMN misreportAttemptCount INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE fish_records ADD COLUMN misreportLastError TEXT")
            }
        }
    }
}

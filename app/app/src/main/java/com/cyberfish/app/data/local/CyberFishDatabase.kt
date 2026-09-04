package com.cyberfish.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [FishRecordEntity::class], version = 1, exportSchema = false)
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
            ).build().also { instance = it }
        }
    }
}

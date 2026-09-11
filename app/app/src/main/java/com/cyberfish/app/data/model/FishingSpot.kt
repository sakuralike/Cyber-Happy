package com.cyberfish.app.data.model

data class FishingSpot(
    val id: String,
    val name: String,
    val latitude: Double?,
    val longitude: Double?,
    val address: String? = null,
    val poiId: String? = null,
    val source: String = SOURCE_POI,
) {
    val hasCoordinates: Boolean
        get() = latitude != null && longitude != null

    companion object {
        const val SOURCE_POI = "POI"
        const val SOURCE_LEGACY = "LEGACY"

        fun legacy(name: String): FishingSpot = FishingSpot(
            id = "legacy:${name.trim()}",
            name = name.trim(),
            latitude = null,
            longitude = null,
            source = SOURCE_LEGACY,
        )
    }
}

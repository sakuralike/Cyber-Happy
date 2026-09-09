package com.cyberfish.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

object CyberFishType {
    val Display = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 28.sp,
        lineHeight = 34.sp,
        letterSpacing = 0.sp,
    )
    val Title = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp,
        lineHeight = 26.sp,
    )
    val Body = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 22.sp,
    )
    val BodyMedium = TextStyle(
        fontWeight = FontWeight.Medium,
        fontSize = 15.sp,
        lineHeight = 22.sp,
    )
    val Caption = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 18.sp,
    )
    val LabelStrong = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 12.sp,
        lineHeight = 16.sp,
    )
    val Micro = TextStyle(
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 15.sp,
    )
    val Metric = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 30.sp,
        lineHeight = 36.sp,
    )
    val MetricSmall = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 22.sp,
        lineHeight = 28.sp,
    )
    val ButtonLabel = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 20.sp,
    )
}

internal val CyberFishTypography: Typography = Typography(
    displayMedium = CyberFishType.Display,
    headlineMedium = CyberFishType.Display,
    titleLarge = CyberFishType.Display,
    titleMedium = CyberFishType.Title,
    titleSmall = CyberFishType.Title,
    bodyLarge = CyberFishType.Body,
    bodyMedium = CyberFishType.Body,
    bodySmall = CyberFishType.Caption,
    labelLarge = CyberFishType.LabelStrong,
    labelMedium = CyberFishType.LabelStrong,
    labelSmall = CyberFishType.Micro,
)

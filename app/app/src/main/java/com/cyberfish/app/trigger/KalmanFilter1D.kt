package com.cyberfish.app.trigger

import kotlin.math.max

class KalmanFilter1D(
    private val processNoise: Double = 0.25,
    private val measurementNoise: Double = 4.0,
) {
    private var initialized = false
    private var position = 0.0
    private var velocity = 0.0
    private var p00 = 1.0
    private var p01 = 0.0
    private var p10 = 0.0
    private var p11 = 1.0

    fun update(measurement: Float, deltaSeconds: Float): Float {
        if (!initialized) {
            initialized = true
            position = measurement.toDouble()
            return measurement
        }

        val dt = max(deltaSeconds.toDouble(), 0.001)
        val dt2 = dt * dt
        val dt3 = dt2 * dt
        val dt4 = dt3 * dt
        val predictedPosition = position + velocity * dt
        val predictedP00 = p00 + dt * (p01 + p10) + dt2 * p11 + processNoise * dt4 / 4.0
        val predictedP01 = p01 + dt * p11 + processNoise * dt3 / 2.0
        val predictedP10 = p10 + dt * p11 + processNoise * dt3 / 2.0
        val predictedP11 = p11 + processNoise * dt2
        val innovation = measurement - predictedPosition
        val innovationCovariance = predictedP00 + measurementNoise
        val positionGain = predictedP00 / innovationCovariance
        val velocityGain = predictedP10 / innovationCovariance

        position = predictedPosition + positionGain * innovation
        velocity += velocityGain * innovation
        p00 = (1.0 - positionGain) * predictedP00
        p01 = (1.0 - positionGain) * predictedP01
        p10 = predictedP10 - velocityGain * predictedP00
        p11 = predictedP11 - velocityGain * predictedP01
        return position.toFloat()
    }

    fun reset() {
        initialized = false
        position = 0.0
        velocity = 0.0
        p00 = 1.0
        p01 = 0.0
        p10 = 0.0
        p11 = 1.0
    }
}

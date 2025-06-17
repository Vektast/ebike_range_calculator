document.addEventListener('DOMContentLoaded', () => {
    const g = 9.81; // m/s^2
    const rho = 1.225; // kg/m^3, air density
    const frontalArea = 0.5; // m^2
    const dragCoefficient = 0.7;
    const etaMotor = 0.82; // motor efficiency
    const etaDrivetrain = 0.95; // drivetrain efficiency
    const etaTotal = etaMotor * etaDrivetrain;

    const CrrValues = {
        flat: 0.005,
        uphill: 0.008,
        mixed: 0.0065
    };
    const sinThetaValues = {
        flat: 0,
        uphill: 0.03, // Approx 1.72 degrees incline
        mixed: 0.01  // Approx 0.57 degrees incline
    };

    const calculatorForm = document.getElementById('calculatorForm');
    const resultArea = document.getElementById('resultArea');
    const rangeChartCanvas = document.getElementById('rangeChart');
    const ctx = rangeChartCanvas.getContext('2d');

    function calculatePowerRequired(speedKmh, totalWeightKg, terrain) {
        if (speedKmh <= 0) return 0; // No power required if not moving

        const speedMps = speedKmh * 1000 / 3600;
        const Crr = CrrValues[terrain] || CrrValues.mixed;
        const sinTheta = sinThetaValues[terrain] || sinThetaValues.mixed;

        const P_roll = Crr * totalWeightKg * g * speedMps;
        const P_aero = 0.5 * rho * frontalArea * dragCoefficient * Math.pow(speedMps, 3);
        const P_grade = totalWeightKg * g * speedMps * sinTheta;

        const P_total_mechanical = P_roll + P_aero + P_grade;

        if (P_total_mechanical <= 0) return 0; // e.g. strong downhill, not modeled for positive power consumption

        const P_battery = P_total_mechanical / etaTotal;
        return P_battery; // Watts
    }

    calculatorForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const batteryCapacity = parseFloat(document.getElementById('batteryCapacity').value);
        const maxSpeedKmh = parseFloat(document.getElementById('maxSpeed').value);
        const motorPower = parseFloat(document.getElementById('motorPower').value); // Not directly used in this range calc version
        const totalWeight = parseFloat(document.getElementById('totalWeight').value);
        const terrain = document.getElementById('terrain').value;

        if (isNaN(batteryCapacity) || isNaN(maxSpeedKmh) || isNaN(totalWeight) || batteryCapacity <= 0 || maxSpeedKmh <= 0 || totalWeight <= 0) {
            resultArea.textContent = "Please enter valid positive numbers for all inputs.";
            clearCanvas();
            return;
        }

        const powerAtMaxSpeed = calculatePowerRequired(maxSpeedKmh, totalWeight, terrain);

        let maxRangeKm;
        if (powerAtMaxSpeed <= 0) {
            // This case implies that at maxSpeedKmh, the conditions (e.g. downhill) require no power.
            // For simplicity, if speed > 0 and power <=0, range could be considered very large or "N/A".
            // Or, if it's because speed was 0, range is 0.
            // Given our calculatePowerRequired returns 0 for speed 0, this branch means powerAtMaxSpeed is 0 for a non-zero speed.
             maxRangeKm = Infinity; // Or handle as a special display case
             resultArea.textContent = `Estimated Maximum Range: Effectively very high (conditions require minimal power).`;
        } else {
            const timeToDischargeHours = batteryCapacity / powerAtMaxSpeed;
            maxRangeKm = timeToDischargeHours * maxSpeedKmh;
            resultArea.textContent = `Estimated Maximum Range (at ${maxSpeedKmh} km/h): ${maxRangeKm.toFixed(1)} km`;
        }


        // Graph Data Generation
        const rangeData = [];
        const minSpeedGraph = 1; // km/h
        const speedStep = 1; // km/h

        for (let currentSpeedKmh = minSpeedGraph; currentSpeedKmh <= maxSpeedKmh; currentSpeedKmh += speedStep) {
            const powerRequired = calculatePowerRequired(currentSpeedKmh, totalWeight, terrain);
            let rangeAtSpeed = 0;

            if (powerRequired > 0) {
                const timeToDischarge = batteryCapacity / powerRequired;
                rangeAtSpeed = timeToDischarge * currentSpeedKmh;
            } else if (currentSpeedKmh > 0 && powerRequired <=0) {
                 // If speed > 0 and power required is 0 (e.g. downhill), range is theoretically infinite.
                 // Cap it for graphing purposes or handle as a special value.
                 rangeAtSpeed = (maxRangeKm !== Infinity && maxRangeKm > 0) ? maxRangeKm * 1.5 : 500; // Cap at 1.5x calculated max range or 500km
            }
            // if currentSpeedKmh is 0, powerRequired is 0, rangeAtSpeed remains 0, which is correct.

            rangeData.push({ speed: currentSpeedKmh, range: rangeAtSpeed });
        }

        // Add the max speed point if it wasn't part of the loop steps
        if (maxSpeedKmh % speedStep !== 0 && maxSpeedKmh > minSpeedGraph) {
            const powerRequired = calculatePowerRequired(maxSpeedKmh, totalWeight, terrain);
            let rangeAtSpeed = 0;
            if (powerRequired > 0) {
                const timeToDischarge = batteryCapacity / powerRequired;
                rangeAtSpeed = timeToDischarge * maxSpeedKmh;
            } else if (maxSpeedKmh > 0 && powerRequired <=0) {
                rangeAtSpeed = (maxRangeKm !== Infinity && maxRangeKm > 0) ? maxRangeKm * 1.5 : 500;
            }
            // Check if the last speed point is already maxSpeedKmh to avoid duplicates
            if (!rangeData.find(d => d.speed === maxSpeedKmh)) {
                 rangeData.push({ speed: maxSpeedKmh, range: rangeAtSpeed });
            }
        }


        drawRangeChart(rangeData, maxSpeedKmh);
    });

    function clearCanvas() {
        ctx.clearRect(0, 0, rangeChartCanvas.width, rangeChartCanvas.height);
    }

    function drawRangeChart(data, inputMaxSpeed) {
        clearCanvas();
        if (!data || data.length === 0) return;

        const padding = 50;
        const chartWidth = rangeChartCanvas.width - 2 * padding;
        const chartHeight = rangeChartCanvas.height - 2 * padding;

        // Filter out excessively large/Infinite ranges for scaling, but keep them for potential plotting if needed
        const finiteRangeData = data.filter(d => isFinite(d.range));
        const maxRangeGraph = finiteRangeData.length > 0 ? Math.max(...finiteRangeData.map(d => d.range), 0) : 100; // Ensure maxRangeGraph is at least 100 or a sensible default
        const maxSpeedGraph = Math.max(...data.map(d => d.speed), inputMaxSpeed, 1); // Ensure maxSpeedGraph is at least inputMaxSpeed or 1

        // Draw Axes
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, rangeChartCanvas.height - padding); // Y-axis
        ctx.lineTo(rangeChartCanvas.width - padding, rangeChartCanvas.height - padding); // X-axis
        ctx.strokeStyle = '#333';
        ctx.stroke();

        // Labels
        ctx.fillStyle = '#333';
        ctx.textAlign = "center";
        ctx.fillText("Speed (km/h)", padding + chartWidth / 2, rangeChartCanvas.height - padding / 2.5);
        ctx.save();
        ctx.translate(padding / 2.5, padding + chartHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText("Range (km)", 0, 0);
        ctx.restore();

        // Plot Data
        ctx.beginPath();
        let firstPoint = true;

        data.forEach(point => {
            let plotRange = point.range;
            // If range is infinite or extremely large, cap it at the top of the graph for visualization
            if (!isFinite(plotRange) || plotRange > maxRangeGraph * 1.1) { // Cap very large values slightly above max
                plotRange = maxRangeGraph * 1.05;
            }

            const x = padding + (point.speed / maxSpeedGraph) * chartWidth;
            const y = (rangeChartCanvas.height - padding) - (plotRange / maxRangeGraph) * chartHeight;

            if (x < padding || x > rangeChartCanvas.width - padding + 5 || y < padding - 5 || y > rangeChartCanvas.height - padding) {
                // Don't draw points way outside plotting area (can happen with extreme values before capping)
                // console.warn("Point out of bounds:", point, x, y);
                return;
            }

            if (firstPoint) {
                ctx.moveTo(x, y);
                firstPoint = false;
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.strokeStyle = '#007bff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw Ticks (simplified)
        ctx.fillStyle = '#333';
        // X-axis ticks (Speed)
        for (let i = 0; i <= 5; i++) {
            const speed = (maxSpeedGraph / 5) * i;
            const x = padding + (speed / maxSpeedGraph) * chartWidth;
            ctx.fillText(speed.toFixed(0), x, rangeChartCanvas.height - padding + 15);
            ctx.beginPath();
            ctx.moveTo(x, rangeChartCanvas.height - padding -3);
            ctx.lineTo(x, rangeChartCanvas.height - padding +3);
            ctx.stroke();
        }
        // Y-axis ticks (Range)
        for (let i = 0; i <= 5; i++) {
            const range = (maxRangeGraph / 5) * i;
            const y = (rangeChartCanvas.height - padding) - (range / maxRangeGraph) * chartHeight;
            ctx.fillText(range.toFixed(0), padding - 25, y + 3);
             ctx.beginPath();
            ctx.moveTo(padding -3, y);
            ctx.lineTo(padding +3, y);
            ctx.stroke();
        }
    }
});

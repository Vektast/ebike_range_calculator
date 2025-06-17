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
    // Canvas context will be fetched inside the event listener for Chart.js
    // const rangeChartCanvas = document.getElementById('rangeChart');
    // const ctx = rangeChartCanvas.getContext('2d'); // Moved

    let rangeChartInstance = null; // To hold the chart instance

    function calculatePowerRequired(speedKmh, totalWeightKg, terrain, motorNominalPower) {
        if (speedKmh <= 0) return 0; // No power required if not moving

        const speedMps = speedKmh * 1000 / 3600;
        const Crr = CrrValues[terrain] || CrrValues.mixed;
        const sinTheta = sinThetaValues[terrain] || sinThetaValues.mixed;

        const P_roll = Crr * totalWeightKg * g * speedMps;
        const P_aero = 0.5 * rho * frontalArea * dragCoefficient * Math.pow(speedMps, 3);
        const P_grade = totalWeightKg * g * speedMps * sinTheta;

        const P_total_mechanical = P_roll + P_aero + P_grade;

        if (P_total_mechanical <= 0) return 0; // e.g. strong downhill, not modeled for positive power consumption

        const electricalPowerRequiredByMotor = P_total_mechanical / etaMotor; // etaMotor is just motor efficiency
        if (electricalPowerRequiredByMotor > motorNominalPower) {
            return Infinity; // Motor cannot sustain this mechanical output
        }

        // If motor can sustain it, P_battery is based on total efficiency (motor + drivetrain)
        const P_battery = P_total_mechanical / etaTotal;
        return P_battery; // Watts
    }

    calculatorForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const batteryCapacity = parseFloat(document.getElementById('batteryCapacity').value);
        const maxSpeedKmh = parseFloat(document.getElementById('maxSpeed').value);
        const motorPower = parseFloat(document.getElementById('motorPower').value);
        const totalWeight = parseFloat(document.getElementById('totalWeight').value);
        const terrain = document.getElementById('terrain').value;

        if (isNaN(batteryCapacity) || isNaN(maxSpeedKmh) || isNaN(totalWeight) || batteryCapacity <= 0 || maxSpeedKmh <= 0 || totalWeight <= 0) {
            resultArea.textContent = "Please enter valid positive numbers for all inputs.";
            // clearCanvas(); // Will be handled by Chart.js destroy
            if (rangeChartInstance) {
                rangeChartInstance.destroy();
                rangeChartInstance = null;
            }
            return;
        }

        // Pass motorPower to calculatePowerRequired
        const powerAtMaxSpeed = calculatePowerRequired(maxSpeedKmh, totalWeight, terrain, motorPower);

        if (powerAtMaxSpeed === Infinity) {
            resultArea.innerHTML = 'Max speed not attainable with this motor power under current conditions. <br>Increase motor power or reduce speed/weight/terrain difficulty.';
            if (rangeChartInstance) {
                rangeChartInstance.destroy();
                rangeChartInstance = null;
            }
            return; // Stop further processing
        } else if (powerAtMaxSpeed <= 0) {
             resultArea.textContent = `Estimated Maximum Range: Effectively very high (conditions require minimal or no power).`;
        } else {
            const timeToDischargeHours = batteryCapacity / powerAtMaxSpeed;
            const maxRangeKm = timeToDischargeHours * maxSpeedKmh;
            resultArea.textContent = `Estimated Maximum Range (at ${maxSpeedKmh} km/h): ${maxRangeKm.toFixed(1)} km`;
        }

        // Graph Data Generation
        const rangeData = [];
        const minSpeedGraph = 1; // km/h
        const speedStep = 1; // km/h

        for (let currentSpeedKmh = minSpeedGraph; currentSpeedKmh <= maxSpeedKmh; currentSpeedKmh += speedStep) {
            // Pass motorPower here as well
            const powerRequired = calculatePowerRequired(currentSpeedKmh, totalWeight, terrain, motorPower);
            let rangeAtSpeed = null; // Default to null for unattainable speeds

            if (powerRequired > 0 && powerRequired !== Infinity) {
                const timeToDischarge = batteryCapacity / powerRequired;
                rangeAtSpeed = timeToDischarge * currentSpeedKmh;
            } else if (powerRequired === 0 && currentSpeedKmh > 0) { // Speed > 0 and no power needed (e.g. downhill)
                // Represent very high range as a large number or null based on how Chart.js should show it
                // For now, let's keep it null to indicate it's off the charts or "infinite"
                // rangeAtSpeed = 1000; // Arbitrarily large number, or handle differently in tooltip
                // Or, stick to null and let tooltip explain
            }
            // If powerRequired is Infinity or (powerRequired is 0 and speed is 0), rangeAtSpeed remains null or 0 (if speed is 0)
            if (currentSpeedKmh === 0 && powerRequired === 0) rangeAtSpeed = 0;


            rangeData.push({ speed: currentSpeedKmh, range: rangeAtSpeed });
        }

        // Add the max speed point if it wasn't part of the loop steps & is attainable
        if (maxSpeedKmh % speedStep !== 0 && maxSpeedKmh > minSpeedGraph) {
            const powerRequiredAtMax = calculatePowerRequired(maxSpeedKmh, totalWeight, terrain, motorPower);
            let rangeAtMaxSpeedPoint = null;
            if (powerRequiredAtMax > 0 && powerRequiredAtMax !== Infinity) {
                const timeToDischarge = batteryCapacity / powerRequiredAtMax;
                rangeAtMaxSpeedPoint = timeToDischarge * maxSpeedKmh;
            } else if (powerRequiredAtMax === 0 && maxSpeedKmh > 0) {
                // rangeAtMaxSpeedPoint = 1000; // or null
            }
             if (maxSpeedKmh === 0 && powerRequiredAtMax === 0) rangeAtMaxSpeedPoint = 0;

            if (!rangeData.find(d => d.speed === maxSpeedKmh)) {
                 rangeData.push({ speed: maxSpeedKmh, range: rangeAtMaxSpeedPoint });
            }
        }

        // Chart.js implementation
        const chartCanvas = document.getElementById('rangeChart');
        const ctx = chartCanvas.getContext('2d');

        if (rangeChartInstance) {
            rangeChartInstance.destroy();
        }

        const labels = rangeData.map(item => item.speed);
        const dataValues = rangeData.map(item => isFinite(item.range) ? item.range : null); // Handle Infinity by making it null for Chart.js

        rangeChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels, // X-axis labels (speeds)
                datasets: [{
                    label: 'Estimated Range (km)', // Legend label
                    data: dataValues, // Y-axis data (ranges)
                    borderColor: 'rgb(75, 192, 192)', // Line color
                    backgroundColor: 'rgba(75, 192, 192, 0.2)', // Optional fill color
                    tension: 0.1, // Line tension for slight curve
                    fill: true, // Optional: fill area under line
                    pointBackgroundColor: 'rgb(75, 192, 192)',
                    pointHoverBackgroundColor: 'rgb(54, 162, 235)',
                    pointHoverBorderColor: 'rgb(54, 162, 235)',
                    spanGaps: false // Do not connect line across null data points (unattainable speeds)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // Allows canvas to resize height with CSS if needed
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Speed (km/h)'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Range (km)'
                        },
                        beginAtZero: true // Start Y-axis at 0
                    }
                },
                plugins: {
                    tooltip: {
                        enabled: true,
                        mode: 'index', // Show tooltips for all datasets at that x-index
                        intersect: false, // Tooltip appears even if not directly hovering over point
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    const originalDataPoint = rangeData[context.dataIndex];
                                    if (originalDataPoint && originalDataPoint.range === null) { // Check if range was explicitly set to null
                                        if (calculatePowerRequired(originalDataPoint.speed, totalWeight, terrain, motorPower) === Infinity) {
                                            label += 'Unattainable (motor limit)';
                                        } else if (originalDataPoint.speed > 0 && calculatePowerRequired(originalDataPoint.speed, totalWeight, terrain, motorPower) <= 0) {
                                             label += 'Very High (minimal power needed)';
                                        } else {
                                            label += 'N/A';
                                        }
                                    } else if (context.parsed.y !== null) {
                                        label += context.parsed.y.toFixed(1) + ' km';
                                    } else {
                                        label += 'N/A'; // Fallback for other null cases
                                    }
                                }
                                return label;
                            },
                            title: function(context) {
                               // context is an array of tooltip items
                               if (context.length > 0) {
                                   return 'Speed: ' + context[0].label + ' km/h';
                               }
                               return '';
                            }
                        }
                    },
                    legend: {
                       display: true,
                       position: 'top'
                    }
                }
            }
        });
    });
});

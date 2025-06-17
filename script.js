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
            // clearCanvas(); // Will be handled by Chart.js destroy
            if (rangeChartInstance) {
                rangeChartInstance.destroy();
                rangeChartInstance = null;
            }
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
                    spanGaps: true // Connect line across null data points (e.g. where range was Infinity)
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
                                    // Check if original value was Infinity for special display
                                    const originalDataPoint = rangeData[context.dataIndex];
                                    if (originalDataPoint && !isFinite(originalDataPoint.range) && originalDataPoint.range > 0) {
                                        label += 'Very High (effectively unlimited)';
                                    } else {
                                        label += context.parsed.y.toFixed(1) + ' km';
                                    }
                                } else if (context.dataset.data[context.dataIndex] === null) {
                                    // This handles the case where data was explicitly null (e.g. Infinity)
                                    const originalDataPoint = rangeData[context.dataIndex];
                                     if (originalDataPoint && !isFinite(originalDataPoint.range) && originalDataPoint.range > 0) {
                                        label += 'Very High (effectively unlimited)';
                                    } else {
                                        label += 'N/A';
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

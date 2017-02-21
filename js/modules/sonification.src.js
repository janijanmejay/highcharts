/**
 * Sonification module
 *
 * (c) 2010-2017 Highsoft AS
 * Author: Øystein Moseng
 *
 * License: www.highcharts.com/license
 */
'use strict';
import H from '../parts/Globals.js';
import '../parts/Utilities.js';
import '../parts/Chart.js';
import '../parts/Series.js';
import '../parts/Point.js';
import '../parts/Tooltip.js';

var merge = H.merge;

H.audio = new (H.win.AudioContext || H.win.webkitAudioContext)();

// Highlight a point (show tooltip and display hover state). Returns the 
// highlighted point.
// Stolen from Accessibility module
H.Point.prototype.highlight = function () {
	var chart = this.series.chart;
	if (this.graphic && this.graphic.element.focus) {
		this.graphic.element.focus();
	}
	if (!this.isNull) {
		this.onMouseOver(); // Show the hover marker
		// Show the tooltip
		if (chart.tooltip) {
			chart.tooltip.refresh(chart.tooltip.shared ? [this] : this);
		}
	} else {
		if (chart.tooltip) {
			chart.tooltip.hide(0);
		}
		// Don't call blur on the element, as it messes up the chart div's focus
	}
	chart.highlightedPoint = this;
	return this;
};

H.Series.prototype.sonify = function (options, callback) {
	var gainNode = H.audio.createGain(),
		panNode = H.audio.createStereoPanner(),
		oscillator = H.audio.createOscillator(),
		series = this,
		numPoints = series.points.length,
		valueToFreq = function (val) {
			var valMin = series.yAxis && series.yAxis.dataMin || series.dataMin,
				valMax = series.yAxis && series.yAxis.dataMax || series.dataMax,
				freqStep = (options.maxFrequency - options.minFrequency) /
					(valMax - valMin);
			return options.minFrequency + (val - valMin) * freqStep;
		},
		timePerPoint = Math.min(
			options.maxDuration / numPoints, 
			options.maxPointDuration
		),
		maxPointsNum = options.maxDuration / options.minPointDuration,
		pointSkip = 1,
		panStep = 2 * options.stereoRange / numPoints;

	// Skip over points if we have too many
	// We might want to use data grouping here
	if (timePerPoint < options.minPointDuration) {
		pointSkip = Math.ceil(numPoints / maxPointsNum);
		timePerPoint = options.minPointDuration;
	}

	// Init audio nodes
	panNode.pan.value = -1;
	gainNode.gain.value = options.volume;
	oscillator.type = options.waveType;
	oscillator.frequency.value = 0;
	oscillator.connect(gainNode);
	gainNode.connect(panNode);
	panNode.connect(H.audio.destination);

	// Play
	oscillator.start(H.audio.currentTime);
	for (var i = 0, point, timeOffset; i < numPoints; i += pointSkip) {
		point = this.points[i];
		if (point) {
			timeOffset = i * timePerPoint / 1000;
			oscillator.frequency[
				options.smooth ?
				'linearRampToValueAtTime' : 'setValueAtTime'
			](
				valueToFreq(point.y),
				H.audio.currentTime + timeOffset
			);

			if (options.stereo) {
				panNode.pan.setValueAtTime(
					-1 * options.stereoRange + panStep * i,
					H.audio.currentTime + timeOffset
				);
			}

			setTimeout((function (point) {
				return function () {
					point.highlight();
				};
			}(point)), timeOffset * 1000);
		}
	}

	// Fade and stop oscillator
	gainNode.gain.setTargetAtTime(
		0,
		H.audio.currentTime + i * timePerPoint / 1000, 
		0.1
	);
	oscillator.stop(H.audio.currentTime + i * timePerPoint / 1000 + 1);

	oscillator.onended = function () {
		callback.call(series);
	};
};

H.Chart.prototype.sonify = function () {
	var options = this.options.sonification;

	if (this.series[0]) {
		this.series[0].sonify(options, function sonifyNext() {
			var newSeries = this.chart.series[this.index + 1],
				opts;
			if (newSeries) {
				opts = merge(options, newSeries.options.sonification);
				setTimeout(function () {
					newSeries.sonify(options, sonifyNext);
				}, opts.seriesDelay);
			}
		});
	}
};

// Default sonification options
H.setOptions({
	sonification: {
		seriesDelay: 800, // Delay between series in ms
		maxDuration: 5000, // In ms
		minPointDuration: 30, // In ms
		maxPointDuration: 300, // In ms
		minFrequency: 100,
		maxFrequency: 2400,
		waveType: 'sine',
		smooth: false,
		stereo: true, // Note: Panning might not be accessible to mono users
		stereoRange: 0.8, // Factor to apply to stereo range
		volume: 0.9
	}
});

// Add option to export menu to sonify the chart
H.getOptions().exporting.buttons.contextButton.menuItems.push({
	text: 'Sonify chart',
	onclick: function () {
		this.sonify();
	}
});
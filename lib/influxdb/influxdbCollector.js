/**
 * Sitespeed.io - How speedy is your site? (https://www.sitespeed.io)
 * Copyright (c) 2014, Peter Hedenskog, Tobias Lidskog
 * and other contributors
 * Released under the Apache 2.0 License
 */
'use strict';
var util = require('../util/util'),
  winston = require('winston')

var navigationTimingNames = 
[ 
  'navigationStart',
  'unloadEventStart',
  'unloadEventEnd',
  'redirectStart',
  'redirectEnd',
  'fetchStart',
  'domainLookupStart',
  'domainLookupEnd',
  'connectStart',
  'connectEnd',
  'secureConnectionStart',
  'requestStart',
  'responseStart',
  'responseEnd',
  'domLoading',
  'domInteractive',
  'domContentLoadedEventStart',
  'domContentLoadedEventEnd',
  'domComplete',
  'loadEventStart',
  'loadEventEnd',
];


// see: browsertime/script/timings.js
var timingNames =
[
	'domainLookupTime',
	'redirectionTime',
	'serverConnectionTime',
	'serverResponseTime',
	'pageDownloadTime',
	'domInteractiveTime',
	'domContentLoadedTime',
	'pageLoadTime',
	'frontEndTime',
	'backEndTime'
];

var extraTimingNames =
[
	// WPT data
	'speedIndex',
	'SpeedIndex',
	'firstPaint',
	'render',
	'TTFB',
	'visualComplete',
	'loadTime',
	
	// lib/collectors/domains.js
	'blocked',
	'dns',
	'connect',
	'ssl',
	'send',
	'wait',
	'receive'
];


// TODO: figure out how WPT metrics work in this context (if we ever want to use those)

function InfluxdbCollector(config) 
{
  this.config = config;
  this.tagsBase = this.config.influxdbTags; // ex. measurement_name,tagname=tagvalue : prepended to each stat 
  this.log = winston.loggers.get('sitespeed.io');
  this.timeStamp = '\n'; // influxDB itself sets a new timestamp if we don't pass one.
}

InfluxdbCollector.prototype.collect = function(aggregates, pages, domains) 
{
  var config = this.config;
  var self = this;
  var statistics = '';

	// sitespeed.io collects a huge amount of individual and aggregated metrics
	// they can run across multiple domains, pages and browsers and aggregate over all those
	// this leads to a very complex result-object and an explosion of different metrics
	
	// for our current usecase, we will always test just 1 domain, 1 page and 1 browser at a given time
	// this means that all the aggregated metrics will contain the same data as the per-page/per-browser metrics
	// so here we only use the summary stats for now
	
	if( pages.length != 1 )
	{
		self.log.log("error", "InfluxdbCollector:collect : not exactly 1 page tested! not sending results!" + pages.length );
		return "";
	}
	
	// multiple browsers (normal) or browser + headless (is treated differently by sitespeed)
	if( ( config.browsertime && config.browsertime.length > 1) || (config.browsertime && config.browsertime.length == 1 && config.headlessTimings) )
	{ 
		
		self.log.log("error", "InfluxdbCollector:collect : not exactly 1 browser tested! not sending results!" + pages.length );
		return "";
	}
	
    statistics += self._getSummaryStats(aggregates);

  return statistics;

};


InfluxdbCollector.prototype._getSummaryStats = function(aggregatedMetrics) 
{

	//console.log( aggregatedMetrics );

  var statistics = '';
  var self = this;
  // find available aggregates in util.js:getStatisticsObject
  var aggregateNames = ['min','p10', 'p25', 'median', 'p70', 'p75', 'p80', 'p90', 'p99', 'max', 'sum', 'mean', 'stddev'];
  

	// aggregates is just a 1D array of metric objects containing aggregated data for that metric
	// aggregates
	//	- id (name) (ex. loadEventEnd)
	//	- stats
	//		- aggregateName (max)
	//		- aggregateName (min)
	//		- ...
	//	- ...

	var allMetricNames = navigationTimingNames.concat( timingNames, extraTimingNames );
	
	allMetricNames.forEach( function(metricName)
	{
		// can't just do aggregatedMetrics[metricName] because not indexed by name, just flat array of objects
		metric = aggregatedMetrics.filter(function (met) { 
    				return met.id == metricName;
				});
	
		if( !metric || !(metric.length > 0) )
		{
			self.log.info("InfluxdbCollector:_getSummaryStats Metric " + metricName + " not found in aggregates... skipping");
			return;
		}
		
		var metric = metric[0];
		
		var dataTags = self.tagsBase + ",metric=" + metricName;
		var dataFields = "";
		
		// each aggregate is a separate InfluxDB field
		aggregateNames.forEach( function(aggregateName) 
		{
			if( !metric.stats || !metric.stats[ aggregateName ] )
			{
				self.log.log("info","InfluxdbCollector:_getSummaryStats Metric " + metricName + " has no aggregate " + aggregateName + "... skipping");
				return;
			}
			
			var aggregateValue = Number(metric.stats[aggregateName]);
			if( aggregateValue < 0 )
			{
				self.log.info("Metric " + metricName + ":"+aggregateName+" was < 0! setting to -1 manually");
				aggregateValue = -1;
			}
			
			dataFields += aggregateName + "=" + aggregateValue + ",";
			
		});
		
		if( dataFields != "" )
		{
			dataFields += "count=" + self.config.no;
		
			statistics += dataTags + " " + dataFields + " " + self.timeStamp;
		}
		else
		{
			self.log.log("error","InfluxdbCollector:_getSummaryStats Metric " + metricName + " has no valid aggregates! skipping");
		}
	});
	
	return statistics;
};


module.exports = InfluxdbCollector;

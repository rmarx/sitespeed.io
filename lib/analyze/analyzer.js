/**
 * Sitespeed.io - How speedy is your site? (https://www.sitespeed.io)
 * Copyright (c) 2014, Peter Hedenskog, Tobias Lidskog
 * and other contributors
 * Released under the Apache 2.0 License
 */
'use strict';

var yslow = require('./yslow'),
	gpsi = require('./gpsi'),
	browsertime = require('./browsertime'),
	webpagetest = require('./webpagetest'),
	screenshots = require('./screenshots'),
	headless = require('./headless'),
	async = require('async'),
	inspect = require('util').inspect;

function Analyzer() {}

Analyzer.prototype.analyze = function(urls, collector, config, downloadErrors, analysisErrors, urlAnalysedCallback,
	completionCallback) {

	Analyzer.prototype.configHack = config; // dirtiest hack ever, but apparently it's the main way to do it in NodeJS (Singletons rely on require() caching, which sounds very error prone to me)

	/**
	To keep it simple, we run each task in series so
	that they will not interfere with each other
	*/
	var analyzers = [];

	if (config.runYslow) {
		analyzers.push(yslow);
	}
	if (config.headlessTimings) {
		analyzers.push(headless);
	}
	if (config.gpsiKey) {
		analyzers.push(gpsi);
	}
	if (config.browsertime) {
		analyzers.push(browsertime);
	}
	if (config.wptHost) {
		analyzers.push(webpagetest);
	}
	if (config.screenshot) {
		analyzers.push(screenshots);
	}

	/*
  var preTasks = analyzers.map(function (a) {
    return a.preAnalysis;
  }).filter(function (f) {
        return f instanceof Function;
      });

  var postTasks = analyzers.map(function (a) {
    return a.postAnalysis;
  }).filter(function (f) {
    return f instanceof Function;
  });
*/
	async.series([
			function(callback) {
				async.mapSeries(analyzers,
					function(a, cb) {
						a.analyze(urls, config, cb);
					},
					function(error, results) {
						processAnalysisResults(error, analysisErrors, results, collector, urlAnalysedCallback);
						callback(null);
					});
			}
		],
		function(err) {
			completionCallback(err, downloadErrors, analysisErrors);
		});
};

var extractDataForType = function(type, data) {
	var result;
	switch (type) {
		case 'browsertime':
			{
				result = {
					browsertime: data.map(function(run) {
						return run.browsertime;
					}),
					har: data.map(function(run) {
						return run.har;
					}).filter(function(h) {
						return !!h;
					})
				};
				if (result.har.length == 0) {
					delete result.har;
				}
			}
			break;
		case 'webpagetest':
			{
				result = {
					wpt: data.map(function(run) {
						return run.wpt;
					}),
					har: data.map(function(run) {
						return run.har;
					})
				};
			}
			break;
		default:
			result = data;
			break;
	}
	return result;
};

// There is an old PhantomJS bug where we can not get the right gzipped size of an asset
// https://github.com/ariya/phantomjs/issues/10156
function fixWrongByteSizeInYSlow(pageData) {
	if (pageData.yslow) {
		var harData = [];
		if (pageData.browsertime && pageData.browsertime.har) {
			Array.prototype.push.apply(harData, pageData.browsertime.har);
		}

		else if (pageData.webpagetest && pageData.webpagetest.har) {
	  Array.prototype.push.apply(harData, pageData.webpagetest.har);
	}

// Workaround to avoid issues when bt doesn't generate a har due to useProxy being set to false
		harData = harData.filter(function(har) {
			return !!har;
		});

	// maybe we don't need to go through all the HAR:s
	harData.forEach(function(har) {
	  har.log.entries.forEach(function(entry) {
	    var url = entry.request.url;
	    var size = entry.response.bodySize;
			// if we use SPDY the size is 0 from WPT
	    if (size > 0) {
	      pageData.yslow.comps.forEach(function(component) {
	        if (url === decodeURIComponent(component.url)) {
	          component.size = size;
	          component.gzip = size;
	        }
	      });
	    }
	  });
	});
	}
}

function processAnalysisResults(error, analysisErrors, analysisResults, collector, perUrlCallback) {
	if (error) {
		return;
	}

	var dataPerUrl = {};

	analysisResults.forEach(function(result) 
	{
		var errors = result.errors;
		for (var errorUrl in errors) {
			if (errors.hasOwnProperty(errorUrl)) {
				var e = analysisErrors[errorUrl] || {};
				e[result.type] = inspect(errors[errorUrl]);
				analysisErrors[errorUrl] = e;
			}
		}

		var data = result.data;
		for (url in data) 
		{
			if (data.hasOwnProperty(url)) 
			{
				var pageData = dataPerUrl[url] || {};
				
				pageData[result.type] = extractDataForType(result.type, data[url]);
				
				fixWrongByteSizeInYSlow(pageData);
				
				pageData[result.type] = skipXruns( result.type, pageData[result.type] );
				
				dataPerUrl[url] = pageData;
			}
		}
	});

	for (var url in dataPerUrl) {
		if (dataPerUrl.hasOwnProperty(url)) {
			var d = dataPerUrl[url];
			collector.collectPageData(d);
			perUrlCallback(null, url, d);
		}
	}
}

function skipXruns( runType, pageData )
{
	var config = Analyzer.prototype.configHack; // still dirtiest hack ever, see top of file
	
	if( !config.skipXruns || config.skipXruns <= 0 )
		return pageData;
	
	if( runType != "headless" && runType != "browsertime" )
	{
		console.error("analyzer.js:skipXruns : skipping runs only supported for headless or browsertime, not for " + runType);
		return pageData;
	}
	
	if( runType == "headless" && pageData.runs && pageData.runs.length > 1 )
	{
		// for some reason, headless pageData contains the same data twice...
		// once in pageData.metricName for all metrics (Stats object)
		// then again in pageData.runs for each run individually (individual measurements, later added to Stats by aggregator)
		// so if we want to disregard measurements, we need to do this on both levels...
		
		var topdata = pageData;
		
		// level 1: grouped measurements, each is a Stats object
		for( var property in topdata )
		{
			if( topdata.hasOwnProperty(property) && topdata[property].max ) // Stats object has a max property, we only need Stats objects here
			{
				for( var p = 0; p < config.skipXruns; ++p )
					topdata[property].shift();
			}
		}
	
		// level 2 : individual runs 
		for( var p = 0; p < config.skipXruns; ++p )
			topdata.runs.shift();
	}
	
	if( runType == "browsertime" )
	{
		// now, browsertime also includes the same data twice, but in a different way from the headless (because, of course)
		// 1. once in pageData.browsertime[0].default.statistics for all metrics (NOT a Stats object, just an object with the aggregates set)
		// 2. again in pageData.browsertime[0].default.data for each run individually (each data object contains various objects, among which the timing data)
		// so: we CAN'T simply disregard 1 because it's pre-calculated, but we can 2.
		
		var topdata = pageData.browsertime[0].default;
		
		// level 1 : grouped measurements in POJO : invalidate
		for( var metric in topdata.statistics )
		{
			if( topdata.statistics.hasOwnProperty(metric) )
			{
				// so now we have for example statistics.backEndTime
				
				for( var aggregate in topdata.statistics[metric] )
				{
					if( topdata.statistics[metric].hasOwnProperty(aggregate) )
					{
						// we can only invalidate the results here
						// ex. backEndTime.max becomes 999999 here
						// TODO: re-calculate these statistisc from the individual runs using intermediate Stats() objects (but not needed for now)
						topdata.statistics[metric][aggregate] = 999999;
					}
				}
			}
		}
		
		// level 2 : individual runs : shift
		for( var p = 0; p < config.skipXruns; ++p )
			topdata.data.shift();
		
		
		// finally, we also need to delete the HAR and other metadata
		pageData.browsertime[0].runs -= config.skipXruns; // apparently later code looks at this var instead of at the actual array length... go figure
		
		var harData = pageData.har[0].log;
		// harData.pages contains data per page -> so we can just shift the first one out
		// harData.entries is a single flat array with data for ALL resources. Resources have a field .pageref that has harData.pages[x].id value
		// so... get page[0].id, delete all entries that ref to that id, then shift out page[0]... whoever made this HAR format was smoking some good stuff
		
		for( var p = 0; p < config.skipXruns; ++p )
		{
			var removedPage = harData.pages.shift();
			
			harData.entries = harData.entries.filter(function(entry){return (entry.pageref && entry.pageref != removedPage.id);});
		}
	}
	
	return pageData;
}

module.exports = Analyzer;

/**
 * Sitespeed.io - How speedy is your site? (https://www.sitespeed.io)
 * Copyright (c) 2014, Peter Hedenskog, Tobias Lidskog
 * Copyright (c) 2016, Robin Marx
 * and other contributors
 * Released under the Apache 2.0 License
 */
'use strict';
var Stats = require('fast-stats').Stats,
    winston = require('winston'),
    util = require('../../util/util');
var timeMetrics = {};

var testID = "";
var testURL = "";

// The aggregator id is used to print error messages. A better design for 'dynamic' aggregators is needed,
// but this will do for now.
exports.id = 'webpagetestTimeMetrics';

exports.processPage = function(pageData) 
{
  /*
  //var fs = require('fs');
  //fs.writeFileSync('/home/rmarx/wpt_pagedata_debug.json', JSON.stringify(pageData));

  console.log("\n\n\n\n\n\nPAGEDATA : \n\n\n\n\n\n\n\n");
  console.log( JSON.stringify(pageData) ); 
  console.log("\n\n\n\n\n\n/PAGEDATA\n\n\n\n\n\n\n\n");
  */

  var log = winston.loggers.get('sitespeed.io');

  if( !pageData.webpagetest || !pageData.webpagetest.wpt )
  {
    log.error("webpagetest:genericTimeMetric : pageData had no webpagetest.wpt field!");
    return; 
  }

  // https://sites.google.com/a/webpagetest.org/docs/advanced-features/webpagetest-restful-apis#TOC-Getting-test-results
  // structure:
  // pageData.wpt(object).webpagetest(array of responses)[0].response(object).data(object)
  // data:
  // .testId (wpt string ID)
  // .summary (wpt link to summary page)
  // .testUrl
  // .location (wpt location) (of form   location:browser)
  // .from, completed, tester, testerDNS (wpt stuff)
  // .runs (# runs done)
  // .run[] (array of runs)

  // median, average, standardDeviation : single objects with same data as runs, but already aggregated


  // run:
  // .id (numeric)
  // .firstView
  //    .pages, .thumbnails, .images, .rawdata (links to individual webpages that contain more info)
  //    .results[] (array of metrics, most of them simple key-value pairs)

  // so: pageData.wpt.webpagetest[0].data.run[runIndex].firstView.results[metricName] is what we need to query

  // metrics that we care about:
  // explanations: https://sites.google.com/a/webpagetest.org/docs/advanced-features/raw-test-results
  /*
<loadTime>1153</loadTime> // details page top
<TTFB>213</TTFB> // details page top
<render>492</render> // StartRender details page top // first non-white pixel
<visualComplete>xyz</visualComplete> // details page top // Time of the last visual change to the page (in ms, only available when video capture is enabled)
<SpeedIndex>xyz</SpeedIndex> // details page top (caps first letter!)
<docTime>1153</docTime> // Document complete - time // details page top // The time from the start of navigation until the onload event was fired (as measured by WebPagetest, not Navigation Timing)
<fullyLoaded>1216</fullyLoaded> // Fully loaded - time // details page top //  The time from the start of navigation until network activity finished after the onload event
<firstPaint>428</firstPaint> // RUM First Paint // details page top

<domContentLoadedEventStart>497</domContentLoadedEventStart> // details page top // navigation timing
<domContentLoadedEventEnd>514</domContentLoadedEventEnd> // details page top // navigation timing

<loadEventStart>1143</loadEventStart> // details page top
<loadEventEnd>1161</loadEventEnd> // details page top

// most of the typical navigationTiming data isn't here:
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
  'domContentLoadedEventStart', // this one
  'domContentLoadedEventEnd', // this one
  'domComplete',
  'loadEventStart', // this one
  'loadEventEnd' // this one

// and so neither are many of the extra metrics Sitespeed.io calculates from this 

// other things that might be interesting in the future:
<bytesOut>7827</bytesOut>
<bytesOutDoc>7341</bytesOutDoc>
<bytesIn>426013</bytesIn>
<bytesInDoc>423921</bytesInDoc>

<cached>0</cached>

<titleTime>466</titleTime> // Time from the start of the operation until the title first changed (in ms)
<server_count>1</server_count> // # serves associated with DNS name
<server_rtt>0</server_rtt> // Estimated Round Trip Time to the base server (taken from the socket connect time of the base page), blank if not available

<domTime>0</domTime> // seems to always be 0, disregarding

  */


  // so: pageData.wpt.webpagetest[0].data.run[runIndex].firstView.results[metricName] is what we need to query

  if( pageData.webpagetest.wpt.length > 1 )
  {
    log.error("webpagetest:genericTimeMetric : pagedata had more than 1 testresponse : " + pageData.webpagetest.wpt.length);
    return; 
  }

  testID = pageData.webpagetest.wpt[0].response.data.testId;
  testURL = pageData.webpagetest.wpt[0].response.data.summary; // data.testURL is the url we tested, not where we can watch te results in WPT host (hurray for naming consistencies in WPT)


  // if only 1 run, .run is an object, otherwhise it's an array... I HATE INCONSISTENT FORMATS!
  var runs = Array.isArray(pageData.webpagetest.wpt[0].response.data.run) ?
        pageData.webpagetest.wpt[0].response.data.run :
        [pageData.webpagetest.wpt[0].response.data.run];


  log.info("webpagetest:genericTimeMetric : found " + pageData.webpagetest.wpt[0].response.data.testUrl + " @ " + testID +" with # connections " + runs[0].firstView.results["connections"] + " and " + runs.length + " runs" );

  var bAndL = pageData.webpagetest.wpt[0].response.data.location.split(':'); // location:browser, ex. EDM1:chrome
  var browser = bAndL[1].toLowerCase().replace(' ', '_'); 

  runs.forEach( function(run) 
  {
    var views = ['firstView', 'repeatView'];

    views.forEach( function(view) 
    {
      if (typeof run[view] == 'undefined') 
        return;

      var baseKey = "";
      if( view == "repeatView" )
        baseKey = "repeat";

      var results = run[view].results;
      Object.keys(results).forEach(function(metric) 
      {
        if( Array.isArray(results[metric]) )
          return;


        // here we add all metrics, we only later do selection which ones we really need 

        // the browsertime aggregator logs metrics twice, 1 with and 1 without browser name appended
        // let's do that too, for consistency
        if ( !timeMetrics.hasOwnProperty(baseKey + metric) ) 
        {
          timeMetrics[baseKey + metric] = new Stats();
        } 
        if ( !timeMetrics.hasOwnProperty(baseKey + metric + browser) ) 
        {
          timeMetrics[baseKey + metric + browser] = new Stats();
        }

        timeMetrics[baseKey + metric].push( Number(results[metric]) );
        timeMetrics[baseKey + metric + browser].push( Number(results[metric]) );

      }); // individual metrics

      var userTimes = run[view].results.userTimes;
      if( userTimes )
      {
        Object.keys(userTimes).forEach(function(metric) 
        {
          if( Array.isArray(userTimes[metric]) )
            return;

          var key = "user" + baseKey + metric;

          // the browsertime aggregator logs metrics twice, 1 with and 1 without browser name appended
          // let's do that too, for consistency
          if ( !timeMetrics.hasOwnProperty(key) ) 
          {
            timeMetrics[key] = new Stats();
          } 
          if ( !timeMetrics.hasOwnProperty(key + browser) ) 
          {
            timeMetrics[key + browser] = new Stats();
          }

          timeMetrics[key].push( Number(results[metric]) );
          timeMetrics[key + browser].push( Number(results[metric]) );

        }); // user metrics
      }

    }); // views
  });// runs
};

exports.generateResults = function() 
{
  var keys = Object.keys(timeMetrics),
    result = [];

  for (var i = 0; i < keys.length; i++) 
  {
    result.push({
      id: keys[i],
      title: keys[i],
      desc: 'webpagetest metric',
      type: 'timing',
      stats: util.getStatisticsObject(timeMetrics[keys[i]], 0),
      unit: 'milliseconds',
      externalID: testID, // each metric is saved separetely, so each metric stores testID as well
      externalURL: testURL
    });
  }

  return result;
};

exports.clear = function() {
  timeMetrics = {};
};

/**
 * Sitespeed.io - How speedy is your site? (https://www.sitespeed.io)
 * Copyright (c) 2014, Peter Hedenskog, Tobias Lidskog
 * and other contributors
 * Released under the Apache 2.0 License
 */
'use strict';

var util = require('../util/util'),
  fs = require('fs-extra'),
  path = require('path'),
  winston = require('winston'),
  bt = require('browsertime'),
  Promise = require('bluebird'),
  async = require('async');

var engine;

module.exports = {
  analyze: function(urls, config, asyncDoneCallback) {

    var browserList = config.browsertime;
    var log = winston.loggers.get('sitespeed.io');

    var logOptions = {};
    if (config.verbose) {
      logOptions.v = 1;
    }
    bt.logging.configure(logOptions);

    var engineOptions = {
      iterations: config.no,
      scripts: bt.browserScripts.defaultScripts
    };
    var browser = browserList[0];
    engineOptions.browser = browser;
    engine = new bt.Engine(engineOptions);

    fs.mkdirsSync(path.join(config.run.absResultDir, config.dataDir, 'browsertime', browser));
    fs.mkdirsSync(path.join(config.run.absResultDir, config.dataDir, 'har', browser));

    engine
      .start()
      .then(function() {
        return Promise.reduce(urls, function(results, url) {
          return engine.run(url)
            .tap(function(result) {
              var jsonName = path.join(config.run.absResultDir, config.dataDir, 'browsertime', browserList[0],
                util.getFileName(url) + '-browsertime.json');

              var harName = path.join(config.run.absResultDir, config.dataDir, 'har', browserList[0],
                util.getFileName(url) + '.har');

              var browsertimeData = JSON.stringify(result.browsertimeData, null, 2);
              var har = JSON.stringify(result.har, null, 2);

              fs.writeFileSync(jsonName, browsertimeData);
              fs.writeFileSync(harName, har);
            })
            .then(function(result) {
              result.browsertimeData = result.browsertimeData.map(function(bt) {
                bt.browserName = browser;
                return bt;
              });
              results[url] = result;
              return results;
            });
        }, {})
      })
      .finally(function() {
        return engine.stop();
      })
      .then(function(data) {
        var result = {
          'type': 'browsertime',
          errors: [],
          data: data
        };
        console.log('DONE with BROWSERTIME!!!!');
        return asyncDoneCallback(null, result);
      })
      .catch(function(e) {
        console.log('ERROR with BROWSERTIME!!!! ' + e);
        return asyncDoneCallback(e);
      });
  }
};

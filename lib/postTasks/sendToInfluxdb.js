/**
 * Sitespeed.io - How speedy is your site? (https://www.sitespeed.io)
 * Copyright (c) 2014, Peter Hedenskog, Tobias Lidskog
 * and other contributors
 * Released under the Apache 2.0 License
 */
'use strict';
var InfluxdbSender 		= require('../influxdb/influxdbSender');
var InfluxdbCollector 	= require('../influxdb/influxdbCollector');

exports.task = function(result, config, cb) 
{
	if( config.influxdbHost && config.influxdbTags )
	{
		var sender = new InfluxdbSender(config.influxdbHost, config.influxdbPort, config);
		var collector = new InfluxdbCollector(config);
		
		var statistics = "";
		statistics = collector.collect(result.aggregates, result.pages, result.domains);
		
    	sender.send(statistics, cb);
	}
	else
	{
		if( config.influxdbHost )
			console.error("sendToInfluxdb:task : for now, we require config.influxdbTags to be set as well");
			
		cb();
	}
};

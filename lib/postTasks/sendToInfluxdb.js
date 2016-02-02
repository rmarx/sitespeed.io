/**
 * Sitespeed.io - How speedy is your site? (https://www.sitespeed.io)
 * Copyright (c) 2014, Peter Hedenskog, Tobias Lidskog
 * and other contributors
 * Released under the Apache 2.0 License
 */
'use strict';
var InfluxdbSender 		= require('../influxdb/influxdbSender');
var InfluxdbCollector 	= require('../influxdb/influxdbCollector');

var hasAlreadyBeenCalled = false;

exports.task = function(result, config, cb) 
{
	if( hasAlreadyBeenCalled )
	{
		console.error("INFLUXDB sender has already been called... this shouldn't happen!!");
		cb();
		return;
	}
	
	console.log("INFLUXDB SEND START 2345!");
	//console.log(config);

	if( config.influxdbHost )
	{
		var sender = new InfluxdbSender(config.influxdbHost, config.influxdbPort, config);
		//var collector = new InfluxdbCollector(config);
		
		//var statistics = collector.collect(result.aggregates, result.pages, result.domains);
		var statistics = "data,sitespeedtest=true myField=1.25";
    	sender.send(statistics, cb);
	}
	else
		cb();
		
	console.log("INFLUXDB SEND END! 5678");
	hasAlreadyBeenCalled = true;

};

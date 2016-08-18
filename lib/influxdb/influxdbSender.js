/**
 * Sitespeed.io - How speedy is your site? (https://www.sitespeed.io)
 * Copyright (c) 2014, Peter Hedenskog, Tobias Lidskog
 * and other contributors
 * Released under the Apache 2.0 License
 */
'use strict';
var winston = require('winston'),
  http = require('http');

function InfluxdbSender(host, port, config) {
  this.host = host;
  this.port = port;
  this.config = config;
  this.log = winston.loggers.get('sitespeed.io');
}

InfluxdbSender.prototype.send = function(data, cb) 
{
  var self = this;

  this.log.verbose('Send the following keys to InfluxDB: ' + self.host + ":" + self.port + " @ " + self.config.influxdbDatabase, data);
  
	var options = {
	  hostname: self.host,
	  port: self.port,
	  path: '/write?db=' + self.config.influxdbDatabase,
	  method: 'POST'
	};

	var request = http.request(options, function(res) 
	{
		//console.log("OPTIONS", options);
		//console.log('STATUS: ' + res.statusCode);
		//console.log('HEADERS: ' + JSON.stringify(res.headers));
		
		res.setEncoding('utf8');
		
		res.on('data', function (chunk) 
		{
			self.log.log('verbose', 'influxdbSender: BODY: ' + chunk);
		});
		
		res.on('end', function () 
		{
			self.log.log('verbose', 'influxdbSender: request end');
		});
	});
	
	request.on('error', (e) => {
  		self.log.log('error','influxdbSender: problem with request: ' + e);
	});

	request.write(data);
	request.end();
	
	cb();
};


module.exports = InfluxdbSender;

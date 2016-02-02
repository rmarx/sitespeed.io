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

  this.log.verbose('Send the following keys to InfluxDB:', data);
  
	var options = {
	  hostname: self.host,
	  port: self.port,
	  path: '/write?db=' + self.config.influxdbDatabase,
	  method: 'POST'
	};

	var request = http.request(options, function(res) 
	{
		console.log("OPTIONS", options);
		console.log('STATUS: ' + res.statusCode);
		console.log('HEADERS: ' + JSON.stringify(res.headers));
		res.setEncoding('utf8');
		
		res.on('data', function (chunk) 
		{
			self.log.log('verbose', 'BODY: ' + chunk);
		});
		
		res.on('end', function () 
		{
			self.log.log('verbose', 'request end');
		});
	});
	
	request.on('error', (e) => {
  		self.log.log('error','problem with request: ' + e);
	});

	request.write(data);
	request.end();
	console.log("CALLBACK");
	cb();






/*
  var server = net.createConnection(this.port, this.host);
  
  server.addListener('error', function(connectionException) 
  {
    self.log.log('error', 'Couldn\'t send data to InfluxDB:' + connectionException + ' for host:' + self.host + ' port:' + self.port);
	cb();
  });

  server.on('connect', function() 
  {
    self.log.log('info', 'Sending data to InfluxDB host:' + self.host + ' port:' + self.port);
    
    this.write(data);
    this.end();
    cb();
  });
  */

};


module.exports = InfluxdbSender;

var util = require('util');
var cluster = require('cluster');
var manAlert = require('./managerAlert');
var util = require('util');
var os = require('os');
var file = fs = require('fs');
var nconf = require('nconf');

var myClass = function() {};

myClass.prototype.startup = function() {
	this.init();
	this.statsinit();
	
	var express = require('express');
	var app = express();
	var session = require('express-session');
	var RedisStore = require('connect-redis')(session);
	var store = new RedisStore({});
	app.use(session({
    store: store,
    name: this.nconf.get('manCookieName'),
    secret: this.nconf.get('manSessionSecret'),
    resave: false,
		saveUninitialized: false
	}));
	
	var routing = require('./CmonRouter')(this);
	app.use('/', routing);
	
	var userrouting = require('./CmonUserRouter')(this);
	app.use('/user/', userrouting);
	
	app.listen(this.nconf.get('manPort'));
	this.logger.info('CMonManager','Manager interface started on port: ' + this.nconf.get('manPort') + ' and pid: ' + process.pid);

	this.addEvent('system','Startup','Cmon Manager startup');

	cluster.on('exit', this.workerDied.bind(this));
	if (this.nconf.get('enableWorkers')) {
		for (var i = 0; i < parseInt(this.nconf.get('workersNumber'),10); i++) {
			//Fork new worker!
			this.addWorker();
		}
	}
	//console.log("Watch Files", this.nconf.get('watchFiles'));
	//
	if (this.nconf.get('watchFiles') && this.nconf.get('watchFiles').length > 0) {
		for (var i = 0; i < this.nconf.get('watchFiles').length; i++) {
			var f = __dirname + "/" + this.nconf.get('watchFiles')[i];
			if (fs.existsSync(f)) {
				this.logger.verbose('CMonManager','Watching file/directory: ' + f);
				file.watch(f, function (curr, prev) {
				  for (var y = 0; y < this.workers.length; y++) {
			  		this.restartWorker(this.workers[y].pid);
					}
				}.bind(this));
			}
		}
	}
	
	if (this.userInit) {
		this.userInit();
	}
	return app;
};
module.exports = myClass;

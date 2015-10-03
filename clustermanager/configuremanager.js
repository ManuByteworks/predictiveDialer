var memoryUsageObject = require('./memoryUsageObject');
var managerCpuUsage = require('./managerCpuUsage');
var manAlert = require('./managerAlert');
var sleep = require('sleep');
var os = require('os');
var file = require('fs');
var fs = file;
var memwatch = require('memwatch');

var configure = function(man) {
	manager = man;
	
	if (manager.nconf.get('appPort') < 1) {
		var error = new Error("Please set your Application Port (appPort)");
		return error;
	}
	if (manager.nconf.get('manPort') < 1) {
		var error = new Error("Please set your Management Port (manPort)");
		return error;
	}
	
	if (manager.nconf.get('appPort') == manager.nconf.get('manPort')) {
		var error = new Error("appPort must be different than manPort");
		return error;
	}
	
	if (!manager.nconf.get('manUsername') || manager.nconf.get('manUsername') == "") {
		var error = new Error("Management username must be set");
		return error;
	}
	
	if (!manager.nconf.get('manPassword') || manager.nconf.get('manPassword') == "") {
		var error = new Error("Management password must be set");
		return error;
	}
	
	var express = require('express');
	var app = express();
	
	var session = require('express-session');
	var RedisStore = require('connect-redis')(session);
	var store = new RedisStore({});
	app.use(session({
    store: store,
    name: manager.nconf.get('manCookieName'),
    secret: manager.nconf.get('manSessionSecret'),
    resave: false,
		saveUninitialized: false
	}));
	
	
	var routing = require('./router')(manager);
	app.use('/', routing);
	
	app.listen(manager.nconf.get('manPort'));
	console.log('Manager interface started on port: ' + manager.nconf.get('manPort') + ' and pid: ' + process.pid);
	
	
	
	/*
	setTimeout( function() {
		collectFullStats();
	}, manager.nconf.get('statsInterval'));
	*/
	restartFullStats();
	/*
	setInterval( function() {
		//var hd = new memwatch.HeapDiff();
		
		cleanOldStats();
		//var hde = hd.end();
		//console.log(JSON.stringify(hde, null, 2));
		
	}, 60000);
	
	cleanOldStats();
	*/
	//Now start some forking...
	
	//Next return the app...
	return app;
	
};

var restartFullStats = function() {
	setTimeout( function() {
		collectFullStats();		
		//var hde = hd.end();
	  //console.log(JSON.stringify(hde, null, 2));
	  //hd = new memwatch.HeapDiff();
	}, manager.nconf.get('statsInterval'));
};

var cleanOldStats = function() {
	var len = manager.managerStats.timeindexes.length;
	console.log("Old stats: ", len);
	var limit = new Date().getTime() - 60000;
	var myindex = null;
	var i;
	var t;
	for (i = len - 1; i > -1; i--) {
		t = manager.managerStats.timeindexes[i];
		if (t > limit) { continue; }
		if (myindex == null) {
			myindex = i;
		}
		manager.managerStats[t] = null;
		delete manager.managerStats[t];
	}
	if (myindex > -1) {
		for (i = 0; i < myindex; i++) {
			manager.managerStats.timeindexes[0] = null;
			manager.managerStats.timeindexes.splice(0, 0);
		}
	}
	
	t = null;
	i = null;
	len = null;
	limit = null;
	myindex = null;
	
	console.log("New stats: ", manager.managerStats.timeindexes.length);
	
	
};

var collectFullStats = function() {
	var d, ms, timeindex, cpu, isWin, fn, async, asyncTasks, i;
	
	d = new Date();
	ms = d.getMilliseconds();
	if (ms > 750) {
		d.setMilliseconds(750);
	} else if (ms > 500) {
		d.setMilliseconds(500);
	} else if (ms > 250) {
		d.setMilliseconds(250);
	} else {
		d.setMilliseconds(0);
	}
	timeindex = d.getTime();
	//currentStat = manager.managerStats[timeindex];
	if (manager.managerStats[timeindex]) {
		console.log("Error: a stats record exists for timeindex = " + timeindex);
	}
	if (!manager.managerStats[timeindex]) {
		manager.managerStats[timeindex] = {
			manager: {
				pid: process.pid,
				cpu: null,
				memory: null,
				freeMemory: null
			},
			workers: [
			]
		};
		
		for (i = 0; i < manager.workers.length; i++) {
			manager.managerStats[timeindex].workers.push({
				pid: manager.workers[i].pid,
				cpu: null,
				memory: manager.workers[i].process.memoryUsage(),
				freeMemory: os.freemem()
			});
		}
		
		manager.managerStats[timeindex].manager.memory = process.memoryUsage();
		manager.managerStats[timeindex].manager.freeMemory = os.freemem();
		
		isWin = /^win/.test(process.platform);
		//manager cpu
		if (isWin) {
			var cpu = require('windows-cpu');
			fn = function(manager, proc, timeindex, currentStat, callback) {
				//console.log("Inside func... for pid " + proc.pid);
				cpu.findLoad(proc.pid, function(error, result) {
					if (error) { 
						if (proc.pid == currentStat.manager.pid) {
							manager.managerStats[timeindex].manager.cpu = null;
						}
						if (callback) {
							callback(); 
							return;
						} else {
							return; 
						}
					}
					if (proc.pid == currentStat.manager.pid) {
						manager.managerStats[timeindex].manager.cpu = result.load;
					}
					if (callback) { callback(); }
				});
			};
		}
		
		
		var async = require("async");
		var asyncTasks = [];
		asyncTasks.push(
			function(callback) {
				fn(manager, process, timeindex, manager.managerStats[timeindex], callback);
			}
		);
		for (i = 0; i < manager.workers.length; i++) {
			asyncTasks.push(
				function(callback) {
					fn(manager, manager.workers[i].process, timeindex, manager.managerStats[timeindex], callback);
				}
			);
		}
		
		//console.log("Going parallel...." + timeindex);
		async.parallel(asyncTasks, function(){
		  // All tasks are done now
		  //manager.managerStats.timeindexes.push(timeindex);
		  if (manager.nconf.get('statsPersist') == true) {
		  	file.appendFile("clustermanager/_stats/managerStats.json", JSON.stringify({ timeindex: timeindex, data: manager.managerStats[timeindex] }) + os.EOL, {
		  		"encoding" : "utf-8"
		  	},
		  	function (err) {
		  		if (err) { console.log(err); }
		  		manager.managerStats[timeindex] = null;
				  restartFullStats();
				  timeindex = null;
				});
		  }
		});
		
		async = null;
		d = null;
		ms = null;

		cpu = null;
		isWin = null;
		fn = null;
		async = null;
		asyncTasks = null;
		i = null;
		
	}
	
};

var addBaseProperties = function(manager) {
	manager.workers = [];
	manager.alerts = [];
	manager.stats = [];
	manager.cpucount = os.cpus().length;
	manager.cpumodel = os.cpus()[0].model;
	manager.cpuavgspeed = 0;
	for (var i = 0; i < os.cpus().length; i++) {
		manager.cpuavgspeed = manager.cpuavgspeed + os.cpus()[i].speed;
	}
	manager.cpuavgspeed = manager.cpuavgspeed / os.cpus().length;
	manager.ostype = os.platform();
	manager.osrelease = os.release();
	manager.hostname = os.hostname();
	manager.osarch = os.arch();
	manager.osmemory = os.totalmem();
	manager.uptime = os.uptime();
	manager.interfaces = [];
	var ints = os.networkInterfaces();
	
	for (var n in ints) {
		if (ints.hasOwnProperty(n)) {
			var adds = [];
			for (var i = 0; i < ints[n].length; i++) {
				adds.push(ints[n][i].address);
			}
			manager.interfaces.push({name: n, addresses: adds});
		}
	}
	manager.cpustats = [];
	manager.runningWorkers = 0;
	manager.memorystats = [];
	manager.timers = [];
	manager.startTime = new Date();
	manager.workersStats = [];
	manager.alerts.push(new manAlert('system', 'Manager start up', 'Manager has started operations'));
	manager.managerStats = {};
	manager.managerStats.timeindexes = [];
	if (fs.existsSync("clustermanager/_stats/managerStats.json") && false) {
		var lines = fs.readFileSync("clustermanager/_stats/managerStats.json").toString().split("\n")
		var len = lines.length;
		var cnt = 0;
		for (var i = 0; i < len; i++) {
			try {
				
				var o = JSON.parse(lines[i]);
				cnt++;
				manager.managerStats.timeindexes.push(o.timeindex);
				manager.managerStats[o.timeindex] = o.data;
			} catch(e) {
				console.log(e);
			}
		}
		console.log("Loaded " + cnt + " old stats");
	}
	manager.nconf = require('nconf');
	manager.nconf.file('conf/config.json');
	manager.nconf.defaults({
		'appName' : 'Default cluster app',
		'appShortName' : 'CMon',
		'workersNumber' : 3, // default is "do not start" workers
		'workersLifetimeSeconds' : 60, //set to 0 to disable killing
		'restartAfterTimeLimit' : false,
		'workersLifetimeRequests' : 0, //set to 0 to disable killing
		'appPort' : 3000,
		'manEnabled' : true,
		'manSessionSecret' : 'setThisToSomethingSecret',
		'manCookieName' : 'WPCLUSTERADM',
		'manPort' : 3001,
		'manUsername' : 'cluster-admin',
		'manPassword' : 'cluster-password',
		'stats' : true,
		'workersStatsMode' : 'interval', // or 'realtime'
		'statsInterval' : 500, // if stastMode == 'interval', this is the interval in ms
		'managerStatsAggregate' : true,
		'statsPersist' : true,
		'statsMaxAge' : 1000 * 60 * 60 * 24 * 30, //in ms
		'workersStatisAggregate' : true
	});
	return manager;
};

module.exports = configure;
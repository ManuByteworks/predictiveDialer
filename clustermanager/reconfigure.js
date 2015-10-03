var memoryUsageObject = require('./memoryUsageObject');
var managerCpuUsage = require('./managerCpuUsage');
var sleep = require('sleep');
var os = require('os');
var file = require('fs');

var reconfigure = function(manager) {
	
	if (manager.data.nconf.get('appPort') < 1) {
		var error = new Error("Please set your Application Port (appPort)");
		return error;
	}
	if (manager.data.nconf.get('manEnabled')) {
		if (manager.data.nconf.get('manPort') < 1) {
			var error = new Error("Please set your Management Port (manPort)");
			return error;
		}
		
		if (manager.data.nconf.get('appPort') == manager.data.nconf.get('manPort')) {
			var error = new Error("appPort must be different than manPort");
			return error;
		}
		
		if (!manager.data.nconf.get('manUsername') || manager.data.nconf.get('manUsername') == "") {
			var error = new Error("Management username must be set");
			return error;
		}
		
		if (!manager.data.nconf.get('manPassword') || manager.data.nconf.get('manPassword') == "") {
			var error = new Error("Management password must be set");
			return error;
		}
		
		if (manager.server) {
			//manager.server.close();
			//delete manager.server;
			
			manager.app._router.stack.splice(4,1);
			delete require.cache['./router']
			var managerRouter = require('./router')(null);
			manager.app.use('/', managerRouter);
			console.log("Router reconfigured...");
			
		}
		
		if (!manager.server) {
			var express = require('express');
			manager.app = express();
			var session = require('express-session');
			
			
			manager.app.use(session({
				secret: manager.data.nconf.get('manSessionSecret'),
				name: manager.data.nconf.get('manCookieName'),
				resave: true,
				saveUninitialized: true
			}));
			
			manager.app.use(function (req, res, next) {
			  req.manager = manager.data;
			  next();
			});
			
			var managerRouter = require('./router')(null);
			manager.app.use('/', managerRouter);
			
			console.log('Manager interface started on port: ' + manager.data.nconf.get('manPort') + ' and pid: ' + process.pid);
			manager.server = manager.app.listen(manager.data.nconf.get('manPort'));
			//console.log(manager.app._router.stack[4]);
		}
		
	} else {
		if (manager.server) {
			console.log('Manager interface stopped');
			manager.server.close();
			delete manager.server;
		}
	}
	
	if (!manager.timers) {
		manager.timers = {};
	}
	manager.data.timers.statsTimer = setTimeout( function() {
		collectFullStats(manager.data, process);
	}, manager.data.nconf.get('statsInterval'));
	
	manager.data.timers.cleanStatsTimer = setTimeout( function() {
		cleanOldStats(manager.data);
	}, 1000 * 60 * 5);
	
};

var cleanOldStats = function(man) {
	
	console.log("Trying to clean old stats....");
	var len = man.managerStats.timeindexes.length;
	var limit = new Date().getTime() - 5 * 60 * 1000;
	var myindex = null;
	for (var i = len - 1; i > -1; i--) {
		var t = man.managerStats.timeindexes[i];
		if (t > limit) { continue; }
		if (myindex == null) {
			myindex = i;
		}
		delete man.managerStats[t];
	}
	if (myindex > -1) {
		man.managerStats.timeindexes.splice(0, myindex + 1);
		console.log("Cleaning " + (myindex+1) + " from 0");
		console.log("Remaining stats count: " + man.managerStats.timeindexes.length);
		console.log("Remaining stats count: " + man.managerStats.length - 1);
	}
};

var collectFullStats = function(man, proc) {
	var d = new Date();
	var ms = d.getMilliseconds();
	if (ms > 750) {
		d.setMilliseconds(750);
	} else if (ms > 500) {
		d.setMilliseconds(500);
	} else if (ms > 250) {
		d.setMilliseconds(250);
	} else {
		d.setMilliseconds(0);
	}
	var timeindex = d.getTime();
	
	var currentStat = man.managerStats[timeindex];
	if (currentStat) {
		console.log("Error: a stats record exists for timeindex = " + timeindex);
	}
	if (!currentStat) {
		currentStat = {
			manager: {
				pid: process.pid,
				cpu: null,
				memory: null,
				freeMemory: null
			},
			workers: [
			]
		};
		
		for (var i = 0; i < man.workers.length; i++) {
			currentStat.workers.push({
				pid: man.workers[i].pid,
				cpu: null,
				memory: man.workers[i].process.memoryUsage(),
				freeMemory: os.freemem()
			});
		}
		
		currentStat.manager.memory = proc.memoryUsage();
		currentStat.manager.freeMemory = os.freemem();
		
		var isWin = /^win/.test(process.platform);
		//manager cpu
		var fn;
		if (isWin) {
			var cpu = require('windows-cpu');
			fn = function(man, proc, timeindex,callback) {
				//console.log("Inside func... for pid " + proc.pid);
				cpu.findLoad(proc.pid, function(error, result) {
					if (error) { 
						if (proc.pid == currentStat.manager.pid) {
							currentStat.manager.cpu = null;
						}
						if (callback) {
							callback(); 
							return;
						} else {
							return; 
						}
					}
					if (proc.pid == currentStat.manager.pid) {
						currentStat.manager.cpu = result.load;
					}
					if (callback) { callback(); }
				});
			};
		}
		
		var async = require("async");
		var asyncTasks = [];
		asyncTasks.push(
			function(callback) {
				fn(man, proc, timeindex, callback);
			}
		);
		for (var i = 0; i < man.workers.length; i++) {
			asyncTasks.push(
				function(callback) {
					//console.log("Doing fn...");
					fn(man, man.workers[i].process, timeindex, callback);
				}
			);
		}
		
		//console.log("Going parallel....");
		async.parallel(asyncTasks, function(){
		  // All tasks are done now
		  //console.log("pushing stat with timeindex " + timeindex);
		  man.managerStats[timeindex] = currentStat;
		  man.managerStats.timeindexes.push(timeindex);
		  if (man.nconf.get('statsPersist') == true) {
		  	file.appendFile("clustermanager/_stats/managerStats.json", JSON.stringify({ timeindex: timeindex, data: currentStat }) + os.EOL, {
		  		"encoding" : "utf-8"
		  	},
		  	function (err) {
		  		if (err) { console.log(err); }
				  man.timers.statsTimer = setTimeout( function() {
					collectFullStats(man, proc);
					}, man.nconf.get('statsInterval'));
				});
		  }
		  
		});



			
	}
	
};


var collectManagerRamUsage = function(man, proc) {
	man.memorystats.push(new managerMemoryUsage(proc.memoryUsage(), os.freemem()));	
	man.timers.collectManagerRamUsage = setTimeout(function() {collectManagerRamUsage(man, proc);}, 5000);
};

var collectManagerCpuUsage = function(man, proc) {
	var isWin = /^win/.test(process.platform);
	if (isWin) {
		var cpu = require('windows-cpu');
		cpu.findLoad(proc.pid, function(error, result) {
			if(error) {
				return console.log(error);
	    }
	    //console.log("Cpu Usage for pid: " + proc.pid);
	    man.cpustats.push(new managerCpuUsage(result.load));
	    man.timers.collectManagerCpuUsage = setTimeout(function() {collectManagerCpuUsage(man, proc);}, 5000);
	    cpu = null;
	    error = null;
	    result = null;
		});
	}
};


module.exports = reconfigure;
var os = require('os');
var file = require('fs');

var CmonStatsCollector = function(manager) {
	this.manager = manager;
	this.statsinit();
};

CmonStatsCollector.prototype.statscallback = function() {
	//console.log("Stats count = " + this.manager.managerStats.timeindexes.length);
	setTimeout(this.statsinit.bind(this), this.manager.nconf.get('statsInterval'));
};

CmonStatsCollector.prototype.statsinit = function() {
	this.getStats(this.statscallback.bind(this));
};


CmonStatsCollector.prototype.getStats = function(maincallback) {
	var d, ms, timeindex, cpu, isWin, fn, async, asyncTasks, i, y;
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
	d = null;
	ms = null;
	if (this.manager.managerStats[timeindex]) {
		console.log("Error: a stats record exists for timeindex = " + timeindex);
	}
	if (!this.manager.managerStats[timeindex]) {
		this.manager.managerStats.timeindexes.push(timeindex);
		this.manager.managerStats[timeindex] = {
			manager: {
				pid: process.pid,
				cpu: null,
				memory: null,
				freeMemory: null
			},
			workers: [
			]
		};
		
		for (i = 0; i < this.manager.workers.length; i++) {
			this.manager.managerStats[timeindex].workers.push({
				pid: manager.workers[i].pid,
				cpu: null,
				memory: this.manager.workers[i].process.memoryUsage(),
				freeMemory: os.freemem()
			});
		}
		
		this.manager.managerStats[timeindex].manager.memory = process.memoryUsage();
		this.manager.managerStats[timeindex].manager.freeMemory = os.freemem();
		
		isWin = /^win/.test(process.platform);
		//manager cpu
		if (isWin) {
			var cpu = require('windows-cpu');
			fn = function(proc, timeindex, currentStat, callback) {
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
			}.bind(this);
		}
		
		
		var async = require("async");
		var asyncTasks = [];
		asyncTasks.push(
			function(callback) {
				fn(process, timeindex, this.manager.managerStats[timeindex], callback);
			}.bind(this)
		);
		for (i = 0; i < this.manager.workers.length; i++) {
			asyncTasks.push(
				function(callback) {
					fn(this.manager.workers[i].process, timeindex, this.manager.managerStats[timeindex], callback);
				}
			);
		}
		
		//console.log("Going parallel...." + timeindex);
		async.parallel(asyncTasks, function(){
		  // All tasks are done now
		  //manager.managerStats.timeindexes.push(timeindex);
		  if (this.manager.nconf.get('statsPersist') == true) {
		  	file.appendFile("clustermanager/_stats/managerStats.json", JSON.stringify({ timeindex: timeindex, data: this.manager.managerStats[timeindex] }) + os.EOL, {
		  		"encoding" : "utf-8"
		  	}, function (err) {
		  		if (err) { console.log(err); }
		  		/*
		  		this.manager.managerStats[timeindex] = null;
				  restartFullStats();
				  
				  */
				  timeindex = null;
				  maincallback();
				});
		  } else {
		  	timeindex = null;
				maincallback();
		  }
		}.bind(this));
		
		async = null;

		cpu = null;
		isWin = null;
		fn = null;
		async = null;
		asyncTasks = null;
		i = null;
	}
	
	var last = null;
	for (y = this.manager.managerStats.timeindexes.length - 1; y > -1; y--) {
		var ti = this.manager.managerStats.timeindexes[y];
		
		var diff = (new Date()).getTime() - ti; 
		//console.log(this.manager.nconf.get('statsMaxAge'), ti, (new Date()).getTime() - ti);
		if (diff > this.manager.nconf.get('statsMaxAge')) {
			//console.log("Cleaning old stats...");
			if (last == null) {
				last = y;
				//if (last > -1) this.manager.managerStats.timeindexes.splice(0, last);
				//console.log("Last = " + last);
			}
			//delete this.manager.managerStats[ti];
		} else {
			//console.log("Keeping " + ti + " 'cause diff = " + diff);
		}
	}
	if (last > -1) {
		for (var y = 0; y < last; y++) {
			var ti = this.manager.managerStats.timeindexes[0];
			this.manager.managerStats.timeindexes.splice(0, 1);
			delete this.manager.managerStats[ti];
			//console.log("Deleting " + ti);
		}
	}
	last = null;
};

module.exports = CmonStatsCollector;
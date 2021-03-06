var myClass = function() {};
var os = require('os');
var manAlert = require('./managerAlert');
var file = require('fs');

myClass.prototype.addEvent = function(altype, altitle, altext) {
	var ts = (new Date()).getTime();
	if (!this.alerts[ts]) { this.alerts[ts] = []; this.alerts.timeindexes.push(ts); }
	this.alerts[ts].push(new manAlert(altype, altitle, altext));	
};

myClass.prototype.statscallback = function() {
	setTimeout(this.statsinit.bind(this), this.nconf.get('statsInterval'));
};

myClass.prototype.statsinit = function() {
	this.getStats(this.statscallback.bind(this));
};

myClass.prototype.getStats = function(maincallback) {
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
	if (this.managerStats[timeindex]) {
		console.log("Error: a stats record exists for timeindex = " + timeindex);
	}
	if (!this.managerStats[timeindex]) {
		this.managerStats.timeindexes.push(timeindex);
		this.managerStats[timeindex] = {
			manager: {
				pid: process.pid,
				cpu: null,
				memory: null,
				freeMemory: null
			},
			workers: {}
		};
		/*
		for (i = 0; i < this.workers.length; i++) {
			this.managerStats[timeindex].workers.push({
				pid: this.workers[i].pid,
				cpu: null,
				memory: this.workers[i].process.memoryUsage(),
				freeMemory: os.freemem()
			});
		}
		*/
		this.managerStats[timeindex].manager.memory = process.memoryUsage();
		this.managerStats[timeindex].manager.freeMemory = os.freemem();
		
		for (var i = 0; i < this.workers.length; i++) {
			if (!this.workers[i].stats) { continue; }
			var pid = this.workers[i].pid;
			//console.log("Got stats for pid",pid);
			this.managerStats[timeindex].workers[pid] = {
				cpu: this.workers[i].stats.cpu,
				memory: this.workers[i].stats.memory
			}
			delete this.workers[i].stats;
		}
		
		isWin = /^win/.test(process.platform);
		//manager cpu
		if (isWin) {
			var cpu = require('windows-cpu');
			cpu.findLoad(process.pid, function(error, result) {
				if (error) { 
					this.managerStats[timeindex].manager.cpu = null;
				} else {
					this.managerStats[timeindex].manager.cpu = result.load;
				}
			  if (this.nconf.get('statsPersist') == true) {
			  	file.appendFile("clustermanager/_stats/managerStats.json", JSON.stringify({ timeindex: timeindex, data: this.managerStats[timeindex] }) + os.EOL, {
			  		"encoding" : "utf-8"
			  	}, function (err) {
		  			if (err) { console.log(err); }
					  timeindex = null;
					  cpu = null;
						isWin = null;
						fn = null;
						async = null;
						asyncTasks = null;
						i = null;
					  maincallback();
					});
				} else {
					timeindex = null;
				  cpu = null;
					isWin = null;
					fn = null;
					async = null;
					asyncTasks = null;
					i = null;
					maincallback();
				}
			}.bind(this));
		} else {
			var usage = require('usage');
			var pid = process.pid; // you can use any valid PID instead
			usage.lookup(pid, function(error, result) {
				if (error) { 
					this.managerStats[timeindex].manager.cpu = null;
				} else {
					this.managerStats[timeindex].manager.cpu = result.cpu;
				}
				if (this.nconf.get('statsPersist') == true) {
			  	file.appendFile("clustermanager/_stats/managerStats.json", JSON.stringify({ timeindex: timeindex, data: this.managerStats[timeindex] }) + os.EOL, {
			  		"encoding" : "utf-8"
			  	}, function (err) {
		  			if (err) { console.log(err); }
					  timeindex = null;
					  cpu = null;
						isWin = null;
						fn = null;
						async = null;
						asyncTasks = null;
						i = null;
					  maincallback();
					});
				} else {
					timeindex = null;
				  cpu = null;
					isWin = null;
					fn = null;
					async = null;
					asyncTasks = null;
					i = null;
					maincallback();
				}
			}.bind(this));
		}
		

	}
	
	var last = null;
	for (y = this.managerStats.timeindexes.length - 1; y > -1; y--) {
		var ti = this.managerStats.timeindexes[y];
		
		var diff = (new Date()).getTime() - ti; 
		//console.log(this.nconf.get('statsMaxAge'), ti, (new Date()).getTime() - ti);
		if (diff > this.nconf.get('statsMaxAge')) {
			//console.log("Cleaning old stats...");
			if (last == null) {
				last = y;
				//if (last > -1) this.managerStats.timeindexes.splice(0, last);
				//console.log("Last = " + last);
			}
			//delete this.managerStats[ti];
		} else {
			//console.log("Keeping " + ti + " 'cause diff = " + diff);
		}
	}
	if (last > -1) {
		for (var y = 0; y < last; y++) {
			var ti = this.managerStats.timeindexes[0];
			this.managerStats.timeindexes.splice(0, 1);
			delete this.managerStats[ti];
			//console.log("Deleting " + ti);
		}
	}
	last = null;
};

myClass.prototype.saveStatsToWorker = function(pid, msg) {
	var w = this.findWorkerByPid(pid);
	if (!w) {
		console.log("Discard");
		return;
	}
	if (!w.stats) {
		w.stats = {};
	}
	w.stats.memory = msg.memory;
	w.stats.cpu = msg.cpu;
	if (this.nconf.get('watchClustersMemory') == true) {
		if (w.stats.memory.rss > this.nconf.get("workersRamKillLimit")) {
			if (!w.warned) {
				this.warnWorkerForMemoryUsage(pid);
				this.addEvent('system', "Worker RAM usage warning", "Worker with pid " + pid + " warned for RAM usage");
			} else {
				this.killWorkerForMemoryUsage(pid);
			}
		} else if (w.stats.memory.rss > this.nconf.get("workersRamWarnLimit")) {
			if (!w.warned || w.lastwarning > 0 && (new Date()).getTime() - w.lastwarning > 10000) {
				this.warnWorkerForMemoryUsage(pid);
				this.addEvent('system', "Worker RAM usage warning", "Worker with pid " + pid + " warned for RAM usage");
			}
			
		} else {
			w.warned = false;
		}
	}
};

module.exports = myClass;

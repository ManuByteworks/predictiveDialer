var myClass = function() {};
var cluster = require('cluster');


// Some workers utils
myClass.prototype.workersSorter = function(a, b) {
  if (a.starttime < b.starttime)
     return -1;
  if (a.starttime > b.starttime)
    return 1;
  return 0;
};

myClass.prototype.findWorkerByPid = function(pid) {
	for (var i = 0; i < this.workers.length; i++) {
		if (this.workers[i].pid == pid) {
			return this.workers[i];
		}
	}
	return null;
};

myClass.prototype.findWorkerIndexByPid = function(pid) {
	for (var i = 0; i < this.workers.length; i++) {
		if (this.workers[i].pid == pid) {
			return i;
		}
	}
	return null;
};

// Workers start/restart/kill

myClass.prototype.addWorker = function() {
	var w = cluster.fork();
	w.on('message', this.workerMessage.bind(this));
					
	this.workers.push({
		pid: w.process.pid, 
		process: w.process, 
		starttime: (new Date()).getTime(), 
		worker: w, 
		autorestart: true,
		killafter: this.nconf.get('restartAfterTimeLimit') ? this.getRandomTime(this.nconf.get('workersTimeLimit')) : 0
	});
	
	this.addEvent('system','Worker Start','New worker started (pid: ' + w.process.pid + ')');
};

myClass.prototype.restartWorker = function(pid) {
	var w = this.findWorkerByPid(pid);
	if (!w) {
		console.log("Unable to find worker with pid = " + pid);
		return;
	}
	this.addEvent('system','Worker Restart','Restarting worker with pid = ' + w.process.pid + '');
	w.autorestart = true;
	this.sendMessageToWorker(w, { cmd: 'CMON-SHUTDOWN' });
	
};

myClass.prototype.killWorker = function(pid) {
	var w = this.findWorkerByPid(pid);
	if (!w) {
		console.log("Unable to find worker with pid = " + pid);
		return;
	}
	this.addEvent('system','Worker Kill','Killing worker with pid = ' + w.process.pid + '');
	w.autorestart = false;
	this.sendMessageToWorker(w, { cmd: 'CMON-SHUTDOWN' });
};




//Helper for old workers...

myClass.prototype.checkOldWorkers = function() {
	if (this.nconf.get('restartAfterTimeLimit') == true && this.workers && this.workers.length) {
		now = (new Date()).getTime();
		for (var i = 0; i < this.workers.length; i++) {
			if (this.workers[i].killafter < now) {
				this.restartWorker(this.workers[i].pid);
			}
		}
	}
};

//Workers memory watch

myClass.prototype.killWorkerForMemoryUsage = function(pid) {
	console.log("killWorkerForMemoryUsage is now deprecated, please us restartWorker");
	this.restartWorker(pid);
};

myClass.prototype.warnWorkerForMemoryUsage = function(pid, msg) {
	var w = this.findWorkerByPid(pid);
	this.sendMessageToWorker(w, { cmd: 'CMON-MEMORYWARNING' });
	console.log("Warned worker " + pid + " for memory usage");
	w.warned = true;
	w.lastwarning = new Date().getTime();
	
};

//Handle worker's exit

myClass.prototype.workerDied = function(worker, code, signal) {
	var w = this.findWorkerByPid(worker.process.pid);
	if (!w) {
		console.log("Unable to find dead worker with pid " + worker.process.pid);
		this.addEvent('system','Error',"Unable to find dead worker with pid " + worker.process.pid);
		return;
	}
	var idx = this.findWorkerIndexByPid(worker.process.pid);
	if (idx > -1) {
		console.log("Removing IDX = " + idx);
		console.log("Current workers length = " + this.workers.length);
		this.workers.splice(idx,1);
		console.log("Current workers length = " + this.workers.length);
	}
	
	if (w.autorestart) {
		this.addWorker();
	} else {
		console.log("Worker died for ever");
	}
};

//Send/Receive messages to/from workers

myClass.prototype.workerMessage = function() {
	var msg = arguments[0];
	var pid = msg.pid;
	var worker = this.findWorkerByPid(pid);
	if (!worker) {
		console.log("Got a message from worker with pid " + pid + ", but it's unknown to master");
		return false;
	}
	if (msg.cmd) {
		switch(msg.cmd) {
			
			case "CMON-READY":
				this.addEvent('system','Worker ready','Worker ready (pid: ' + pid + ')');
				this.sendConfToWorker(worker);
			break;
						
			case "CMON-SERVERUP":
				
			break;
			
			case "CMON-SERVERDOWN":
			
			break;
			
			case "CMON-WEBSTATS":
			
			break;
			
			case "CMON-CUSTOMSTATS":
				
			break;
			
			case "CMON-WORKERSTATS":
				//console.log("Got worker stats");
				//console.log(pid, msg.memory, msg.cpu);
				this.saveStatsToWorker(pid, msg);
			break;
			
		}
	}
};

myClass.prototype.sendMessageToWorker = function(worker, msg) {
	worker.worker.send( msg );
};

//Send configuration to worker

myClass.prototype.sendConfToWorker = function(worker) {
	worker.worker.send({ cmd: 'CMON-CONF', configuration: this.nconf.get() });
};

module.exports = myClass;
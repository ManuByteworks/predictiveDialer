var util = require('util');
var cluster = require('cluster');
var util = require('util');
var os = require('os');
var file = fs = require('fs');
var nconf = require('nconf');

var CmonManager = function(logger) {
	this.logger = logger;
};

var CmonManagerInit = require("./CmonManager_init");
var CmonManagerStartup = require("./CmonManager_startup");
var CmonManagerHelpers = require("./CmonManager_helpers");
var CmonManagerStats = require("./CmonManager_stats");
var CmonManagerWorkersHelpers = require("./CmonManager_workersHelpers");
var CmonManagerUserInit = require("./CmonManager_userinit");

var myclasses = [];

myclasses.push(CmonManagerInit);
myclasses.push(CmonManagerStartup);
myclasses.push(CmonManagerHelpers);
myclasses.push(CmonManagerStats);
myclasses.push(CmonManagerWorkersHelpers);
myclasses.push(CmonManagerUserInit);

for (var i = 0; i < myclasses.length; i++) {
	var c = myclasses[i];
	for (var fn in c.prototype) {
		if (c.prototype.hasOwnProperty(fn)) {
			CmonManager.prototype[fn] = c.prototype[fn];
		}
	}
}

myclasses = null;


module.exports = CmonManager;
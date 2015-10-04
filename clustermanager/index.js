function CmonStart(logger) {
	var cluster = require('cluster'),
	CmonManager = require('./CmonManager'),
	app,
	manager,
	gracefulExit =
	require('express-graceful-exit'),
	vhost = require('vhost');
	//
	if (cluster.isMaster) {
		cluster.setupMaster({silent: false});
		manager = new CmonManager(logger)	;
		app = manager.startup();

		var util = require('util');
		if (util.isError(app)) {
			console.log('Configuration error: ' + error.message + ', check your configuration file.');
			return false;
		}

		return null;

	} else {
		return new (require('./CmonWorker'))();		
	}
}
module.exports = CmonStart;
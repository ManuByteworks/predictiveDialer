var Db = require('mongodb').Db,
    MongoClient = require('mongodb').MongoClient,
    Server = require('mongodb').Server,
    ReplSetServers = require('mongodb').ReplSetServers,
    ObjectId = ObjectID = require('mongodb').ObjectID,
    Binary = require('mongodb').Binary,
    GridStore = require('mongodb').GridStore,
    Grid = require('mongodb').Grid,
    Code = require('mongodb').Code,
    assert = require('assert');
    
var checkLoggedIn = function(req, callback) {
	//req can be EXPRESS req or SOCKET.IO socket
	if (!req.session || !req.session.authorized || !req.session._id) {
		callback(true);
	} else {
		req.mongodb.collection("operators").findOne({
			_id: ObjectId(req.session._id)
		}, function(err, operator) {
			if (err) {
				callback(err);
			} else {
				if (!operator) {
					callback(true);
				} else {
					callback(false, operator);
				}
			}
		});
	}
};

//Send reply to client based on framework debugginess
var sendReply = function(req, res, reply, callback) {
	if (!SIMULATEERRORSANDDELAY) {
		if (!req.connectionClosed) {
			res.send(reply);
			if (callback) {
				callback(false);
			}
		} else {
			if (callback) {
				callback(true);
			}
		}
	} else {
		if (SIMULATEERRORS && getRandomArbitrary(0,1) <= SIMULATEERRORSRATE) {
			if (!req.connectionClosed) {
				res.status(500).send("This is an error message to randomly simulate framework failure");
				req.log.verbose(req.log.log_prefix, "Simulating ERROR");
				if (callback) {
					callback(false);
				}
			} else {
				if (callback) {
					callback(true);
				}
			}
			
		} else if (SIMULATEDELAYS) {
			var delay = getRandomInt(SIMULATEDELAYMIN,SIMULATEDELAYMAX);
			req.log.verbose(req.log.log_prefix, "Simulating DELAY of " + delay + "ms");
			setTimeout(function() {
				if (!req.connectionClosed) {
					res.send(reply);
					if (callback) {
						callback(false);
					}
				} else {
					if (callback) {
						callback(true);
					}
				}
			}, delay);
		} else {
			if (!req.connectionClosed) {
				res.send(reply);
				if (callback) {
					callback(false);
				}
			} else {
				if (callback) {
					callback(true);
				}
			}
		}
	}
};

var sendRendering = function(req, res, template, data, callback) {
	if (!SIMULATEERRORSANDDELAY) {
		if (!req.connectionClosed) {
			res.render(req.viewprefix+template, data);
			if (callback) {
				callback(false);
			}
		} else {
			if (callback) {
				callback(true);
			}
		}
	} else {
		if (SIMULATEERRORS && getRandomArbitrary(0,1) <= SIMULATEERRORSRATE) {
			if (!req.connectionClosed) {
				res.status(500).send("This is an error message to randomly simulate framework failure");
				req.log.verbose(req.log.log_prefix, "Simulating ERROR");
				if (callback) {
					callback(false);
				}
			} else {
				if (callback) {
					callback(true);
				}
			}
			
		} else if (SIMULATEDELAYS) {
			var delay = getRandomInt(SIMULATEDELAYMIN,SIMULATEDELAYMAX);
			req.log.verbose(req.log.log_prefix, "Simulating ERROR");
			setTimeout(function() {
				if (!req.connectionClosed) {
					res.render(req.viewprefix+template, data);
					if (callback) {
						callback(false);
					}
				} else {
					if (callback) {
						callback(true);
					}
				}
			}, delay);
		} else {
			if (!req.connectionClosed) {
				res.render(req.viewprefix+template, data);
				if (callback) {
					callback(false);
				}
			} else {
				if (callback) {
					callback(true);
				}
			}
		}
	}
};


var getRandomArbitrary = function (min, max) {
    return Math.random() * (max - min) + min;
};

var getRandomInt = function (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};
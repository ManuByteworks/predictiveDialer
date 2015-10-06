var Db = require('mongodb').Db,
    MongoClient = require('mongodb').MongoClient,
    Server = require('mongodb').Server,
    ReplSetServers = require('mongodb').ReplSetServers,
    ObjectId = ObjectID = require('mongodb').ObjectID,
    Binary = require('mongodb').Binary,
    GridStore = require('mongodb').GridStore,
    Grid = require('mongodb').Grid,
    Code = require('mongodb').Code,
    assert = require('assert'),
    async = require('async'),
    path = require('path');

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
        if (SIMULATEERRORS && getRandomArbitrary(0, 1) <= SIMULATEERRORSRATE) {
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
            var delay = getRandomInt(SIMULATEDELAYMIN, SIMULATEDELAYMAX);
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
            res.render(req.viewprefix + template, data);
            if (callback) {
                callback(false);
            }
        } else {
            if (callback) {
                callback(true);
            }
        }
    } else {
        if (SIMULATEERRORS && getRandomArbitrary(0, 1) <= SIMULATEERRORSRATE) {
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
            var delay = getRandomInt(SIMULATEDELAYMIN, SIMULATEDELAYMAX);
            req.log.verbose(req.log.log_prefix, "Simulating ERROR");
            setTimeout(function() {
                if (!req.connectionClosed) {
                    res.render(req.viewprefix + template, data);
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
                res.render(req.viewprefix + template, data);
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


var getRandomArbitrary = function(min, max) {
    return Math.random() * (max - min) + min;
};

var getRandomInt = function(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

var findOperatorByUsernameAndPassword = function(req, username, password, callback) {
    req.log.verbose(req.log_prefix, "Searching operator by username " + username + " and password " + password);
    req.mongodb.collection("operators").findOne({
        username: new RegExp("^" + username + "$", "i"),
        password: new RegExp("^" + password + "$", "i")
    }, function(err, operator) {
        if (err || !operator) {
            callback(true);
        } else {
            callback(false, operator);
        }
    });
};

var findOperatorById = function(req, id, callback) {
    req.log.verbose(req.log_prefix, "Searching operator by id " + id);
    if (!id || !(id.length == 16 || id.length == 24)) {
        callback(true, null);
    } else {
        req.mongodb.collection("operators").findOne({
            _id: ObjectId(id)
        }, function(err, operator) {
            if (err || !operator) {
                callback(true);
            } else {
                callback(false, operator);
            }
        });
    };
};

function shuffle(o) {
    for (var j, x, i = o.length; i; j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x);
    return o;
};

function findClientsSocket(io, roomId, namespace) {
    var res = [];
    var ns = io.of(namespace || "/"); // the default namespace is "/"

    if (ns) {
        for (var id in ns.connected) {
            if (roomId) {
                var index = ns.connected[id].rooms.indexOf(roomId);
                if (index !== -1) {
                    res.push(ns.connected[id]);
                }
            } else {
                res.push(ns.connected[id]);
            }
        }
    }
    return res;
};

var getMainData = function() {
    return {
        "VERSION": VERSION,
        "AUTHOR": AUTHOR,
        "AUTHOR_URL": AUTHOR_URL,
        "AUTHOR_SHORT": AUTHOR_SHORT,
        "PLEASE_LOGIN": PLEASE_LOGIN,
        "PRODUCT_NAME": PRODUCT_NAME,
        "CUSTOMER": CUSTOMER,
        "LICENCE": LICENCE,
        "LOGIN": LOGIN,
        "BACKGROUNDS": BACKGROUNDS,
        "moment": require("moment"),
        "DEBUG": DEBUG,
        "SIMULATEERRORSANDDELAY": SIMULATEERRORSANDDELAY,
        "INTERNALNUMBER": INTERNALNUMBER,
        getRandomInt: getRandomInt,
        getRandomArbitrary: getRandomArbitrary
    };
};

var setWebStatusForOperator = function(req, id, status, callback) {
    req.mongodb.collection("operators").update({
        _id: ObjectId(id)
    }, {
        $set: {
            webstatus: status
        }
    }, {
        multi: false
    }, function(err) {
        callback(err);
    });
};

var setPropsForOperator = function(req, id, props, callback) {
    req.mongodb.collection("operators").update({
        _id: ObjectId(id)
    }, {
        $set: props
    }, {
        multi: false
    }, function(err) {
        callback(err);
    });
};
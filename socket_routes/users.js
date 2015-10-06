var fs = require('fs');
// file is included here:
eval(fs.readFileSync('libs/globals.js') + '');
eval(fs.readFileSync('libs/library.js') + '');

var connected = function(socket, io) {
    checkLoggedIn(socket, function(err, operator) {

        var address = socket.handshake.address;
        if (err || !operator) {
            socket.log.warn(socket.log_prefix, "Socket connected without a valid session. [%s]", socket.handshake.address);
            socket.emit("logout");
            socket.disconnect();
        } else {
            socket.log.silly(socket.log_prefix, "Configuring socket routes");
            async.series([
                function(callback) { //Set operator's webstatus to WEB_STATUS_CONNECTED
                    socket.log.silly(socket.log_prefix, "Configuring socket routes - step 1");
                    setWebStatusForOperator(socket, operator._id, WEB_STATUS_CONNECTED, callback);
                },
                function(callback) {
                    setPropsForOperator(socket, operator._id, {
                        lastIp: address,
                        lastLogin: new Date()
                    }, callback);
                },
                function(callback) { //Join operator's rooms
                    socket.log.silly(socket.log_prefix, "Configuring socket routes - step 2");
                    //Start of operator validated
                    //Log socket connection
                    socket.log.info(socket.log_prefix, "Operator " + operator._id + " (" + operator.username + ") " + "websocket connected on pid " + process.pid + " from ip %s ", address);
                    //Join operator to _id room
                    socket.join(operator._id);
                    //Join operator to _id room
                    socket.join("#operators");
                    //Join operator to every group-room
                    if (operator.groups) {
                        for (var i = 0; i < operator.groups.length; i++) {
                            socket.join(operator.groups[i]);
                        }
                    }
                    callback();
                },
                function(callback) { // Emit operator's status and other messages
                    socket.log.silly(socket.log_prefix, "Configuring socket routes - step 3");
                    //Notify "#alloperators" about the join
                    io.to("#alloperators").emit("join", operator);
                    //Alway send operator status (no need to refresh operator here, it's very close to the beginnning)
                    socket.emit('status', operator);
                    callback();
                },
                function(callback) { // Listen to "photostream" event
                    socket.log.silly(socket.log_prefix, "Configuring socket routes - step 4");
                    //Look for photostream and send to client
                    socket.on('photostream', function() {

                        findOperatorById(socket, socket.session._id, function(err, op) {
                            if (err) {
                                //Something really bad happening here!
                                //but don't disconnect. This is not crucial!
                                socket.log.error(socket.log_prefix, "Error while looking for operator %j", err);
                                return;
                            }

                            if (!op) {
                                //Something really bad happening here!
                                //This is crucial. Disconnect client.
                                socket.log.error(socket.log_prefix, "No operator by id, but no error. Disconnecting [%s]", socket.handshake.address);
                                socket.disconnect();
                                return;
                            }

                            //Log request
                            socket.log.verbose(socket.log_prefix, "Operator " + operator._id + " is looking for photostream");

                            operator = op;
                            async.series([
                                function(callback) { //Search files for each group							
                                    var backgrounds = [];
                                    if (!operator.groups) {
                                        callback(null, backgrounds);
                                        return;
                                    }

                                    var mainPath = "./static/group-backgrounds/";
                                    var fileType = '.jpg';

                                    async.map(operator.groups, function(group, callback) {
                                        fs.readdir(mainPath + group, function(err, files) {
                                            if (err) {
                                                callback(null);
                                                return;
                                            }
                                            async.map(files, function(file, callback) {
                                                if (path.extname(file) === fileType) {
                                                    backgrounds.push({
                                                        f: path.basename(file, fileType),
                                                        p: 10,
                                                        t: 'group'
                                                    });
                                                }
                                                callback();
                                            }, function() {
                                                callback(null, backgrounds);
                                            });
                                        });
                                    }, function(err) {
                                        callback(null, backgrounds);
                                    });
                                },

                                function(callback) { //Search files for each group
                                    var mainPath = "./static/flickr/"; //directory path
                                    var backgrounds = [];
                                    fs.readdir(mainPath, function(err, files) {
                                        if (err) {
                                            callback(null, backgrounds);
                                            return;
                                        }

                                        async.map(files, function(tag, callback) {

                                            fs.stat(mainPath + tag, function(err, stats) {
                                                if (err) {
                                                    callback(null);
                                                    return;
                                                }
                                                if (stats.isDirectory()) {
                                                    fs.readdir(mainPath + tag + "/", function(err, files) {
                                                        async.map(files, function(file, callback) {
                                                            if (path.extname(file) === fileType) {
                                                                backgrounds.push({
                                                                    f: path.basename(file, fileType),
                                                                    p: 5,
                                                                    t: tag
                                                                });
                                                            }
                                                            callback();
                                                        }, function() {
                                                            callback(null, backgrounds);
                                                        });
                                                    }, function() {
                                                        callback(null, backgrounds);
                                                    });
                                                } else {
                                                    callback(null, backgrounds);
                                                }
                                            });

                                        }, function() {
                                            callback(null, backgrounds);
                                        });
                                    });
                                }
                            ], function(err, results) {
                                //Merge and shuffle results
                                var backgrounds = shuffle(results[0].concat(results[1]));
                                io.to(operator._id).emit('photostream', backgrounds);
                            });
                        });
                    });
                    callback();
                },
                function(callback) { // Listen to "ping" event
                    socket.log.silly(socket.log_prefix, "Configuring socket routes - step 5");
                    //Send pong
                    socket.on('ping', function() {
                        setPropsForOperator(socket, operator._id, {
                            lastPing: new Date()
                        }, function(err) {
                            if (err) {
                                socket.log.error(socket.log_prefix, "Error while setting property for operator %s %j", operator._id, err);
                            } else {
                                socket.emit('pong', new Date());
                            }
                        });

                    });
                    callback();
                },
                function(callback) { // Listen to operator's disconnect
                    //Handle client disconnect
                    socket.log.silly(socket.log_prefix, "Configuring socket routes - step 6");
                    socket.on('disconnect', function() {
                        socket.log.info(socket.log_prefix, "Socket disconnected %s", socket.session._id);
                        findOperatorById(socket, socket.session._id, function(err, op) {
                            if (err) {
                                //Something really bad happening here!
                                //but don't disconnect. This is not crucial!
                                socket.log.error(socket.log_prefix, "Error while looking for operator %j", err);
                                return;
                            }

                            if (!op) {
                                //Something really bad happening here!
                                //This is crucial. Disconnect client.
                                socket.log.error(socket.log_prefix, "No operator by id, but no error. Disconnecting [%s]", socket.handshake.address);
                                socket.disconnect();
                                return;
                            }

                            operator = op;
                            setWebStatusForOperator(socket, operator._id, WEB_STATUS_DISCONNECTED, function(err) {
                                if (err) {
                                    socket.log.error(socket.log_prefix, "Error while disconnecting operator %s %j", operator._id, err);
                                } else {
                                    delete socket.session.authorized;
                                    delete socket.session._id;
                                    socket.session.save();
                                    //console.log("DISCONNECT", socket.session);
                                }
                            });
                        });
                    });
                    callback();
                }
            ], function(err) {
                if (err) {
                    setWebStatusForOperator(socket, operator._id, WEB_STATUS_DISCONNECTED, function(err) {
                        if (err) {
                            socket.log.error(socket.log_prefix, "Error while disconnecting operator %s %j", operator._id, err);
                        } else {
                            delete socket.session.authorized;
                            delete socket.session._id;
                            socket.session.save(function() {
                                socket.log.error(socket.log_prefix, "Socket route operation endend with an error. %j", err);
                                socket.emit("logout", "Server error");
                                socket.disconnect();
                            });
                        }
                    });

                }
            });
        }
    });
};

module.exports = {
    "connected": connected
};
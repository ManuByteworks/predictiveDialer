var log = require('npmlog');
log.level = 'verbose';

var CmonStarter = require('./clustermanager');
var worker = CmonStarter(log);


var nconf = require('nconf');
nconf.file({
    file: "conf/config.json"
});

eval(fs.readFileSync('libs/globals.js') + '');
eval(fs.readFileSync('libs/library.js') + '');

if (worker) {
    //We're in a slave process (the cluster)
    worker.on('ready', function() {
        log.info("Clients Server", "Slave process started and ready with pid: " + process.pid);
        var port = 5000;
        var app = worker.getApp();

        var bodyParser = require('body-parser')
        var session = require('express-session');
        var iosession = require('socket.io-express-session');
        var RedisStore = require('connect-redis')(session);
        var redis = require('redis');
        var socketIOSession = require("socket.io-express-session");
        var ECT = require('ect');
        var ectRenderer = ECT({
            watch: true,
            cache: true,
            root: __dirname + '/views',
            ext: '.ect'
        });
        var redisClient = redis.createClient();
        var mongodb = null;
        var morgan = require('morgan');

        //Use morgan logger!
        var logDirectory = __dirname + '/logs';
        fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory)

        // create a rotating write stream
        var FileStreamRotator = require('file-stream-rotator')
        var accessLogStream = FileStreamRotator.getStream({
            filename: logDirectory + '/access-%DATE%.log',
            frequency: 'daily',
            verbose: false,
            date_format: 'YYYYMMDD'
        })
        app.use(morgan('dev', {
            stream: accessLogStream
        }));

        //Build session store
        var sessionStore = new RedisStore({
            "client": redisClient,
            "host": "localhost",
            "port": 6379
        });

        //Session settings are compatible with EXPRESS and SOCKET.IO
        var sessionSettings = {
            "store": sessionStore,
            "secret": "your secret",
            "unset": "destroy",
            "cookie": {
                "path": '/',
                "httpOnly": true,
                "secure": false,
                "maxAge": null
            },
            "resave": true,
            "saveUninitialized": true
        };

        //Set session store for EXPRESS
        var sess = session(sessionSettings);
        app.use(sess);

        //Use body parser for POSTs
        app.use(bodyParser.json()); // to support JSON-encoded bodies
        app.use(bodyParser.urlencoded({ // to support URL-encoded bodies
            extended: true
        }));

        //Prepare session store for SOCKET.IO and set
        //var socketSession = socketIOSession(sessionSettings);
        //app.io.use(socketSession.parser);

        app.io.use(iosession(sess));

        //Setup redis adapter to allow different clusters to communicate with each other
        var redis = require('socket.io-redis');
        app.io.adapter(redis({
            host: 'localhost',
            port: 6379
        }));

        //Setup EXPRESS to use ECT renderer
        app.engine('ect', ectRenderer.render);
        app.set('view engine', 'ect');
        app.set('views', __dirname + '/views');


        //Setup EXPRESS variables
        app.use(function(req, res, next) {
            req.isMobile = false;
            req.viewprefix = 'desktop/';
            req.mongodb = mongodb;
            req.log = log;
            req.log_prefix = "Clients HTTP Server";
            req.connectionClosed = false;
            req.on("close", function() {
                // request closed unexpectedly
                req.connectionClosed = true;
            });
            req.worker = worker;
            next();
        });

        //Setup EXPRESS to use mongo (one mongo client per process)
        app.use(function(req, res, next) {
            if (!req.mongodb) {
                //Make new mongodb connection
                var MongoClient = require('mongodb').MongoClient;
                MongoClient.connect("mongodb://" + nconf.get('mongoHost') + ":" + nconf.get('mongoPort') + "/" + nconf.get('mongoDbname'), function(err, db) {
                    if (err) {
                        console.log("Unable to connect to mongodb");
                        console.log(err);
                        res.status(500).send("Unable to connect to local database");
                        process.exit();
                        return;
                    } else {
                        log.info("Clients HTTP Server", "DB connected");
                        req.mongodb = mongodb = db;
                        next();
                    }
                });
            } else {
                //Check if mongo is still there
                req.mongodb.command({
                    ping: 1
                }, {
                    maxTimeMS: 50
                }, function(err, response) {
                    if (!err && response.ok) {
                        log.silly("Clients HTTP Server", "DB is working fine for pid " + process.pid);
                        next();
                    } else {
                        res.status(500).send("Unable to connect to local database");
                        process.exit();
                    }
                });
            }
        });

        //Setup SOCKET.IO variables
        app.io.use(function(socket, next) {
            socket.mongodb = mongodb;
            socket.log = log;
            socket.log_prefix = "Clients IO Server";
            socket.session = socket.handshake.session;
            socket.worker = worker;
            next()
        });

        app.io.use(function(socket, next) {
            if (!socket.mongodb) {
                //Make new mongodb connection
                var MongoClient = require('mongodb').MongoClient;
                MongoClient.connect("mongodb://" + nconf.get('mongoHost') + ":" + nconf.get('mongoPort') + "/" + nconf.get('mongoDbname'), function(err, db) {
                    if (err) {
                        console.log("Unable to connect to mongodb");
                        console.log(err);
                        socket.emit("error", "Unable to connect to local database");
                        socket.close();
                        process.exit();
                        return;
                    } else {
                        log.info("Clients IO Server", "DB connected");
                        socket.mongodb = mongodb = db;
                        next();
                    }
                });
            } else {
                //Check if mongo is still there
                socket.mongodb.command({
                    ping: 1
                }, {
                    maxTimeMS: 50
                }, function(err, response) {
                    if (!err && response.ok) {
                        log.silly("Clients IO Server", "DB is working fine for pid " + process.pid);
                        next();
                    } else {
                        socket.emit("error", "Lost connection to local database");
                        socket.close();
                        process.exit();
                    }
                });
            }
        });

        var usersSocketRouter = require('./socket_routes/users.js');

        app.io.on('connection', function(socket) {
            usersSocketRouter.connected(socket, app.io);
        });

        //Allow EXPRESS to send static files from 'static' directory
        app.use(worker.getExpress().static('static'));

        var usersRouter = require('./routes/users');
        app.use("/", usersRouter);

        //Finally listen to port
        worker.listen(port);

        worker.onMessage = function(msg) {
            switch (msg.cmd) {
                case "SOCKET-DISCONNECT-USERID":
                    if (msg.userid) {
                        var allSockets = findClientsSocket(app.io);
                        async.map(allSockets, function(socket, callback) {
                            if (socket.session._id == msg.userid) {
                                delete socket.session._id;
                                delete socket.session.authorized;
                                socket.session.save(function() {
                                    socket.emit("logout");
                                    socket.disconnect();
                                    log.info("Clients IO Server", "Disconnecting user %s on session %s", msg.userid, socket.session.id);
                                    callback();
                                });

                            } else {
                                //console.log("No match for ", socket.session.id, " and ", msg.userid);
                                callback();
                            }
                        }, function() {

                        });
                    }
                    break;
                case "SOCKET-DISCONNECT-USERID-NOTSESSION":
                    if (msg.userid && msg.sessionid) {
                        var allSockets = findClientsSocket(app.io);
                        async.map(allSockets, function(socket, callback) {
                            if (socket.session._id == msg.userid && socket.session.id !== msg.sessionid) {
                                delete socket.session._id;
                                delete socket.session.authorized;
                                socket.session.save(function() {
                                    socket.emit("logout");
                                    socket.disconnect();
                                    log.info("Clients IO Server", "Disconnecting user %s on session %s", msg.userid, socket.session.id);
                                    callback();
                                });

                            } else {
                                //console.log("No match for ", socket.session.id, " and ", msg.userid);
                                callback();
                            }

                        }, function() {

                        });
                    }
                    break;
            }
        };

    });

} else {
    // This is the master process starting up
    log.level = 'silly'
    log.verbose("Clients Server", "Master process started");
}
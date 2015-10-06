var express = require('express');
var router = express.Router();
var fs = require('fs');

// file is included here:
eval(fs.readFileSync('libs/globals.js') + '');
eval(fs.readFileSync('libs/library.js') + '');

// define the home page route
router.get('/', function(req, res) {
    checkLoggedIn(req, function(err, operator) {
        if (err) {
            res.redirect("/login");
        } else {
            req.session.operator = operator;
            res.redirect("/status");
        }
    });
});
// define the about route
router.get('/login', function(req, res) {
    checkLoggedIn(req, function(err, operator) {
        if (err) {
            var data = getMainData();
            sendRendering(req, res, "login", data, function(err) {
                if (err) {
                    req.log.warn(req.log_prefix, "Client disconnected before our reply!");
                }
            });
        } else {
            res.redirect("/status");
        }
    });
});

router.post('/login', function(req, res) {
    checkLoggedIn(req, function(err, operator) {
        if (err) {
            findOperatorByUsernameAndPassword(req, req.body.username, req.body.password, function(err, operator) {
                if (!err && operator) {
                    req.worker.sendMessageToMaster('CMON-BROADCAST', {
                        msg: {
                            cmd: 'SOCKET-DISCONNECT-USERID-NOTSESSION',
                            userid: operator._id,
                            sessionid: req.session.id
                        }
                    });
                    req.session.authorized = true;
                    req.session._id = operator._id;
                    res.redirect("/status");
                } else {
                    var data = getMainData();
                    data.error = "Username o password errati";
                    data.username = req.body.username;
                    sendRendering(req, res, "login", data, function(err) {
                        if (err) {
                            req.log.warn(req.log_prefix, "Client disconnected before our reply!");
                        }
                    });
                }
            });

        } else {
            res.redirect("/status");
        }
    });
});

router.get('/status', function(req, res) {
    //console.log("STATUS", req.session);

    checkLoggedIn(req, function(err, operator) {
        if (err || !operator) {
            req.log.warn(req.log_prefix, "Client accessing /status without a valid session. [%s]", req.connection.remoteAddress);
            res.redirect("/login");
            return;
        }
        var data = getMainData();
        data.operator = operator;
        sendRendering(req, res, "status", data, function(err) {
            if (err) {
                req.log.warn(req.log_prefix, "Client disconnected before our reply!");
            }
        });
    });
});

router.get('/logout', function(req, res) {
    req.session = null;
    res.redirect('/login');
});

module.exports = router;
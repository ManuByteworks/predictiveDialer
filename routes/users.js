var express = require('express');
var router = express.Router();
var fs = require('fs');

// file is included here:
eval(fs.readFileSync('libs/globals.js')+'');
eval(fs.readFileSync('libs/library.js')+'');

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
  sendReply(req, res, "HELLO", function(err) {
  	if (err) {
  		req.log.warn(req.log_prefix, "Client disconnected before our reply!");
  	}
  });
});

module.exports = router;
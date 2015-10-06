var fs = require('fs');
var path = require('path');

var VERSION = "2.0.0";
var AUTHOR = "Byteworks Sistemi s.r.l.";
var AUTHOR_SHORT = "BWS s.r.l.";
var AUTHOR_URL = "http://www.byworks.com";

var PRODUCT_NAME = "Centralino predictive";
var CUSTOMER = "Serfin 97 s.r.l.";
var LICENCE = "No limit demo";

var LOGIN = "Accedi";
var PLEASE_LOGIN = "Accedi al sistema predictive";

var INTERNALNUMBER = 210;

var DEBUG = true;
var SIMULATEERRORSANDDELAY = false;
var SIMULATEERRORS = true;
var SIMULATEDELAYS = true;
var SIMULATEDELAYMIN = 0;
var SIMULATEDELAYMAX = 5000;
var SIMULATEERRORSRATE = 1 / 50;



var dirPath = "./static/backgrounds/"; //directory path
var fileType = '.jpg'; //file extension
var BACKGROUNDS = [];
fs.readdir(dirPath, function(err, list) {
    if (err) throw err;
    for (var i = 0; i < list.length; i++) {
        if (path.extname(list[i]) === fileType) {
            BACKGROUNDS.push(list[i]); //store the file name into the array files
        }
    }
});

var PHONE_STATUS_OFFLINE = 0;
var PHONE_STATUS_READY = 30;
var PHONE_STATUS_INCALL = 40;
var PHONE_STATUS_REST = 50;

var WEB_STATUS_DISCONNECTED = 0;
var WEB_STATUS_CONNECTED = 10;
var WEB_STATUS_EDITING = 20;
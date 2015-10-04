var util = require('util');
var myClass = function() {};
var colors = require("colors");
var async = require('async');
var initialTimeout = 1 * 60 * 1000;
var subsequentTimeout = 25 * 60 * 1000;

myClass.prototype.userInit = function() {
	var events = require('events');
	this.userEvent = new events.EventEmitter();
	this.logger.info("CmonManager User Init", "Starting user script.");
};
module.exports = myClass;
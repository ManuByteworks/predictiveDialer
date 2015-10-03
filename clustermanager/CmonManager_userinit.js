var util = require('util');
var myClass = function() {};
var colors = require("colors");
var async = require('async');
var initialTimeout = 1 * 60 * 1000;
var subsequentTimeout = 25 * 60 * 1000;

myClass.prototype.userInit = function() {
	var events = require('events');
	this.userEvent = new events.EventEmitter();
	//this.userEvent.on('contentupdated', );
	var MR = function() {
		var Db = require('mongodb').Db,
		MongoClient = require('mongodb').MongoClient,
		Server = require('mongodb').Server,
		ReplSetServers = require('mongodb').ReplSetServers,
		ObjectID = require('mongodb').ObjectID,
		Binary = require('mongodb').Binary,
		GridStore = require('mongodb').GridStore,
		Grid = require('mongodb').Grid,
		Code = require('mongodb').Code,
		assert = require('assert');

		var MongoClient = require('mongodb').MongoClient;
		var dbhost = this.nconf.get('mongoHost');
		var dbname = this.nconf.get('mongoDbname');
		var dbport = this.nconf.get('mongoPort');

		MongoClient.connect("mongodb://" + dbhost + ":" + dbport + "/" + dbname, function(err, db) {
			if (err) {
			} else {
				console.log("[POST-HOTNESS] Starting update".yellow);
				var start = new Date();
				
				
				db.collection("posts").mapReduce(function() {
					var today = new Date().getTime();
					var d = new Date(this.post_date).getTime();
					var diff = today - d;
					var days = Math.round(diff / (60 * 60 * 1000));
					var views = this.post_views;
					if (!views) {
						views = 0;
					}
					var hotness = views / ((days+2)^1.8)
					/*
					(P-1) / (T+2)^G
					P = points of an item (and -1 is to negate submitters vote)
					T = time since submission (in hours)
					G = Gravity, defaults to 1.8 in news.arc
					*/
					emit(this._id, { hotness: hotness });

				},
				function (key, values) {
					return values[0];
				}, {
					finalize : function Finalize(key, reduced) {
						return reduced;
					},
					out : { replace: "posts_popularity"  },
					query : { "post_type" : "post" },
					sort: { post_date: -1 }
				}, function(err, retval) {
					var end = new Date();
					if (err) {
						console.log(("[POST-HOTNESS] update failed" + " - Duration: " + (end.getTime() - start.getTime()) + "ms").red, err);
						setTimeout(MR.bind(this), 10 * 60 * 1000);
						db.close();
					} else {
						console.log(("[POST-HOTNESS] MapReduce completed" + " - Duration: " + (end.getTime() - start.getTime()) + "ms").yellow);
						db.collection("posts_popularity").find({}).toArray(function(err, results) {
							var finish = new Date();
							if (!err) {
								async.mapLimit(results, 100, function(res, callback) {
									db.collection("posts").update({
										_id: res._id
									}, {
										$set: {
											"hotness": res.value.hotness
										}
									}, function(err, cnt) {
										callback(err);
									});
										
								}, function(err, results) {
									if (err) {
										console.log(("[POST-HOTNESS] update failed on second step" + " - Duration: " + (finish.getTime() - end.getTime()) + "ms").red, err);
										setTimeout(MR.bind(this), subsequentTimeout);
										db.close();
									} else {
										console.log(("[POST-HOTNESS] update completed" + " - Duration: " + (finish.getTime() - end.getTime()) + "ms").green);
										setTimeout(MR.bind(this), subsequentTimeout);
										db.close();
									}
								}.bind(this));
							} else {
								console.log(("[POST-HOTNESS] update failed on first step" + " - Duration: " + (finish.getTime() - end.getTime()) + "ms").red, err);
								setTimeout(MR.bind(this), subsequentTimeout);
								db.close();
							}
						}.bind(this)); 
					}
					
				}.bind(this));
			}
		}.bind(this));
	};
	//MR.bind(this)();
	setTimeout(MR.bind(this), initialTimeout);
};
module.exports = myClass;
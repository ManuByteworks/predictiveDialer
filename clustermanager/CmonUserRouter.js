var express = require('express');
var bodyParser = require('body-parser');
var jsonParser = bodyParser.json({ type: 'application/json' });
var urlencodedParser = bodyParser.urlencoded({ extended: false });
var path = require('path');
var util = require('util');
var fs = require('fs');
var jade = require('jade');
var moment = require('moment');
var colors = require('colors');
var mysqldriver = require('mysql');
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

module.exports = function(manager) {
	
	var router = express.Router();
	if (manager.allowedUrls) {
		manager.allowedUrls.push('/user/postupdate/');
	}
	
	router.get('/singlepostupdate/:postid', function(req, res, next) {
		this.makeDb(function(err, mongodb) {
			if (err) {
				res.status(500).send('Unable to connect to local database');
			} else {
				mongodb.collection("options").findOne({}, function(err, options) {
					//if (options.remotePingHosts.indexOf(req.connection.remoteAddress) < 0 && false) {
					if (false) {
						res.status(404).send("Sorry, you're not allowed to see this page");
					} else {
						if (options.updateInProgress) {
							mongodb.collection("options").update({}, {
										$set: {
											recheckAfterUpdate: true
										}
							}, function(err, cnt) {
								console.log("Scheduling an update check after current update".yellow)
								res.status(200).send("Sorry, an update is already in progress. Queuing a check after current update.");
							});
							
						} else {
							
							var mysql = mysqldriver.createConnection({
								host     : options.remoteMysqlHost,
								user     : options.remoteMysqlUsername,
								password : options.remoteMysqlPassword,
								database : options.remoteMysqlDatabase
							});
							mysql.connect(function(err) {
								if (err) {
									console.log("Remote Database connection failed".red)
									res.send(500).send("Sorry, unable to connect to remote database");
								} else {
									mongodb.collection("options").update({}, {
										$set: {
											updateInProgress: true
										}
									}, function(err, cnt) {
										res.send("Fetching single content");
										this.checkUpdates(mongodb, mysql, options, req.params.postid);
									});
									
								}
							});
							
						}
					}
				});
			}
		});
	});
	
	router.get('/postupdate/', function(req, res, next) {
		this.makeDb(function(err, mongodb) {
			if (err) {
				res.status(500).send('Unable to connect to local database');
			} else {
				mongodb.collection("options").findOne({}, function(err, options) {
					//if (options.remotePingHosts.indexOf(req.connection.remoteAddress) < 0) {
					if (false) {
						res.status(404).send("Sorry, you're not allowed to see this page");
					} else {
						if (options.updateInProgress) {
							mongodb.collection("options").update({}, {
										$set: {
											recheckAfterUpdate: true
										}
							}, function(err, cnt) {
								console.log("Scheduling an update check after current update".yellow)
								res.status(200).send("Sorry, an update is already in progress. Queuing a check after current update.");
							});
							
						} else {
							
							var mysql = mysqldriver.createConnection({
								host     : options.remoteMysqlHost,
								user     : options.remoteMysqlUsername,
								password : options.remoteMysqlPassword,
								database : options.remoteMysqlDatabase
							});
							mysql.connect(function(err) {
								if (err) {
									console.log("Remote Database connection failed".red)
									res.send(500).send("Sorry, unable to connect to remote database");
								} else {
									mongodb.collection("options").update({}, {
										$set: {
											updateInProgress: true
										}
									}, function(err, cnt) {
										if (options.lastPostModifiedDate) {
											console.log("Starting partial update".yellow)
											res.send("Fetching all updates since " + options.lastPostModifiedDate);
											this.checkUpdates(mongodb, mysql, options);
										} else {
											console.log("Starting full update".yellow)
											res.send("Fetching complete remote db");
											this.checkUpdates(mongodb, mysql, options);
										}
									});
									
								}
							});
							
						}
					}
				});
			}
			
		});
	});
	
	makeDb = function(callback) {
		var dbhost = manager.nconf.get('mongoHost');
		var dbname = manager.nconf.get('mongoDbname');
		var dbport = manager.nconf.get('mongoPort');
		MongoClient.connect("mongodb://" + dbhost + ":" + dbport + "/" + dbname, function(err, db) {
			if (err) {
				console.log("Unable to connect to mongodb");
				console.log(err);
				callback(err);
			} else {
				callback(null, db);
			}
		});
		
	};
	
	checkUpdates = function(mongodb, mysql, options, postid) {
		var currentLastPostModifiedDate = options.lastPostModifiedDate;
		if (!currentLastPostModifiedDate) {
			currentLastPostModifiedDate = null;
		}
		var sql = "SELECT post_modified FROM " + options.remoteMysqlPrefix + "posts ORDER BY post_modified DESC LIMIT 1";
		mysql.query(sql, function(err, results) {
			if (err) {
				console.log("Remote DB error".red, err);
			} else {
				if (results && results.length == 1) {
					//console.log(results[0].post_modified.getTime());
					var lastFetchDate = results[0].post_modified;
					//Fetch Arguments
					var async = require('async');
					async.series([
					
						//Fetch Posts
						function(callback) {
							if (!currentLastPostModifiedDate) {
								sql = "SELECT ID FROM wp_posts where post_type IN ('giocatore','page','partita','post','statistica','tabellino','photogallery') ORDER BY post_date ASC";
								//sql = "SELECT ID FROM wp_posts where post_type IN ('giocatore','page','partita','post','statistica','tabellino','photogallery') AND ID = 65065";
							} else {
								sql = "SELECT ID FROM wp_posts where post_type IN ('giocatore','page','partita','post','statistica','tabellino','photogallery') AND post_modified >= FROM_UNIXTIME(" + (currentLastPostModifiedDate.getTime()/1000) + ") ORDER BY post_date ASC";
								//sql = "SELECT ID FROM wp_posts where post_type IN ('giocatore','page','partita','post','statistica','tabellino','photogallery') AND ID = 65065";
								
							}
							if (postid) {
								sql = "SELECT ID FROM wp_posts where post_type IN ('giocatore','page','partita','post','statistica','tabellino','photogallery') AND ID = " + postid + " ORDER BY post_date ASC";
							}
							var contentHelper = require('./contentHelper.js');
							mysql.query(sql, function(err, posts) {
								
								if (err) {
									callback(err);
								} else {
									var addedPosts = 0;
									
									async.eachSeries(posts, function(post, callback) {
										addedPosts++;
										//console.log("FindAndUpdate " + post.ID);
										contentHelper.findAndUpdate(mysql, mongodb, post.ID, options, function(err, content) {
											if (err) {
												console.log("Error in contentHelper".red, err);
												callback(err);
											} else {
												//console.log(content.ID + " => OK -> " + content.length);
												mongodb.collection("options").update({}, 
												{
													$set: {
														"lastPostModifiedDate": content.post_modified
													}
												}, function(err, cnt) {
													if (err) {
														callback(err);
													} else {
														if (manager.userEvent) {
															manager.userEvent.emit('singlecontentupdated', content);
														}
														console.log(("[POST] Completed post id: " + content.ID).yellow);
														callback(null);
													}
												});
											}
										});
										
										
									}, function(err) {
										callback(err);
									});
								}
							});
						},
						//Fetch Arguments
						function(callback) {
							if (postid) {
								callback(null);
								return;
							}
							sql = "SELECT * FROM wp_options WHERE option_name = 'taxonomy_image_plugin'";
							mysql.query(sql, function(err, opts) {
								if (err) {
									callback(err);
								} else {
									var arguments_images = {};
									if (opts && opts.length == 1) {
										var PHPUnserialize = require('php-unserialize');
										arguments_images = PHPUnserialize.unserialize(opts[0].option_value);
									}
									
									sql = "SELECT * FROM wp_terms as tt LEFT JOIN wp_term_taxonomy as ta ON tt.term_id = ta.term_id WHERE ta.taxonomy = 'laroma24_argomento' ORDER BY tt.term_id ASC";
									mysql.query(sql, function(err, args) {
										if (err) {
											callback(err);
										} else {
											//console.log(results);
											var addedArguments = 0;
											async.map(args, function(arg, callback) {
												mysql.query("SELECT * FROM wp_options WHERE option_name = 'tax_meta_" + arg.term_id + "'", function(err, option) {
													if (!option || option.length != 1) {
														option = [{
															option_value: 'a:2:{s:9:"show_home";s:1:"0";s:10:"home_order";s:2:"-1";}'
														}];
													}
													if (option && option.length == 1) {
														var PHPUnserialize = require('php-unserialize');
														o = PHPUnserialize.unserialize(option[0].option_value);
														if (o.matilda_titlecolor !== "#") {
															arg.titlecolor = o.matilda_titlecolor;
														} else {
															arg.titlecolor = "#000000";
														}
														arg.date = o.matilda_date;
														arg.date = moment(arg.date, "YY-MM-DD").toDate();
														//console.log("Converted date", o.matilda_date, arg.date);
														
														//console.log("Matilda argument", arg);
														if (o.matilda_immagine) {
															mysql.query("SELECT * FROM wp_posts WHERE id = " + o.matilda_immagine.id, function(err, images) {
																if (err) {
																	callback(err);
																} else {
																	arg.thumbnails = images;
																	var contentHelper = require('./contentHelper.js');
																	contentHelper.findTaxonomyImagesAndUpdate(mysql, mongodb, arg, options, function(err, thumbs) {
																		if (err) {
																			callback(err);
																		} else {
																			arg._thumbnails = thumbs;
																			mongodb.collection("matilda").update({
																				"slug": arg.slug
																			}, 
																			arg,
																			{ upsert: true },
																			function(err, cnt) {
																				addedArguments++;
																				console.log(("[ARGUMENT] Completed argument with slug: " + arg.slug).yellow);
																				callback(err);
																			});
																		}
																	});
																}
															});
														} else {
															//
															mongodb.collection("matilda").update({
																"slug": arg.slug
															}, 
															arg,
															{ upsert: true },
															function(err, cnt) {
																//console.log("End updating single argument");
																addedArguments++;
																callback(err);
															});
														}
													} else {
														console.log("No options!".red);
													}
													
												});
												
												
											}, function(err) {
												//console.log("End of arguments?");
												if (!err) {
													console.log (("[MATILDA] Arguments added/updated = " + addedArguments).yellow);
												}
												callback(err);
											});
											
										}
									});
									
								}
							});
							
						},
						
						//Fetch Zones
						function(callback) {
							if (postid) {
								callback(null);
								return;
							}
							var sql = "select t.term_id as term_id, t.name as name, t.slug as slug, tt.description as description from " + options.remoteMysqlPrefix + "terms as t left join " + options.remoteMysqlPrefix + "term_taxonomy as tt on tt.term_id = t.term_id WHERE tt.taxonomy = 'zoninator_zones'";
							mysql.query(sql, function(err, zones) {
								if (err) {
									callback(err);
									return;
								}
								async.map(zones, function(zone, callback) {
									sql = "SELECT option_value FROM " + options.remoteMysqlPrefix + "options WHERE option_name = '_zoninator_order_" + zone.term_id + "'";
									//HERE
									//callback(null);
									mysql.query(sql, function(err, options) {
										if (err) {
											console.log("Error callback".red, err);
											callback(err);
										} else {
											if (!options || options.length !== 1) {
												console.log("[ZONES] Wrong reply from mysql".yellow);
												options = [];
												options[0] = {};
												options[0].option_value = 'O:8:"stdClass":3:{s:5:"posts";a:0:{}s:10:"posts_byid";a:0:{}s:6:"passes";i:23;}';
											}
											var opt = options[0].option_value;
											
											var PHPUnserialize = require('php-unserialize');
											opt = 'a:3:' + opt.substring('O:8:"stdClass":3:'.length);
											options = PHPUnserialize.unserialize(opt);

											var posts = options.posts;
											var myposts = [];
											for (var key in posts) {
												myposts.push(posts[key.toString()]);
											}
											if (myposts.length < 1 ) {
												mongodb.collection("zones").update({
													slug: zone.slug
												},
												{
													name: zone.name,
													slug: zone.slug,
													posts: [],
													arguments: []
												}, {
													upsert: true
												}, function(err, cnt) {
													
													callback(null, []);
													
												});
											} else {
												async.map(myposts, function(singlepost, callback) {
													var zoneposts = [];
													var zonearguments = [];
													var type = null;
													var filter = {};
													if (singlepost.substring(0,1) == "p") {
														type = "posts";
														filter.ID = parseInt(singlepost.substring(1), 10);
														filter.post_status = "publish";
													}
													
													if (singlepost.substring(0,1) == "a") {
														type = "matilda";
														filter.term_id = parseInt(singlepost.substring(1), 10);
													}
													
													if (type.length < 4) {
														mongodb.collection("zones").update({
															slug: zone.slug
														},
														{
															name: zone.name,
															slug: zone.slug,
															posts: zoneposts,
															arguments: zonearguments
														}, {
															upsert: true
														}, function(err, cnt) {
															
															callback(null, []);
															
														});
													} else {
														//console.log("Searching for zone " + zone.slug, type, filter);
														mongodb.collection(type).find(filter).toArray(function(err, storedposts) {
															if (err) {
																callback(null, []);
															} else {
																if (type == "posts") {
																	if (storedposts.length > 0) {
																		zoneposts.push(storedposts[0]._id);
																	}
																} else {
																	if (storedposts.length > 0) {
																		zonearguments.push(storedposts[0]._id);
																	}
																}
																mongodb.collection("zones").update({
																	slug: zone.slug
																},
																{
																	name: zone.name,
																	slug: zone.slug,
																	posts: zoneposts,
																	arguments: zonearguments
																}, {
																	upsert: true
																}, function(err, cnt) {
																	
																	callback(null, []);
																	
																});
															}
														});
													}
													
													
												}, function(err, results) {
													console.log(("[ZONES] Done zone " + zone.name).yellow);
													if (err) {
														callback(err);
													} else {
														callback(null);
													}
												});
											}
										}										
									});
								}, function(err, results) {
									callback(err);
								});
							});
							
						},
						
						//Fetch texts
						function(callback) {
							sql = "SELECT * FROM wp_posts WHERE post_type = 'text-blocks'";
							mysql.query(sql, function(err, results) {
								if (err) {
									callback(err);
								} else {
									async.each(results, function(result, callback) {
										mongodb.collection('textblocks').update({
											ID: result.ID
										},
										result,
										{ upsert: true },
										function(err, cnt) {
											callback(err);
										});
									}, function(err, results) {
										callback(err);
									});
								}
							});
						}
						
						
					], function(err) {
						if (err) {
							mongodb.collection("options").update({}, 
							{
								$set: {
									"recheckAfterUpdate": false,
									"updateInProgress": false
								}
							}, function(myerr, cnt) {
									console.log("Remote DB update failed".red, err);
									mongodb.close();
									mysql.end();
								}
							);
														
						} else {
							if (postid) {
								mongodb.collection("options").update({}, 
								{
									$set: {
										"recheckAfterUpdate": false,
										"updateInProgress": false
									}
								}, function(err, cnt) {
										console.log("Remote DB update completed".green);
										if (manager.userEvent) {
											manager.userEvent.emit('contentupdated');
										}
										mysql.end();
										mongodb.close();
									}
								);
							} else {
								mongodb.collection("options").update({}, 
								{
									$set: {
										"recheckAfterUpdate": false,
										"updateInProgress": false,
										"lastFetch": lastFetchDate
									}
								}, function(err, cnt) {
										console.log("Remote DB update completed".green);
										if (manager.userEvent) {
											manager.userEvent.emit('contentupdated');
										}
										mysql.end();
										mongodb.close();
									}
								);
							}
							
						}
						
					});
				}
			}
		});
	};
	
	


	return router;
};
var async = require('async');
ObjectID = require('mongodb').ObjectID;
var findParentCats = function(db, retval, mycat, callback) {
	if (!retval) { retval = []; }
	retval.push(mycat);

	if (mycat && mycat.parent > 0) {
		db.query("SELECT t.*,tt.* FROM wp_terms AS t INNER JOIN wp_term_taxonomy AS tt ON tt.term_id = t.term_id WHERE t.term_id = ?", mycat.parent, function(err, res) {
			if (err) {

			} else {
				if (res && res.length > 0) {
					var cat = res[0];
					findParentCats(db, retval, cat, callback);
				} else {
					findParentCats(db, retval, null, callback);
				}
			}
		});
	} else {
		callback(null, retval);
	}
};

function rebuildThumbnails (mypath, callback) {
	console.log("Rebuilding " + mypath);
	var fullpath = decodeURIComponent(mypath);
	var path = require('path');
	var dir = path.dirname(fullpath);
	var filename = path.basename(fullpath);
	gm = require('gm');
	var targetQuality = 90;
	gm(fullpath).quality(targetQuality)
	.size(function(err, size) {
		if (err) {
			console.log(err);
			callback(null, fullpath);
		} else {
			var bigY = parseInt(((600 * size.height) / size.width),10);
			var smallY = parseInt(((80 * size.height) / size.width), 10);
			var mediumY = parseInt(((310 * size.height) / size.width), 10);
			gm(fullpath).quality(targetQuality)
			.resize(600,bigY).quality(targetQuality)
			.write(dir + "/BIG-" + filename, function (err) {
				//console.log("Saved image as: " + dir + "/BIG-" + filename);
				gm(fullpath).quality(targetQuality)
				.resize(80,smallY).quality(targetQuality)
				.write(dir + "/SMALL-" + filename, function (err) {
					//console.log("Saved image as: " + dir + "/SMALL-" + filename);
					gm(fullpath).quality(targetQuality)
					.resize(310,mediumY).quality(targetQuality)
					.write(dir + "/MEDIUM-" + filename, function (err) {
						gm(fullpath).quality(targetQuality)
						.resize('600', '394', '^').quality(targetQuality)
						.gravity('Center').quality(targetQuality)
						.crop('600', '394').quality(targetQuality)
						.write(dir + "/RETINABIGTHUMB-" + filename, function (err) {
							gm(fullpath).quality(targetQuality)
							.resize('290', '190', '^').quality(targetQuality)
							.gravity('Center').quality(targetQuality)
							.crop('290', '190').quality(targetQuality)
							.write(dir + "/RETINASMALLTHUMB-" + filename, function (err) {
								gm(fullpath).quality(targetQuality)
								.resize('300', '197', '^').quality(targetQuality)
								.gravity('Center').quality(targetQuality)
								.crop('300', '197').quality(targetQuality)
								.write(dir + "/BIGTHUMB-" + filename, function (err) {
									gm(fullpath).quality(targetQuality)
									.resize('145', '95', '^').quality(targetQuality)
									.gravity('Center').quality(targetQuality)
									.crop('145', '95').quality(targetQuality)
									.write(dir + "/SMALLTHUMB-" + filename, function (err) {
										//console.log("Saved image as: " + dir + "/SMALLTHUMB-" + filename);
										//console.log(("Saved image as: " + dir + "/" + filename).yellow);
										callback(null, fullpath);
									});
								});
							});
						});
					});
				});
			});
		}
	});
}

function downloadAndSave(options, callback) {
	var http = require('http');
	var fs = require('fs');
	if (options.path.indexOf('%20') < 0) {
		options.path = encodeURI(options.path);
	}
	http.get(options, function(res){
		var imagedata = '';
		res.setEncoding('binary');
		res.on('data', function(chunk){
			imagedata += chunk
		});
		res.on('end', function(){
			if (res.statusCode !== 200) {
				console.log(("Error downloading: " + options.path).red);
				callback("Error downloading file!");
			} else {
				var split = "./static" + decodeURIComponent(options.path);
				split = split.split("/");
				var p = "";
				for (var i = 0; i < split.length - 1; i++) {
					p = p + split[i] + "/";
					if (!fs.existsSync(p)){
					    fs.mkdirSync(p);
					}
				}
				fs.writeFile("./static" + decodeURIComponent(options.path), imagedata, 'binary', function(err){
					if (err) {
						callback(err);
						return;
					}
					
					rebuildThumbnails('./static'+options.path, function(err, fullpath) {
						if (err) {
							console.log(err);
						} else {
							console.log(("Saved image as: " + fullpath).yellow);
							callback(null, fullpath);
						}
					});
				});
			}
		});

	});
};

var findTaxonomyImagesAndUpdate = function(sql, mongo, taxonomy, mainoptions, maincallback) {
	var funcs = [];
	for (var i = 0; i < taxonomy.thumbnails.length; i++) {
		var im = taxonomy.thumbnails[i];
		funcs.push(makeImageDownloadFunction(im, mongo, mainoptions, downloadAndSave));
	}
	async.parallel(funcs, function(err, rets) {
		if (err) {
			maincallback(null, []);
		} else {
			maincallback(null, rets);
		}
	});
};

var findAndUpdate = function (sql, mongo, cid, mainoptions, maincallback) {
	sql.query("SELECT * FROM wp_posts where ID = ?", cid, function(err, results) {
		if (err) {
			maincallback("Unable to fetch post");
			return;
		} else {
			if (!results || results.length != 1) {
				maincallback("Unable to fetch post");
				return;
			}
			var content = results[0];
			processContent(sql, mongo, content, function(err, content) {
				//console.log("Processing content is done");
				if (err) {
					maincallback("Unable to process content for content " + cid);
				} else {
					var async = require('async');
					async.series([
						//Check all images and thumbnails
						function(callback) {
							var funcs = [];
							for (var i = 0; i < content.images.length; i++) {
								var im = content.images[i];
								funcs.push(makeImageDownloadFunction(im, mongo, mainoptions, downloadAndSave));
							}
							async.parallel(funcs, function(err, rets) {
								if (err) {
									//callback(err);
									callback(null, []);
								} else {
									callback(null, rets);
								}
							});
						},
						
						function(callback) {
							var funcs = [];
							for (var i = 0; i < content.thumbnails.length; i++) {
								var im = content.thumbnails[i];
								funcs.push(makeImageDownloadFunction(im, mongo, mainoptions, downloadAndSave));
							}
							async.parallel(funcs, function(err, rets) {
								if (err) {
									//callback(err);
									callback(null, []);
								} else {
									callback(null, rets);
								}
							});
						},
						
						
						//Chck for tags!!
						function(callback) {
							//console.log("Doing tags...");
							var funcs = [];
							for (var i = 0; i < content.tags.length; i++) {
								var tag = content.tags[i];
								var tagid = tag.term_id;
								//console.log("Checking for tag", { term_id: tagid });
								funcs.push(
									function(tag) {
										return function(callback) {
											mongo.collection('tags').find({ term_id: tag.term_id }).toArray(function(err, retvals) {
												if (err) {
													callback(err);
												} else {
													if (retvals && retvals.length > 0) {
														//console.log(retvals);
														callback(null, retvals[0]._id);
													} else {
														mongo.collection('tags').update({ term_id: tag.term_id}, tag, { upsert: true }, function(err, retval) {
															if (err) {
																callback(err);
															} else {
																mongo.collection('tags').find({ term_id: tag.term_id }).toArray(function(err, results) {
																	if (err) {
																		callback(err);
																	} else {
																		if (results && results.length > 0) {
																			callback(null, results[0]._id);
																		} else {
																			callback(null, null);
																		}
																	}
																});
															}
														});
													}
												}
											});
										}
									}(tag)
								);
							};
							async.parallel(funcs, function(err, rets) {
								if (err) {
									callback(err);
								} else {
									//console.log("Tags done");
									callback(null, rets);
								}
							});
						},
						
						//Cleanup text					
						function(callback) {
							//console.log("Doing content...");
							if (content && content.post_content && content.post_content.length > 0) {
								var c = content.post_content;
								
								
								var nl2br = function (str, is_xhtml) {
									var breakTag = (is_xhtml || typeof is_xhtml === 'undefined') ? '<br ' + '/>' : '<br>'; // Adjust comment to avoid issue on phpjs.org display
									return (str + '').replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1' + breakTag + '$2');
								};
								//if ((c.match(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g) || []).length < 10) {
									c = nl2br(c);
								//}
								var html = require("html");
								c = c.replace(String.fromCharCode(10),'');
								c = html.prettyPrint(c, {indent_size: 1, indent_char: " ", max_char: 50000, always_add: ""});
								c = "<content>" + c + "</content>\n";
								c = c.replace('href="http://www.laroma24.it','href="');
								c = c.replace('href="http://laroma24.it','href="');
								
								c = c.replace('  ',' ');
								
								var cheerio = require("cheerio");
								var $ = cheerio.load(c);
								var images = $('img');
								if (images && images.length > 0) {
									var toreplace = [];
									var funcs = [];
									
									for (var i = 0; i < images.length; i++) {
										var src = images[i].attribs.src;
										//console.log("Found image with src", src);
										if (src.substring(0, 23) == "http://www.laroma24.it/" || src.substring(0, 19) == "http://laroma24.it/") {
											if (src.substring(0, 23) == "http://www.laroma24.it/") {
												//console.log($('img').get(i));
												var osrc = decodeURIComponent(src.substring(23));
												$($('img').get(i)).attr('src', "/" + osrc);
											} else {
												var osrc = decodeURIComponent(src.substring(18));
												$($('img').get(i)).attr('src', "/" + osrc);
											}
											toreplace.push($($('img').get(i)).attr('src'));
											funcs.push(
												function(src) {
													return function(callback) {
														var options = {
														    host: 'www.laroma24.it'
														  , port: 80
														  , path: src
														};
														downloadAndSave(options, function(err, res) {
															if (err) { 
																callback(err); 
															}  else {
																//console.log("Downloaded image: " + src);
																callback(null, src);
															}
														});
													};
												}(decodeURIComponent($($('img').get(i)).attr('src')))
											);
										}
									}
									if (toreplace.length > 0) {
										async.parallel(funcs, function(err) {
											c = $.html();
											callback(null, c);
										});
									} else {
										c = $.html();
										callback(null, c);
									}
									
								} else {
									callback(null, c);
								}
								
								//content.post_content = content.post_content.replace('Italia','BELLA ITALIA');
								//console.log("Content done", c);
								
							} else {
								callback(null, content.post_content);
							}
						}
						
						
					],
					function(err, operations) {
						if (err) {
							maincallback(err);
						} else {
							//console.log("Last leg");

							content._images = operations[0];
							content._thumbnails = operations[1];
							content._tags = operations[2];
							content._content = operations[3];
							//console.log("Content: ", content._content);
							mongo.collection('content_images_thumbnails').remove({
								content_original_id: content.ID
							}, function(err) {
								mongo.collection('posts').find({ ID: content.ID }).toArray(function(err, results) {
									if (err) {
										maincallback(err);
									} else {
										if (results && results.length > 0) {
											content.post_views = parseInt(results[0].post_views,10);
											mongo.collection('posts').update({ ID: content.ID }, content, {upsert: true}, function(err, result) {
												//console.log("Content updated, kept local views");
												if (err) {
													maincallback(err);
												} else {
													maincallback(null, content);
												}
											});
										} else {
											content.post_views = parseInt(content.views, 10);
											mongo.collection('posts').update({ ID: content.ID }, content, {upsert: true}, function(err, result) {
												//console.log("Content updated");
												if (err) {
													maincallback(err);
												} else {
													maincallback(null, content);
												}
											});
										}
									}
								});
							});
							
						}	
					});
					
				}
			});
		}
	});
};

var processContent = function(sql, mongo, content, maincallback) {
	//console.log("Processing content");
	var async = require('async');
	async.parallel([
	//Find categories
	function(callback){
		sql.query("SELECT * FROM wp_terms AS t INNER JOIN wp_term_taxonomy AS tt ON tt.term_id = t.term_id INNER JOIN wp_term_relationships AS tr ON tr.term_taxonomy_id = tt.term_taxonomy_id WHERE tt.taxonomy = 'category' and tr.object_id = ?", content.ID, function(error, category) {
			if (error) {
				callback("Failed to query DB for categories");
			} else {
				if (category && category.length > 0) {
					findParentCats(sql, [], category[0], function(error, cats) {
						callback(null, cats);
					});
				} else {
					content.categories = [];
					callback(null, []);
				}

			}
		});
	},
	//Find tags
	function(callback) {
		sql.query("SELECT * FROM wp_terms INNER JOIN wp_term_taxonomy ON wp_term_taxonomy.term_id = wp_terms.term_id INNER JOIN wp_term_relationships ON wp_term_relationships.term_taxonomy_id = wp_term_taxonomy.term_taxonomy_id WHERE taxonomy = 'post_tag' AND object_id = ?", content.ID, function(error, tags) {
			if (error) {
				callback("Failed to query DB for tags");
			} else {
				if (tags && tags.length > 0) {
					callback(null, tags);
				} else {
					callback(null, []);
				}
			}
		});
	},

	//Find featured thumbnail
	function(callback) {
		sql.query("SELECT p.* FROM wp_postmeta AS pm INNER JOIN wp_posts AS p ON pm.meta_value=p.ID WHERE pm.post_id = ? AND pm.meta_key = '_thumbnail_id' ORDER BY p.post_date DESC ", content.ID, function(error, tags) {
			if (error) {
				callback("Failed to query DB for featured thumbnail");
			} else {
				if (tags && tags.length > 0) {
					callback(null, tags);
				} else {
					sql.query("select * from wp_postmeta where meta_key = 'custom_featured' and post_id = ?", content.ID, function(error, tags) {
						if (error) {
							callback("Failed to query DB for custom featured thumbnail");
						}	else {
							if (tags && tags.length > 0) {
								var md5 = require('MD5');
								var ntags = [];
								for (var i = 0; i < tags.length; i++) {
									ntags.push({ID: md5(tags[i].meta_value), guid: tags[i].meta_value});
								}
								callback(null, ntags);
							} else {
								callback(null, []);
							}
						}
					});
					
				}
			}
		});
	},

	//Find all images
	function(callback) {
		sql.query("SELECT p.* FROM wp_postmeta AS pm INNER JOIN wp_posts AS p ON pm.meta_value=p.ID WHERE pm.post_id = ? AND pm.meta_key != '_thumbnail_id' AND p.post_type = 'attachment' AND p.post_mime_type LIKE 'image/%' ORDER BY p.post_date DESC ", content.ID, function(error, tags) {
			if (error) {
				callback("Failed to query DB for images");
			} else {
				if (tags && tags.length > 0) {
					callback(null, tags);
				} else {
					callback(null, []);
				}
			}
		});
	},

	//Get original views!

	function(callback) {
		sql.query("SELECT pm.meta_value FROM wp_postmeta AS pm INNER JOIN wp_posts AS p ON pm.meta_value=p.ID WHERE pm.post_id = ? AND pm.meta_key LIKE 'gigas_post_views_count' ORDER BY p.post_date DESC", content.ID, function(error, views) {
			if (error) {
				//console.log(JSON.stringify(error));
				callback(error);
			} else {
				if (views && views.length > 0) {
					callback(null, views[0].meta_value);
				} else {
					callback(null, 0);
				}
			}
		});
	},

	//Find arguments
	function(callback) {
		sql.query("SELECT * FROM wp_terms INNER JOIN wp_term_taxonomy ON wp_term_taxonomy.term_id = wp_terms.term_id INNER JOIN wp_term_relationships ON wp_term_relationships.term_taxonomy_id = wp_term_taxonomy.term_taxonomy_id WHERE taxonomy = 'laroma24_argomento' AND object_id = ?", content.ID, function(error, arguments) {
			if (error) {
				callback("Failed to query DB for arguments");
			} else {
				if (arguments && arguments.length > 0) {
					var retval = [];
					for (var i = 0; i < arguments.length; i++) {
						retval.push(arguments[i].slug);
					}
					callback(null, retval);
				} else {
					callback(null, []);
				}
			}
		});
	}


	],

	// final callback
	function(err, results){
		//console.log("Final callback");
		//
		if (err) {
			maincallback(err);
		} else {
			var categories = 0;
			var tags = 1;
			var thumbnails = 2;
			var images = 3;
			var views = 4;
			var arguments = 5;
			content.categories = results[categories];
			content.tags = results[tags];
			content.thumbnails = results[thumbnails];
			content.images = results[images];
			content.arguments = results[arguments];

			content.views = results[views];
			maincallback(null, content);
		}
	});
};

function makeImageDownloadFunction(im, mongodb, mainoptions, downloadAndSave) {
	return function(callback) {
		console.log(("[IMAGES] Checking image with id: " + im.ID).yellow);
		var imagecollection = mongodb.collection('images');
		var doDownload = false;
		imagecollection.findOne({ ID: im.ID }, function(err, image) {
			if (err) {
				callback(err);
			} else {
				if (!image) {
					doDownload = true;
				} else {
					if (!image.post_modified || image.post_modified.getTime() == im.post_modified.getTime()) {
						//Image has same date or no date at all...
					} else {
						doDownload = true;
					}
				}
				if (doDownload) {
					var impath = im.guid;
					impath = impath.replace(/http:\/\/www.laroma24.it\//gi,'');
					impath = impath.replace(/http:\/\/laroma24.it\//gi,'');
					impath = impath.replace(/http:\/\/www.asroma24.it\//gi,'');
					impath = impath.replace(/http:\/\/asroma24.it\//gi,'');
					var options = {
						host: mainoptions.remoteWebHost,
						port: mainoptions.remoteWebPort,
						path: "/" + impath
					};
					downloadAndSave(options, function(err, res) {
						//console.log("Download and save completed");
						if (err) {
							callback(err);
						} else {
							im.filename = res;
							imagecollection.update({ ID: im.ID }, im, { upsert: true }, function(err, cnt) {
								if (err) {
									callback(err);
								} else {
									imagecollection.findOne({ ID: im.ID }, function(err, image) {
										if (err) {
											callback(err);
										} else {
											if (!image) {
												callback("No image found after save");
											} else {
												callback(null, image._id);
											}
										}
									});
								}
							});
						}
					});
				} else {
					rebuildThumbnails(image.filename, function(err, res) {
						callback(null, image._id);
					});
					
				}
			}
		});
	};
};

module.exports = { processContent: processContent, findAndUpdate: findAndUpdate, findTaxonomyImagesAndUpdate: findTaxonomyImagesAndUpdate};
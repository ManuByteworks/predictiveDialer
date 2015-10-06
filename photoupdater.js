var Flickr = require("node-flickr");
var keys = {
    "api_key": "44c3ff1f3a521c98c842002c7126e493"
}
flickr = new Flickr(keys);
var tags = ["sky", "city,landscape","Rome","Europe"];
var async = require("async");
async.mapSeries(tags, function(tag, callback) {
    flickr.get("photos.search", {
        "tags": "sky",
        "tag_mode": "ALL",
        "sort": "interestingness-desc",
        "licence": "7",
        "per_page": 50 
    }, function(err, result) {
        if (err) {
            console.log("Calling back");
            callback();
            return console.error(err);
        }
        console.log("Got result for tag: " + tag + " (" + result.photos.photo.length + ")");
        async.mapSeries(result.photos.photo, function(photo, callback) {
            flickr.get("photos.getInfo", {
                photo_id: photo.id
            }, function(err, result) {
                if (err) {
                    console.log(err);
                    callback();
                } else {
			item = result.photo;
			var url = "https://farm" + item.farm + ".staticflickr.com/" + item.server + "/" + item.id + "_" + item.secret + "_b.jpg";
			var description = item.description._content;
			var title = item.title._content;
			download(url, "./static/flickr/" + tag + "/" + item.id + ".jpg", function(err) {
				if (err) {
					console.log("Error downloading " + url);
					callback();
				} else {
					var fs = require('fs');
					fs.writeFileSync("./static/flickr/" + tag + "/" + item.id + ".json", JSON.stringify(item));
					console.log("Done file: " + item.id);
					callback();
				}
			});
                }
            });
        }, function() {
            console.log("Calling back on key");
            callback();
        });
    });
}, function() {
    console.log("Done!");
});

var http = require('http');
var https = require('https');
var fs = require('fs');
var download = function(url, dest, cb) {
  var file = fs.createWriteStream(dest);
  var request = https.get(url, function(response) {
    console.log(url + " -> " + response.statusCode);
    if (response.statusCode == "200") {
    	response.pipe(file);
    	file.on('finish', function() {
      		file.close(cb);  // close() is async, call cb after close completes.
    	});
    } else {
	file.close(function() {
		fs.unlinkSync(dest);
		cb(true);
	});
    }
  }).on('error', function(err) { // Handle errors
    fs.unlink(dest); // Delete the file async. (But we don't check the result)
    if (cb) cb(err.message);
  });
};


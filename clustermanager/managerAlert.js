
var managerAlert = function(altype, altitle, altext) {
	this.date = new Date();
	this.title = altitle;
	this.type = altype;
	this.altext = altext;
	switch(altype) {
		case "system":
			this.icon = 'fa-bolt';
		break;
		default:
			this.icon = 'fa-bell';
		break;
	}
};

managerAlert.prototype.toLi = function() {
	var moment = require('moment')(this.date);
	var string = '<li class="divider"></li>';
	string += '<li><a href="#"><div><i class="fa fa-tasks ' + this.icon + '"></i> ' + this.title + '<span class="pull-right text-muted small">' + moment.fromNow() + '</span></div></a></li>';
	return string;
};

module.exports = managerAlert;
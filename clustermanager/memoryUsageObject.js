var memoryUsage = function(usage, free, date) {
	if (date) {
		this.date = new Date(date).getTime();
	}
	this.usage = usage;
	this.free = free;
};

memoryUsage.prototype.toObject = function() {
	var ob = {};
	ob.period = this.date;
	ob.value = this.usage;
	ob.free = this.free;
	return ob;
};

module.exports = memoryUsage;
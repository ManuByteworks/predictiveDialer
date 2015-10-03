var managerMemoryUsage = function(usage, free) {
	this.date = new Date().getTime(),
	this.usage = usage;
	this.free = free;
};

managerMemoryUsage.prototype.toObject = function() {
	var ob = {};
	ob.period = this.date;
	ob.value = this.usage;
	ob.free = this.free;
	return ob;
};

module.exports = managerMemoryUsage;
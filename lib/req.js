var xtend = require('xtend');

module.exports = Request;

function Request (req, fn) {
    this.id = req.id;
    this.type = req.type;
    this.data = req.data;
    this.limit = req.limit;
    this.hops = req.hops;
    this._fn = fn;
}

Request.prototype.reply = function (data) {
    if (typeof data === 'string' || Buffer.isBuffer(data)) {
        this._fn(xtend(this, {
            hops: 0,
            data: data
        }));
    }
    else {
        this._fn(xtend({
            id: this.id,
            type: this.type,
            limit: this.limit,
            hops: 0
        }, data));
    }
};

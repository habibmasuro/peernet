var peernet = require('../');
var isarray = require('isarray');

module.exports = RPC;
RPC.methods = [ 'join', 'part', 'add', 'rm' ];

function RPC (server, stream) {
    if (!(this instanceof RPC)) return new RPC(server, stream);
    this._server = server;
    this._stream = stream;
    this._pn = peernet();
}

RPC.prototype.join = function () {
    
};

RPC.prototype.part = function () {
    
};

RPC.prototype.add = function (addrs, cb) {
    var nodes = (isarray(addrs) ? addrs : [addrs])
        .map(function (addr) {
            return { address: addr };
        })
    ;
    this._pn.save(
};

RPC.prototype.rm = function () {
};

RPC.prototype.connect = function (addr, cb) {
    this._pn.connect(addr, cb)
};

RPC.prototype.disconnect = function (addr, cb) {
    this._pn.disconnect(addr);
    if (cb) cb();
};

RPC.prototype.stats = function () {
    
};

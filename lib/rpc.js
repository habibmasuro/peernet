var peernet = require('../');
var isarray = require('isarray');
var wsock = require('websocket-stream');
var http = require('http');

module.exports = RPC;
RPC.methods = [
    'add', 'remove', 'connect', 'disconnect',
    'stats', 'listen'
];

function RPC (server, stream) {
    if (!(this instanceof RPC)) return new RPC(server, stream);
    this._server = server;
    this._stream = stream;
    this._pn = peernet();
}

RPC.prototype.add = function (nodes, cb) {
    this._pn.save(nodes, cb);
};

RPC.prototype.remove = function (nodes) {
    this._pn.remove(nodes, cb);
};

RPC.prototype.connect = function (addr, cb) {
    this._pn.connect(addr, cb)
};

RPC.prototype.disconnect = function (addr, cb) {
    this._pn.disconnect(addr);
    if (cb) cb();
};

RPC.prototype.connections = function (cb) {
    cb(null, this._pn.connections());
};

RPC.prototype.stats = function () {
};

RPC.prototype.listen = function (opts, cb) {
    var self = this;
    cb = once(cb || function () {});
    if (!opts) opts = {};
    var proto = String(opts.proto).replace(/:$/, '') || 'ws';
    
    if (proto === 'ws') {
        var server = http.createServer(function (req, res) { res.end() });
        server.on('error', cb);
        server.listen(opts.port, function () {
            cb(null, server.address());
        });
        wsock.createServer({ server: server }, function (stream) {
            var addr = stream.socket.upgradeReq.socket.remoteAddress;
            var port = stream.socket.upgradeReq.socket.remotePort;
            self._pn._connections[addr + ':' + port] = stream;
            stream.pipe(self._pn.createStream(addr)).pipe(stream);
            
            var ended = false;
            stream.once('end', onend);
            stream.once('error', onend);
            stream.once('close', onend);
            
            function onend () {
                if (ended) return;
                ended = true;
                self._pn.disconnect(addr + ':' + port);
            }
        });
    }
};

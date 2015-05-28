var peernet = require('../');
var isarray = require('isarray');
var wsock = require('websocket-stream');
var http = require('http');
var transport = require('../lib/transport.js');
var minimist = require('minimist');
var level = require('level');
var once = require('once');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;

var pn, db, servers = [];

module.exports = function (server, stream, args) {
    if (!pn) {
        var argv = minimist(args, {
            alias: { d: 'datadir' }
        });
        db = level(argv.datadir);
        pn = peernet(db, { transport: transport });
    }
    return new RPC(pn, servers, server, stream);
};

module.exports.methods = [
    'add', 'remove', 'connect', 'disconnect', 'known:s',
    'connections', 'servers', 'stats', 'listen', 'close'
];

inherits(RPC, EventEmitter);

function RPC (pn, servers, server, stream) {
    EventEmitter.call(this);
    this._pn = pn;
    this._server = server;
    this._stream = stream;
    this._servers = servers;
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

RPC.prototype.known = function (opts) {
    return this._pn.known(opts);
};

RPC.prototype.servers = function (cb) {
    cb(null, this._servers.map(function (s) { return s.address() }));
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
            self.emit('ref');
            cb(null, server.address());
        });
        server.on('close', function () {
            self.emit('unref');
        });
        self._servers.push(server);
        
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

RPC.prototype.close = function (cb) {
    this._server.close();
    this._stream.destroy();
    this._servers.forEach(function (s) { s.close() });
    
    var pn = this._pn;
    pn.connections().forEach(function (addr) {
        pn.disconnect(addr);
    });
    cb();
};

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
var through = require('through2');
var readonly = require('read-only-stream');
var onend = require('end-of-stream');

var pn, db, servers = [];
module.exports = function (server, stream, args) {
    if (!pn) {
        var argv = minimist(args, {
            alias: { d: 'datadir' }
        });
        db = level(argv.datadir);
        pn = peernet(db, { transport: transport });
    }
    return binder(new RPC(pn, servers, server, stream));
};
module.exports.servers = servers;

var methods = module.exports.methods = [
    'add', 'remove', 'connect', 'disconnect',
    'known:s', 'log:s',
    'connections', 'servers', 'stats', 'listen', 'close'
];

function binder (ref) {
    methods.forEach(function (m) {
        var name = m.split(':')[0];
        var f = ref[name];
        ref[name] = ref[name].bind(ref);
    });
    return ref;
}

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
    if (!cb) cb = function () {};
    this._pn.connect(addr, cb);
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

RPC.prototype.log = function () {
    var log = through();
    var pn = this._pn;
    pn.on('debug', ondebug);
    
    onend(this._stream, function () {
        pn.removeListener('debug', ondebug);
    });
    return readonly(log);
    function ondebug (msg) { log.write(msg + '\n') }
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
            var addr = server.address();
            self._pn._debug('listening on %s:%d', addr.address, addr.port);
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

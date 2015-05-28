var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var through = require('through2');
var isarray = require('isarray');
var sprintf = require('sprintf');
var has = require('has');
var concatMap = require('concat-map');
var readonly = require('read-only-stream');
var defined = require('defined');
var once = require('once');
var decoder = require('./lib/decoder.js');
var lenpre = require('length-prefixed-stream');

var crypto = require('crypto');
function sha (buf) {
    return crypto.createHash('sha512').update(buf).digest();
}

var Peer = require('./lib/peer.js');
var randomPeer = require('./lib/random.js');

module.exports = Peernet;
inherits(Peernet, EventEmitter);

function Peernet (db, opts) {
    if (!(this instanceof Peernet)) return new Peernet(db, opts);
    var self = this;
    this.db = db;
    this._options = opts;
    this._transport = opts.transport;
    this._connections = {};
    
    var ivms = defined(opts.interval, 5000);
    var ivsize = defined(opts.size, 10);
    if (ivms) this._getNodesLoop(ivms, ivsize);
    
    if (opts.bootstrap !== false) {
        var n = defined(opts.connections, 5);
        this.bootstrap(n);
    }
};

Peernet.prototype.bootstrap = function (n) {
    var self = this;
    
    var peers = 0;
    randomPeer(self.db, n).pipe(through.obj(write, end));
    
    function write (node, enc, next) {
console.log('node=', node); 
        peers ++;
        next();
    }
    function end (next) {
        if (peers < n) {
            
        }
    }
};

Peernet.prototype._getNodesLoop = function (ms, size) {
    var self = this;
    self.on('peer', function (peer) {
        var disconnected = false;
        var timeout = null;
        var nodes = [];
        
        peer.once('disconnect', function () {
            disconnected = true;
            clearTimeout(timeout);
        });
        getNodes();
        
        function getNodes () {
            if (disconnected) return;
            self._debug('get nodes: %s', peer.address);
            peer.getNodes(size).pipe(through.obj(write, end));
        }
        function write (node, enc, next) {
            self._debug('node from %s: %s', peer.address, node.address);
            nodes.push(node);
            next();
        }
        function end (next) {
            self.save(nodes, function (err) {
                if (err) self.emit('error', err);
                setTimeout(getNodes, ms);
            });
            next();
        }
    });
};

Peernet.prototype._debug = function () {
    var msg = sprintf.apply(null, arguments);
    if (this._options.debug) {
        console.error(msg);
    }
    this.emit('debug', msg);
};

Peernet.prototype.connect = function (addr, cb) {
    cb = once(cb || function () {});
    var self = this;
    var c = this._transport(addr);
    var closed = false;
    var hello = false;
    
    this._connections[addr] = c;
    
    var peer = this.createStream(addr);
    peer.hello(function () {
        hello = true;
        self._logConnection(addr, { ok: true });
    });
    
    c.pipe(peer).pipe(c);
    c.once('error', onend);
    c.once('end', onend);
    c.once('error', cb);
    
    c.once('connect', function () {
        self._debug('connected: %s', addr);
        self.emit('connect', peer);
        peer.emit('connect');
        cb(null, cb);
    });
    return peer;
    
    function onend () {
        if (closed) return;
        closed = true;
        if (!hello) {
            self._logConnection(addr, { ok: false });
        }
        delete self._connections[addr];
        if (c.destroy) c.destroy();
        self._debug('disconnected: %s', addr);
        self.emit('disconnect', peer);
        peer.emit('disconnect');
    }
};

Peernet.prototype.known = function (opts) {
    if (!opts) opts = {};
    var r = this.db.createReadStream({
        gt: 'addr!' + defined(opts.gt, ''),
        lt: 'addr!' + defined(opts.lt, '~'),
        limit: opts.limit,
        valueEncoding: 'binary'
    });
    if (opts.raw) {
        var out = readonly(r.pipe(through.obj(function (row, enc, next) {
            this.push(row.value);
            next();
        })).pipe(lenpre.encode()));
        r.on('error', function (err) { out.emit('error', err) });
        return out;
    }
    else {
        var out = readonly(r.pipe(through.obj(function (row, enc, next) {
            var ref = decoder.NodeResponse.decode(row.value)
            this.push(JSON.stringify({
                address: ref.address.toString('base64'),
                subnets: ref.subnets,
                previous: ref.previous,
                key: ref.key
            }) + '\n');
            next();
        })));
        r.on('error', function (err) { out.emit('error', err) });
        return out;
    }
};

Peernet.prototype.disconnect = function (addr) {
    if (has(this._connections, addr)) {
        this._connections[addr].destroy();
        delete this._connections[addr];
    }
};

Peernet.prototype.connections = function () {
    return Object.keys(this._connections);
};

Peernet.prototype.save = function (nodes, cb) {
    var self = this;
    this.db.batch(concatMap(nodes, function (node) {
        var key = sha(node.address).toString('hex');
        return [
            {
                type: 'put',
                key: 'addr!' + key,
                value: decoder.NodeResponse.encode(node)
            }
        ];
    }), { valueEncoding: 'binary' }, cb);
    
    nodes.forEach(function (node) {
        self.emit('known', node);
    });
};

Peernet.prototype.remove = function (nodes, cb) {
    cb = once(cb || function () {});
    var keys = [];
    var db = this.db;
    var pending = 1;
    
    nodes.forEach(function (node) {
        var key = sha(node.address).toString('hex');
        keys.push('addr!' + key);
        pending += 2;
        
        var x = db.createReadStream({
            gt: 'stats!' + key + '!',
            lt: 'stats!' + key + '!~'
        });
        x.on('error', cb);
        x.pipe(through(function (row, enc, next) {
            keys.push(row.key);
            next();
        }, done));
        
        var y = db.createReadStream({
            gt: 'con!' + key + '!',
            lt: 'con!' + key + '!~'
        });
        y.on('error', cb);
        y.pipe(through(function (row, enc, next) {
            keys.push(row.key);
            next();
        }, done));
    });
    done();
    
    function done () {
        if (-- pending !== 0) return;
        db.batch(keys.map(function (key) {
            return { type: 'del', key: key };
        }), cb);
    }
};

Peernet.prototype._logStats = function (addr, stats, cb) {
    var key = sha(addr).toString('hex');
    this.db.batch([
        {
            type: 'put',
            key: 'stats!' + key + '!' + new Date().toISOString(),
            value: JSON.stringify(stats)
        }
    ], cb);
};

Peernet.prototype._logConnection = function (addr, stats, cb) {
    var key = sha(addr).toString('hex');
    this.db.batch([
        {
            type: 'put',
            key: 'con!' + key + '!' + new Date().toISOString(),
            value: JSON.stringify(stats)
        }
    ], cb);
};

Peernet.prototype._purge = function () {
    throw new Error('todo: purge');
};

Peernet.prototype.getStats = function (addr, cb) {
    var key = sha(addr).toString('hex');
    var pending = 2;
    cb = once(cb || function () {});
    
    var stats = {
        connections: { ok: 0, fail: 0 },
        nodes: { rx: 0, tx: 0 }
    };
    var s = this.db.createReadStream({
        gt: 'stats!' + addr,
        lt: 'stats!' + addr + '!~'
    });
    s.once('error', cb);
    s.pipe(through.obj(swrite, done));
    
    var c = this.db.createReadStream({
        gt: 'con!' + key + '!',
        lt: 'con!' + key + '!~'
    });
    c.once('error', cb);
    c.pipe(through.obj(cwrite, done));
    
    function swrite (buf, enc, next) {
        try { var row = JSON.parse(buf) }
        catch (err) { return this.emit('error', err) }
        stats.nodes.rx += Number(row.rx) || 0;
        stats.nodes.tx += Number(row.tx) || 0;
        next();
    }
    function cwrite (buf, enc, next) {
        try { var row = JSON.parse(buf) }
        catch (err) { return this.emit('error', err) }
        stats.connections.ok += row.ok ? 1 : 0;
        stats.connections.fail += row.ok ? 0 : 1;
        next();
    }
    
    function done () {
        if (-- pending !== 0) return;
        cb(null, stats);
    }
};

Peernet.prototype.createStream = function (addr) {
    var self = this;
    var peer = new Peer(self.db);
    if (addr) peer.address = addr;
    if (addr) {
        var hello = false;
        peer.once('hello-request', function () {
            if (hello) return;
            hello = true;
            self._logConnection(addr, { ok: true });
        });
        peer.once('hello-reply', function () {
            if (hello) return;
            hello = true;
            self._logConnection(addr, { ok: true });
        });
    }
    self.emit('peer', peer);
    return peer;
};

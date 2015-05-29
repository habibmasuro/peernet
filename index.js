var inherits = require('inherits');
var has = require('has');
var defined = require('defined');
var isarray = require('isarray');
var once = require('once');

var sprintf = require('sprintf');
var concatMap = require('concat-map');

var through = require('through2');
var readonly = require('read-only-stream');
var lenpre = require('length-prefixed-stream');

var decoder = require('./lib/decoder.js');
var EventEmitter = require('events').EventEmitter;

var crypto = require('crypto');
function sha (buf) {
    return crypto.createHash('sha512').update(buf).digest();
}

var Peer = require('./lib/peer.js');
var randomPeers = require('./lib/random.js');

module.exports = Peernet;
inherits(Peernet, EventEmitter);

function Peernet (db, opts) {
    if (!(this instanceof Peernet)) return new Peernet(db, opts);
    var self = this;
    this.db = db;
    this._options = opts;
    this._id = crypto.randomBytes(16);
    this._transport = opts.transport;
    this._connections = {};
    this._ownAddress = {};
    
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
    var pending = 0;
    
    setInterval(function () {
        var needed = n - pending - self.connections().length;
        if (needed === 0) return;
        randomPeers(self.db, needed).pipe(through.obj(write));
    }, 5000);
    
    setInterval(function () {
        self._purge(10);
    }, 5000);
    
    function write (node, enc, next) {
        var addr = node.address.toString();
        if (has(self._ownAddress, addr)) return next();
        if (self.connections().indexOf(addr) < 0) {
            pending ++;
            self.connect(addr, function (err) {
                pending --;
            });
        }
        next();
    }
};

Peernet.prototype._getNodesLoop = function (ms, size) {
    var self = this;
    self.on('peer', function (peer) {
        var disconnected = false;
        var timeout = null;
        var nodes = [];
        var pending = 1;
        
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
            pending ++;
            
            self.db.get('rm!' + node.address.toString(), function (err, d) {
                // ignore "recently" removed nodes (in the past day)
                if (!err && Date.now() - d < 1000 * 60 * 60 * 24) {
                    self._debug('skipping previously removed node %s',
                        node.address
                    );
                }
                else nodes.push(node);
                if (-- pending === 0) done();
            })
            next();
        }
        function end (next) {
            if (-- pending === 0) done();
            next();
        }
        function done () {
            self.save(nodes, function (err) {
                if (err) self.emit('error', err);
                setTimeout(getNodes, ms);
            });
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
    peer.hello(function (err, id) {
        self._debug('HELLO %s', id.toString('hex')); 
        if (self._id.toString('hex') === id.toString('hex')) {
            // we've connected to ourself!
            self._debug('connected to own service');
            self._ownAddress[addr] = true;
            return c.destroy();
        }
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

Peernet.prototype.own = function (cb) {
    cb(null, Object.keys(this._ownAddress));
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
    var self = this;
    cb = once(cb || function () {});
    var keys = [], rms = [];
    var db = this.db;
    var pending = 1;
    
    nodes.forEach(function (node) {
        var key = sha(node.address).toString('hex');
        keys.push('addr!' + key);
        rms.push({ type: 'put', key: 'rm!' + key, value: Date.now() });
        pending += 2;
        
        var x = db.createReadStream({
            gt: 'stats!' + key + '!',
            lt: 'stats!' + key + '!~'
        });
        x.on('error', cb);
        x.pipe(through.obj(function (row, enc, next) {
            keys.push(row.key);
            next();
        }, done));
        
        var y = db.createReadStream({
            gt: 'con!' + key + '!',
            lt: 'con!' + key + '!~'
        });
        y.on('error', cb);
        y.pipe(through.obj(function (row, enc, next) {
            keys.push(row.key);
            next();
        }, done));
    });
    done();
    
    function done () {
        if (-- pending !== 0) return;
        var ops = keys.map(function (key) {
            return { type: 'del', key: key };
        }).concat(rms);
        db.batch(ops, function (err) {
            if (err) return cb(err);
            self._debug('removed %d nodes', keys.length);
            cb(null);
        });
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

Peernet.prototype._purge = function (n, cb) {
    var self = this;
    if (n === undefined) n = 50;
    var remove = [];
    var pending = 1;
    randomPeers(self.db, n).pipe(through.obj(write, end));
    
    function write (row, enc, next) {
        var addr = row.address.toString();
        pending ++;
        self.getStats(addr, function (err, stats) {
            if (err) return;
            var ok = stats.connections.ok;
            var fail = stats.connections.fail;
            var ratio = ok / (fail + ok);
            if (fail + ok > 0 && (ok === 0 || ratio < 0.2)) {
                remove.push({ address: addr });
            }
            if (--pending === 0) done();
        });
        next();
    }
    function end () { if (-- pending === 0) done() }
    function done () {
        if (remove.length) self.remove(remove, cb)
        else if (cb) cb(null)
    }
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
    
    function swrite (row, enc, next) {
        try { var value = JSON.parse(row.value) }
        catch (err) { return this.emit('error', err) }
        stats.nodes.rx += Number(value.rx) || 0;
        stats.nodes.tx += Number(value.tx) || 0;
        next();
    }
    function cwrite (row, enc, next) {
        try { var value = JSON.parse(row.value) }
        catch (err) { return this.emit('error', err) }
        stats.connections.ok += value.ok ? 1 : 0;
        stats.connections.fail += value.ok ? 0 : 1;
        next();
    }
    
    function done () {
        if (-- pending !== 0) return;
        cb(null, stats);
    }
};

Peernet.prototype.createStream = function (addr) {
    var self = this;
    var peer = new Peer(self.db, self._id);
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

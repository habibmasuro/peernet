var inherits = require('inherits');
var has = require('has');
var defined = require('defined');
var isarray = require('isarray');
var once = require('once');
var onend = require('end-of-stream');

var sprintf = require('sprintf');
var concatMap = require('concat-map');
var shuffle = require('shuffle-array');

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
    this._peers = {};
    this._ownAddress = {};
    this._recent = {};
    this._intervals = [];
    
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
    
    this._intervals.push(setInterval(function () {
        var needed = n - pending - self.connections().length;
        if (needed === 0) return;
        randomPeers(self.db, needed).pipe(through.obj(write));
    }, 5000));
    
    this._intervals.push(setInterval(function () {
        self._purge(10);
    }, 5000));
    
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

Peernet.prototype.close = function () {
    var self = this;
    self._intervals.forEach(function (iv) {
        clearInterval(iv);
    });
    self.connections().forEach(function (addr) {
        self.disconnect(addr);
    });
};

Peernet.prototype._getNodesLoop = function (ms, size) {
    var self = this;
    self.on('peer', function (peer) {
        var disconnected = false;
        var timeout = null;
        
        peer.once('disconnect', function () {
            disconnected = true;
            clearTimeout(timeout);
        });
        getNodes(peer, function f () {
            if (disconnected) return;
            timeout = setTimeout(function () {
                if (disconnected) return;
                getNodes(peer, f);
            }, ms);
        });
    });
    
    function getNodes (peer, cb) {
        self._debug('get nodes: %s', peer.address);
        
        var nodes = [];
        var pending = 1;
        peer.getNodes(size).pipe(through.obj(write, end));
        
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
                cb();
            });
        }
    }
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
    var hello = false;
    
    this._connections[addr] = c;
    
    var peer = this.createStream(addr);
    peer.on('hello-reply', function (id) {
        self.emit('hello-reply', id);
    });
    peer.on('hello-request', function (hello) {
        self.emit('hello-request', hello);
    });
    
    peer.hello(addr, function (err, id) {
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
    c.once('error', cb);
    onend(c, onclose);
    
    c.once('connect', function () {
        self._debug('connected: %s', addr);
        self.emit('connect', peer);
        peer.emit('connect');
        cb(null, cb);
    });
    return peer;
    
    function onclose () {
        if (!hello) {
            self._logConnection(addr, { ok: false });
        }
        delete self._connections[addr];
        delete self._peers[addr];
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

Peernet.prototype.join = function (subnets, cb) {
    if (!isarray(subnets)) subnets = [ subnets ];
    this.db.batch(concatMap(subnets, function (subnet) {
        return [
            {
                type: 'put',
                key: 'subnet!' + subnet,
                value: 0
            },
            {
                type: 'put',
                key: 'subhash!' + sha(subnet).toString('hex'),
                value: subnet
            },
        ];
    }), cb);
};

Peernet.prototype.part = function (subnets, cb) {
    if (!isarray(subnets)) subnets = [ subnets ];
    this.db.batch(concatMap(subnets, function (subnet) {
        return [
            {
                type: 'del',
                key: 'subnet!' + subnet
            },
            {
                type: 'del',
                key: 'subhash!' + sha(subnet).toString('hex')
            },
        ];
    }), cb);
};

Peernet.prototype.subnets = function (cb) {
    var r = this.db.createReadStream({ gt: 'subnet!', lt: 'subnet!~' });
    return readonly(r.pipe(through.obj(write)));
    
    function write (row, enc, next) {
        this.push({ key: row.key.split('!')[1] });
        next();
    }
};

Peernet.prototype.search = function (subnet) {
    var self = this;
    var output = through.obj();
    var hkey = sha(subnet);
    Object.keys(self._peers).forEach(function (key) {
        var peer = self._peers[key];
        peer.search(hkey).pipe(output, { end: false });
    });
    return readonly(output);
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
    if (!isarray(nodes)) nodes = [nodes];
    this.db.batch(concatMap(nodes, function (node) {
        if (typeof node === 'string') node = { address: node };
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
    var peer = new Peer(self.db, self._id, addr, {
        recent: self._recent
    });
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
    else {
        addr = crypto.randomBytes(16).toString('hex');
    }
    self._peers[addr] = peer;
    onend(peer, function () { delete self._peers[addr] });
    
    peer.on('debug', function () {
        self._debug.apply(self, arguments);
    });
    peer.on('search', function (hash, hops, fn) {
        var keys = Object.keys(self._peers).filter(function (key) {
            return key !== addr;
        });
        shuffle(keys).slice(0,3).forEach(function (key) {
            self._peers[key].search(hash, hops + 1).pipe(through.obj(
                function (row, enc, next) {
                    fn(row);
                    next();
                }
            ));
        });
    });
    
    self.emit('peer', peer);
    return peer;
};

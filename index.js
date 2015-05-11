var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var lenpre = require('length-prefixed-stream');
var through = require('through2');
var duplexer = require('duplexer2');
var isarray = require('isarray');
var sprintf = require('sprintf');
var has = require('has');
var crypto = require('crypto');
var concatMap = require('concat-map');

var memdown = require('memdown');
var levelup = require('levelup');

var protobuf = require('protocol-buffers');
var fs = require('fs');
var decoder = protobuf(fs.readFileSync(__dirname + '/proto/rpc.proto'));

module.exports = Peernet;
inherits(Peernet, EventEmitter);

function Peernet (db, opts) {
    if (!(this instanceof Peernet)) return new Peernet(db, opts);
    var self = this;
    this.db = db;
    this._options = opts;
    this._transport = opts.transport;
    this._streams = {};
    this._connections = {};
    this._ids = {};
    if (!opts.debug) this._debug = function () {};
    
    var bootstrap = opts.bootstrap || [];
    if (!isarray(bootstrap)) bootstrap = [ bootstrap ];
    bootstrap.forEach(function (b) { self.connect(b) });
}

Peernet.prototype._debug = function () {
    console.error(sprintf.apply(null, arguments));
};

Peernet.prototype.getNodes = function (addr, size, opts) {
    if (!opts) opts = {};
    var id = this._ids[addr] ++;
    this._streams[addr].write(decoder.Message.encode({
        request: {
            id: id,
            node: {
                size: size,
                follow: Boolean(opts.follow)
            }
        }
    }));
    var res = new EventEmitter;
    this._response[id] = res;
    return res;
};

Peernet.prototype.advertise = function (addr) {
    // ...
};

Peernet.prototype.search = function (addr, hash, hops) {
    this._streams[addr].write(decoder.Message.encode({
        request: {
            id: this._ids[addr] ++,
            search: {
                hash: hash,
                hops: hops || 0
            }
        }
    }));
};

Peernet.prototype.connect = function (addr) {
    var self = this;
    var c = this._transport(addr);
    var closed = false;
    this._connections[addr] = c;
    c.pipe(this.createStream(addr)).pipe(c);
    c.once('error', onend);
    c.once('end', onend);
    
    c.once('connect', function () {
        self.emit('connect', addr, e);
        e.emit('connect');
    });
    
    var e = new EventEmitter;
    return e;
    
    function onend () {
        if (closed) return;
        closed = true;
        if (c.destroy) c.destroy();
        self.emit('disconnect', addr, e);
        e.emit('disconnect');
    }
};

Peernet.prototype._saveNodes = function (nodes, cb) {
    this.db.batch(concatMap(nodes, function (node) {
        return [
            {
                type: 'put',
                key: 'node!',
                value: ''
            },
            {
                type: 'put',
                key: 'node!',
                value: ''
            },
            {
                type: 'put',
                key: 'node!',
                value: ''
            }
        ]
    }), cb);
};

Peernet.prototype.createStream = function (id) {
    var self = this;
    var input = lenpre.decode();
    if (!id) id = crypto.randomBytes(16).toString('hex');
    input.pipe(through(write, end));
    self._ids[id] = 0;
    
    var closed = false;
    var output = lenpre.encode();
    self._streams[id] = output;
    
    var dup = duplexer(input, output);
    return dup;
    
    function write (buf, enc, next) {
        if (closed) return;
        try { var msg = decoder.Message.decode(buf) }
        catch (err) {
            self._debug('decoder error: ' + err);
            return destroy()
        }
        
        if (msg.request && msg.request.close) {
            throw new Error('todo: close request');
        }
        else if (msg.request && msg.request.node) {
            self.db.createReadStream({
                gt: 'node!',
                lt: 'node!',
                limit: msg.request.node.limit,
            });
            throw new Error('todo: node request');
        }
        else if (msg.request && msg.request.search) {
            throw new Error('todo: search request');
        }
        else if (msg.response && msg.response.node) {
            throw new Error('todo: response request');
        }
        next();
    }
    
    function end () {}
    function destroy () {
        closed = true;
    }
};

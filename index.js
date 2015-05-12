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
var readonly = require('read-only-stream');

function sha (buf) { return crypto.createHash('sha512').update(buf).digest() }

var memdown = require('memdown');
var levelup = require('levelup');

var protobuf = require('protocol-buffers');
var fs = require('fs');
var decoder = protobuf(fs.readFileSync(__dirname + '/proto/rpc.proto'));

var ring = require('./lib/ring.js');

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
    this._response = {};
    
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
    var res = through.obj();
    this._response[id] = res;
    return readonly(res);
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
    this.db.batch(concatMap(nodes, function (addr) {
        var key = sha(addr);
        return [
            {
                type: 'put',
                key: 'addr!' + key,
                value: node.address
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
            var rhex = Math.floor(Math.random() * 16).toString(16);
            var r = ring(self.db, {
                first: 'addr!',
                ge: 'addr!' + rhex,
                limit: msg.request.node.limit,
            });
            r.pipe(through.obj(
                function (addr, enc, next) {
                    output.write(decoder.Message.encode({
                        response: {
                            id: msg.request.id,
                            node: { address: addr }
                        }
                    }));
                    next();
                },
                function (next) {
                    output.write(decoder.Message.encode({
                        response: {
                            id: msg.request.id,
                            close: true
                        }
                    }));
                    next();
                }
            ));
            //throw new Error('todo: node request');
        }
        else if (msg.request && msg.request.search) {
            throw new Error('todo: search request');
        }
        else if (msg.response && has(self._response, msg.response.id)
        && msg.response.node) {
            self._response[msg.response.id].write({
                address: msg.response.address
            });
        }
        else if (msg.response && has(self._response, msg.response.id)
        && msg.response.search) {
            throw new Error('todo: search response');
        }
        else if (msg.response && has(self._response, msg.response.id)
        && msg.response.close) {
            self._response[msg.response.id].end();
        }
        else if (msg.response) {
            self._debug('response %d not open', msg.response.id);
            destroy();
        }
        next();
    }
    
    function end () {}
    function destroy () {
        closed = true;
        if (dup.destroy) dup.destroy();
    }
};

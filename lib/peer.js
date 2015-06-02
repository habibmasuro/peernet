var inherits = require('inherits');
var Duplex = require('readable-stream').Duplex;
var lenpre = require('length-prefixed-stream');
var through = require('through2');
var has = require('has');
var defined = require('defined');
var readonly = require('read-only-stream');

var decoder = require('./decoder.js');
var randomPeers = require('./random.js');

module.exports = Peer;
inherits(Peer, Duplex);

function Peer (db, id, addr) {
    if (!(this instanceof Peer)) return new Peer(db, id, addr);
    Duplex.call(this);
    var self = this;
    this.db = db;
    this._seq = 0;
    this._id = id;
    this._response = {};
    this._decode = lenpre.decode();
    this._encode = lenpre.encode();
    this.address = defined(addr, null);
    
    this._reading = false;
    this._encode.on('readable', function () {
        if (self._reading) self._read();
    });
    this._decode.pipe(through(function (buf, enc, next) {
        try { var msg = decoder.Message.decode(buf) }
        catch (err) { return self.emit('error', err) }
        self._handle(msg, function (err) {
            if (err) self.emit('error', err)
            else next()
        });
    }));
}

Peer.prototype._pushMessage = function (msg) {
    try { var buf = decoder.Message.encode(msg) }
    catch (err) { this.emit('error', err) }
    
    if (!buf || buf.length === 0) {
        this.emit('error', new Error('invalid message'));
    }
    this._encode.write(buf);
};

Peer.prototype._read = function (n) {
    var buf = this._encode.read();
    if (buf === null) {
        this._reading = true;
    }
    else this.push(buf)
};

Peer.prototype._write = function (buf, enc, next) {
    return this._decode._write(buf, enc, next);
};

Peer.prototype.getNodes = function (size, opts) {
    var self = this;
    if (!opts) opts = {};
    var seq = this._seq ++;
    
    this._pushMessage({
        request: {
            seq: seq,
            node: {
                size: size,
                follow: Boolean(opts.follow)
            }
        }
    });
    var res = through.obj(write, end);
    this._response[seq] = res;
    return readonly(res);
    
    function write (node, enc, next) {
        self.emit('node', node);
        this.push(node);
        next();
    }
    function end (next) {
        delete self._response[seq];
        next();
    }
};

Peer.prototype.hello = function (addr, cb) {
    if (!cb) cb = function () {};
    if (typeof addr === 'function') {
        cb = addr;
        addr = undefined;
    }
    var self = this;
    if (!self.address) self.address = addr;
    var seq = this._seq ++;
    this._pushMessage({
        request: {
            seq: seq,
            hello: { address: addr }
        }
    });
    this._response[seq] = function (err, hello) {
        self.emit('hello-reply', hello);
        if (err) cb(err)
        else cb(null, hello.id)
        delete self._response[seq];
    };
};

Peer.prototype.search = function (hash, hops) {
    var self = this;
    var seq = this._seq ++;
    if (!Buffer.isBuffer(hash)) hash = Buffer(hash);
    
    var res = through.obj({}, null, function (next) {
        delete self._response[seq];
    });
    
    self._response[seq] = res;
    self._pushMessage({
        request: {
            seq: seq,
            search: {
                hash: hash,
                hops: hops || 0
            }
        }
    });
    return readonly(res);
};

Peer.prototype._handle = function (msg, next) {
    var self = this;
    if (msg.request && msg.request.close) {
        throw new Error('todo: close request');
    }
    else if (msg.request && msg.request.node) {
        randomPeers(self.db, msg.request.node.size)
            .pipe(through.obj(write, end))
        ;
        function write (row, enc, next) {
            var res = { seq: msg.request.seq, node: row };
            self._pushMessage({ response: res });
            next();
        }
        function end (next) {
            var res = { seq: msg.request.seq, close: {} };
            self._pushMessage({ response: res });
            next();
        }
    }
    else if (msg.request && msg.request.search) {
        // can't respond if we don't know our own address
        if (!self.address) return next();
        var s = msg.request.search;
        
        var hkey = s.hash.toString('hex')
        self.db.get('subhash!' + hkey, function (err) {
            if (err) return;
            self._pushMessage({
                response: {
                    seq: msg.request.seq,
                    search: {
                        hash: s.hash,
                        address: self.address,
                        hops: 0
                    }
                }
            });
        });
        
        if (s.hops < 15) {
            self.emit('debug', 'forwarding search request %d', s.hops);
            self.emit('search', s.hash, s.hops, function (res) {
                self._pushMessage({
                    request: {
                        seq: msg.request.seq,
                        search: res
                    }
                });
            });
        }
    }
    else if (msg.request && msg.request.hello) {
        self._pushMessage({
            response: {
                seq: msg.request.seq,
                hello: { id: self._id }
            }
        });
        self.emit('hello-request', msg.request.hello);
    }
    else if (msg.response && has(self._response, msg.response.seq)
    && msg.response.node) {
        self._response[msg.response.seq].write({
            address: msg.response.node.address
        });
    }
    else if (msg.response && has(self._response, msg.response.seq)
    && msg.response.search) {
        if (msg.response.search.hops >= 15) {
            self.debug('debug', 'discarding message: hop count too high');
            return next();
        }
        self._response[msg.response.seq].write(msg.response.search);
    }
    else if (msg.response && has(self._response, msg.response.seq)
    && msg.response.close) {
        self._response[msg.response.seq].end();
    }
    else if (msg.response && has(self._response, msg.response.seq)
    && msg.response.hello) {
        self._response[msg.response.seq](null, msg.response.hello);
    }
    else if (msg.response) {
        self.emit('debug', 'response %d not open', msg.response.seq);
    }
    next();
};

var inherits = require('inherits');
var Duplex = require('readable-stream').Duplex;
var lenpre = require('length-prefixed-stream');
var through = require('through2');
var has = require('has');
var readonly = require('read-only-stream');

var protobuf = require('protocol-buffers');
var fs = require('fs');
var decoder = protobuf(fs.readFileSync(__dirname + '/../proto/rpc.proto'));
var ring = require('./ring.js');

module.exports = Peer;
inherits(Peer, Duplex);

function Peer (db, raddr) {
    if (!(this instanceof Peer)) return new Peer(db, raddr);
    Duplex.call(this);
    var self = this;
    this.db = db;
    this._seq = 0;
    this._remoteAddress = raddr;
    this._response = {};
    this._decode = lenpre.decode();
    this._encode = lenpre.encode();
    
    this._encode.on('readable', function () {
        self.emit('readable');
    });
    
    this._decode.pipe(through(function (buf, enc, next) {
        try { var msg = decoder.Message.decode(buf) }
        catch (err) { return self.emit('error', err) }
        self._handle(msg, next);
    }));
}

Peer.prototype._pushMessage = function (msg) {
    this._encode.write(decoder.Message.encode(msg));
};

Peer.prototype._read = function (n) {
    return this._encode.read(n);
};

Peer.prototype._write = function (buf, enc, next) {
    return this._decode._write(buf, enc, next);
};

Peer.prototype.getNodes = function (size, opts) {
    var self = this;
    if (!opts) opts = {};
    var seq = this._seq ++;
    
    this._pushMessage({
        seq: seq,
        node: {
            size: size,
            follow: Boolean(opts.follow)
        }
    });
    var res = through.obj({}, null, function (next) {
        delete self._response[seq];
        next();
    });
    this._response[seq] = res;
    return readonly(res);
};

Peer.prototype.hello = function (addr, cb) {
    if (typeof addr === 'function') {
        cb = addr;
        addr = undefined;
    }
    var self = this;
    var seq = this._seq ++;
    this._pushMessage({
        request: {
            seq: seq,
            hello: { address: this.remoteAddress }
        }
    });
    this._response[seq] = function (err, hello) {
        self.emit('hello-reply', hello);
        if (cb) cb();
        delete self._response[seq];
    };
};

Peer.prototype.search = function (hash, hops) {
    var seq = this._seq ++;
    this._pushMessage({
        request: {
            seq: seq,
            search: {
                hash: hash,
                hops: hops || 0
            }
        }
    });
    var res = through.obj({}, null, function (next) {
        delete self._response[seq];
    });
    self._response[seq] = res;
    return readonly(res);
};

Peer.prototype._handle = function (msg, next) {
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
            function (row, enc, next) {
                self._pushMessage({
                    seq: msg.request.seq,
                    response: {
                        seq: msg.request.seq,
                        node: row.address
                    }
                });
                next();
            },
            function (next) {
                self._pushMessage({
                    response: {
                        seq: msg.request.seq,
                        close: {}
                    }
                });
                next();
            }
        ));
        //throw new Error('todo: node request');
    }
    else if (msg.request && msg.request.search) {
        throw new Error('todo: search request');
    }
    else if (msg.request && msg.request.hello) {
        self._pushMessage({
            response: { hello: {} }
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
        throw new Error('todo: search response');
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
        self._debug('response %d not open', msg.response.seq);
    }
    next();
};

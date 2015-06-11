var inherits = require('inherits');
var Duplex = require('readable-stream').Duplex;
var lenpre = require('length-prefixed-stream');
var through = require('through2');
var has = require('has');
var defined = require('defined');
var readonly = require('read-only-stream');
var crypto = require('crypto');
var xtend = require('xtend');

var decoder = require('./decoder.js');
var randomPeers = require('./random.js');

module.exports = Peer;
inherits(Peer, Duplex);

function sha (buf) {
    return crypto.createHash('sha512').update(buf).digest();
}

function Peer (db, id, opts) {
    if (!(this instanceof Peer)) return new Peer(db, id, opts);
    Duplex.call(this);
    var self = this;
    if (!opts) opts = {};
    this.setMaxListeners(0);
    this.db = db;
    this._id = id;
    this._response = {};
    this._recent = defined(opts.recent, {});
    this._decode = lenpre.decode();
    this._encode = lenpre.encode();
    this._maxhops = defined(opts.maxhops, 15);
    
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
        this.emit('error', new Error('invalid message: '
            + JSON.stringify(msg))
        );
    }
    else this._encode.write(buf);
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

Peer.prototype.getNodes = function (opts) {
    var self = this;
    if (!opts) opts = {};
    self._pushMessage({
        request: {
            id: crypto.randomBytes(4),
            type: '_addrs',
            hops: 0,
            data: JSON.stringify({ size: defined(opts.size, 10) }),
            limit: defined(opts.limit, 1)
        }
    });
    var res = through.obj(write, end);
    self._response[seq] = res;
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

Peer.prototype.hello = function (cb) {
    if (!cb) cb = function () {};
    var self = this;
    var id = crypto.randomBytes(4);
    self._pushMessage({
        request: {
            id: crypto.randomBytes(4),
            type: 'hello',
            hops: 0,
            data: self._id
        }
    });
    var hexid = id.toString('hex');
    self._response[hexid] = function (err, hello) {
        if (err) cb(err)
        else cb(null, hello.id)
        delete self._response[hexid];
    };
};

Peer.prototype.announce = function (opts) {
    var self = this;
    var id = opts.id || crypto.randomBytes(4);
    if (!Buffer.isBuffer(id)) id = Buffer(id);
    var hexid = id.toString('hex');
    
    var res = through.obj({}, null, function (next) {
        delete self._response[hexid];
    });
    self._response[hexid] = res;
    self._pushMessage({
        request: {
            id: id,
            type: opts.type,
            hops: defined(opts.hops, 0),
            data: opts.data,
            limit: opts.limit
        }
    });
    return readonly(res);
};

Peer.prototype._handle = function (msg, next) {
    var self = this;
    var req = msg.request, res = msg.response;
    
    if (req && req.id.length > 64) {
        self._debug('discarding request: id too long (%d bytes)',
            req.id.length);
        return next();
    }
    if (req && req.type && req.type.length > 64) {
        self._debug('discarding request: type too long (%d bytes)',
            req.type.length);
        return next();
    }
    if (req && req.data && req.data.length > 1024) {
        self._debug('discarding request: data too long (%d bytes)',
            req.data.length);
        return next();
    }
    if (req && req.hops > self._maxhops) {
        self._debug('discarding request: too many hops (%d)', req.hops);
        return next();
    }
    if (req && req.limit && req.hops > req.limit) {
        self._debug('discarding request: too many hops (%d)', req.hops);
        return next();
    }
    if (res && res.id.length > 64) {
        self._debug('discarding response: id too long (%d bytes)',
            res.id.length);
        return next();
    }
    if (res && res.data && res.data.length > 64) {
        self._debug('discarding response: data too long (%d bytes)',
            res.data.length);
        return next();
    }
    if (res && res.type && res.type.length > 64) {
        self._debug('discarding response: type too long (%d bytes)',
            res.type.length);
        return next();
    }
    if (req && has(self._recent, req.id)) {
        self.emit('debug', 'discarding recently seen message %s', req.id);
        return next();
    }
    if (res && has(self._recent, res.id)) {
        self.emit('debug', 'discarding recently seen message %s', res.id);
        return next();
    }
    
    if (req) self._recent[req.id] = Date.now();
    if (res) self._recent[res.id] = Date.now();
    
    if (req && req.type === '_hello') {
        self._pushMessage({
            response: {
                id: req.id,
                type: '_hello',
                hops: 0,
                data: self._id
            }
        });
    }
    else if (req && req.type === '_addrs') {
        var opts = {};
        if (req.data && req.data.length) {
            try { opts = JSON.parse(req.data) }
            catch (err) {}
        }
        randomPeers(self.db, opts)
            .pipe(through.obj(addrwrite))
        ;
        function addrwrite (row, enc, next) {
            self._pushMessage({
                response: {
                    id: req.id,
                    type: '_addrs',
                    hops: 0,
                    data: row.value,
                    limit: req.limit
                }
            });
            next();
        }
    }
    
    if (res && has(self._response, res.id)) {
        self._response[res.id].write(res);
    }
    else if (res) {
        self.emit('debug', 'response %d not open', res.id);
    }
    
    if (req) {
        var reply = function (data) {
            self._pushMessage({
                response: xtend(res, {
                    hops: 0,
                    data: data
                })
            });
        };
        self.emit('request', req, reply);
        if (req.type) self.emit('request:' + req.type, req, reply);
    }
    else if (res) {
        self.emit('response', res);
    }
    next();
};

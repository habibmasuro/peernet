var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var lenpre = require('length-prefixed-stream');
var through = require('through2');
var duplexer = require('duplexer2');
var isarray = require('isarray');
var sprintf = require('sprintf');
var has = require('has');

var protobuf = require('protocol-buffers');
var fs = require('fs');
var decoder = protobuf(fs.readFileSync(__dirname + '/proto/rpc.proto'));

module.exports = Peernet;
inherits(Peernet, EventEmitter);

function Peernet (opts) {
    if (!(this instanceof Peernet)) return new Peernet(opts);
    var self = this;
    self.db = opts.db;
    self._id = 0;
    self._advertised = {};
    self._output = {};
    self._known = {};
    self._transport = opts.transport;
    if (!opts.debug) self._debug = function () {};
    
    var hrefs = opts.bootstrap || [];
    if (!isarray(hrefs)) hrefs = [ hrefs ];
    hrefs.forEach(function (href) {
        self.connect(href);
    });
}

Peernet.prototype.connect = function (href) {
    var c = this._connect(href);
    c.pipe(this.createStream(href)).pipe(c);
};

Peernet.prototype.connections = function () {
    var self = this;
    return Object.keys(self._output).map(function (id) {
        return self._output[id].href;
    });
};

Peernet.prototype._connect = function (href) {
    var self = this;
    var c = self._transport(href);
    var retrying = false;
    c.once('error', retry);
    c.once('close', retry);
    var m = self._known[href];
    return c;
    
    function retry () {
        if (retrying) return;
        retrying = true;
        delete self._known[href];
        // retry race between a new connection
        // and the previously working connection
        setTimeout(retry_, 1000);
    }
    function retry_ () {
        var c0 = self._connect(href);
        var done = false;
        c0.pipe(self.createStream(href)).pipe(c);
        c0.once('data', function () {
            if (done) return c0.destroy();
            done = true;
            self._known[href] = m;
        });
        c0.once('error', function () {
            if (done) return;
            done = true;
            retry();
        });
        
        var keys = Object.keys(self._known).filter(function (key) {
            return key !== href;
        });
        if (keys.length) {
            var key = keys[Math.floor(Math.random() * keys.length)];
            var c1 = self._connect(key);
            c1.pipe(self.createStream(key)).pipe(c);
            c1.once('data', function () {
                if (done) return c1.destroy();
                done = true;
            });
            c1.once('error', function () {
                if (done) return;
                done = true;
            });
        }
    }
};

Peernet.prototype._debug = function () {
    console.error(sprintf.apply(null, arguments));
};

Peernet.prototype.advertise = function (ref) {
    var self = this;
    self._advertised[ref] = true;
    Object.keys(self._output).forEach(function (id) {
        self._announce(id, 0, ref);
    });
};

Peernet.prototype._announce = function (id, hops, ref) {
    if (!this._output[id]) return;
    this._output[id].write({
        type: decoder.MsgType.ANNOUNCE,
        hops: hops,
        payload: ref
    });
};

Peernet.prototype.createStream = function (href) {
    var self = this;
    var id = self._id ++;
    var timeout = setTimeout(expire, 15*1000);
    
    var iv = setInterval(function () {
        var keys = Object.keys(self._known);
        var key = keys[Math.floor(Math.random() * keys.length)];
        var m = self._known[key];
        if (!m) return;
        self._announce(id, m.hops + 1, m.payload)
    }, 5000);
    
    self._output[id] = through.obj(function (msg, enc, next) {
        this.push(decoder.Msg.encode(msg));
        next();
    });
    self._output[id].href = href;
    
    Object.keys(self._advertised).forEach(function (key) {
        self._announce(id, 0, key);
    });
    
    var input = lenpre.decode();
    input.pipe(through(write, end));
    
    var closed = false;
    var output = lenpre.encode();
    self._output[id].pipe(output);
    var dup = duplexer(input, output);
    return dup;
    
    function write (buf, enc, next) {
        if (closed) return;
        reset();
        try { var msg = decoder.Msg.decode(buf) }
        catch (err) { return expire() }
        
        if (msg.type === decoder.MsgType.ANNOUNCE) {
            var ref = msg.payload.toString();
            if (!has(self._known, ref)) {
                if (msg.hops <= 10) {
                    Object.keys(self._output).forEach(function (key) {
                        if (Number(key) === id) return;
                        self._announce(id, msg.hops + 1, ref);
                    });
                }
                self._known[ref] = msg;
            }
            else {
                self._known[ref].hops = Math.min(
                    msg.hops, self._known[ref].hops
                );
            }
            self._debug('announce: { hops: %d, ref: %s }', msg.hops, ref);
        }
        next();
    }
    
    function end () { expire() }
    
    function expire () {
        if (closed) return;
        clearInterval(iv);
        delete self._output[id];
        closed = true;
        dup.emit('close');
    }
    
    function reset () {
        clearTimeout(timeout);
        timeout = setTimeout(expire, 15*1000);
    }
};

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
        var c = self._connect(href);
        c.pipe(self.createStream()).pipe(c);
    });
}

Peernet.prototype._connect = function (href) {
    var c = this._transport(href);
    c.once('close', function () {
        
    });
    return c;
};

Peernet.prototype._next = function () {
    self.store
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
    this._output[id].write({
        type: decoder.MsgType.ANNOUNCE,
        hops: hops,
        payload: ref
    });
};

Peernet.prototype.createStream = function () {
    var self = this;
    var id = self._id ++;
    var timeout = setTimeout(expire, 15*1000);
    
    setInterval(function () {
        var keys = Object.keys(self._known);
        var key = keys[Math.floor(Math.random() * keys.length)];
        var m = self._known[key];
        self._announce(id, m.hops + 1, m.payload)
    }, 5000);
    
    self._output[id] = through.obj(function (msg, enc, next) {
        this.push(decoder.Msg.encode(msg));
        next();
    });
    
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
        var msg = decoder.Msg.decode(buf);
        if (msg.type === decoder.MsgType.ANNOUNCE) {
            if (!has(self._known, msg.payload)) {
                if (msg.hops <= 10) {
                    Object.keys(self._output).forEach(function (key) {
                        if (Number(key) === id) return;
                        self._announce(id, msg.hops + 1, msg.payload);
                    });
                }
                self._known[msg.payload] = msg;
            }
            else {
                self._known[msg.payload].hops = Math.min(
                    msg.hops, self._known[msg.payload].hops
                );
            }
            self._debug('announce: %s', JSON.stringify(msg));
        }
        next();
    }
    
    function end () { expire() }
    
    function expire () {
        if (closed) return;
        delete self._output[id];
        closed = true;
        dup.emit('close');
    }
    
    function reset () {
        clearTimeout(timeout);
        timeout = setTimeout(expire, 15*1000);
    }
};

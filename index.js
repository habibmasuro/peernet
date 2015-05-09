var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var lenpre = require('length-prefixed-stream');
var through = require('through2');
var duplexer = require('duplexer2');
var isarray = require('isarray');

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
    self._transport = opts.transport;
    
    var hrefs = opts.bootstrap || [];
    if (!isarray(hrefs)) hrefs = [ hrefs ];
    hrefs.forEach(function (href) {
        var c = self.connect(href);
        c.pipe(self.createStream()).pipe(c);
    });
}

Peernet.prototype.connect = function (href) {
    return this._transport(href);
};

Peernet.prototype.advertise = function (ref) {
    var self = this;
    self._advertised[ref] = true;
    Object.keys(self._output).forEach(function (id) {
        self._announce(id, ref);
    });
};

Peernet.prototype._announce = function (id, ref) {
    this._output[id].write({
        //type: 'ANNOUNCE',
        type: decoder.MsgType.ANNOUNCE,
        hops: 0,
        payload: ref
    });
};

Peernet.prototype.createStream = function () {
    var self = this;
    var id = self._id ++;
    self._output[id] = through.obj(function (msg, enc, next) {
        this.push(decoder.Msg.encode(msg));
        next();
    });
    
    Object.keys(self._advertised).forEach(function (key) {
        self._announce(id, key);
    });
    
    var input = lenpre.decode();
    input.pipe(through(write, end));
    
    var output = lenpre.encode();
    self._output[id].pipe(output);
    return duplexer(input, output);
    
    function write (buf, enc, next) {
        var msg = decoder.Msg.decode(buf);
        console.log('msg=', msg);
        next();
    }
    function end () {}
};

var ring = require('./ring.js');
var decoder = require('./decoder.js');
var through = require('through2');
var readonly = require('read-only-stream');
var randomBytes = require('crypto').randomBytes;

module.exports = function (db, size) {
    var rhex = randomBytes(32).toString('hex');
    var r = ring(db, {
        first: 'addr!',
        ge: 'addr!' + rhex,
        limit: 1
    });
    var output = r.pipe(through.obj(write));
    r.on('error', function (err) { output.emit('error', err) });
    return readonly(output);
    
    function write (buf, enc, next) {
        try { var row = decoder.NodeResponse.decode(buf) }
        catch (err) { return next(err) }
        if (!row) return next(new Error('corrupt address data'));
        this.push(row);
        next();
    }
};

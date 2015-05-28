var ring = require('./ring.js');
var decoder = require('./decoder.js');
var through = require('through2');
var readonly = require('read-only-stream');
var randomBytes = require('crypto').randomBytes;

module.exports = function (db, size) {
    var output = through.obj();
    get();
    return readonly(output);
    
    function get () {
        var rhex = randomBytes(32).toString('hex');
        var r = ring(db, {
            first: 'addr!',
            ge: 'addr!' + rhex,
            limit: 1
        });
        var count = 0;
        r.on('error', function (err) { output.emit('error', err) });
        r.pipe(through.obj(write, end));
        
        function write (buf, enc, next) {
            count ++;
            try { var row = decoder.NodeResponse.decode(buf) }
            catch (err) { return next(err) }
            if (!row) return next(new Error('corrupt address data'));
            size --;
            output.write(row);
            next();
        }
        function end (next) {
            if (count > 0 && size > 0) get();
            else output.end();
            next();
        }
    }
};

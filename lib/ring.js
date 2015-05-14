var through = require('through2');
var readonly = require('read-only-stream');

module.exports = function (db, opts) {
    var r = db.createReadStream({
        ge: opts.ge,
        gt: opts.gt,
        lt: opts.first + '~',
        limit: opts.limit,
        valueEncoding: 'json'
    });
    var firstkey = null;
    var n0 = 0;
    var n1 = 0;
    var r = readonly(r.pipe(through.obj(write, end)));
    return r;
    
    function write (row, enc, next) {
        if (n0 === 0) firstkey = row.key;
        n0 ++;
        this.push(row.value);
        next();
    }
    
    function end (next) {
        if (n0 === opts.limit) return next();
        var r = db.createReadStream({
            ge: opts.first,
            lt: opts.first + '~',
            limit: opts.limit - n0,
            valueEncoding: 'json'
        });
        r.pipe(through.obj(nwrite));
    }
    
    function nwrite (row, enc, next) {
        if (n1 === 0 && row.key === firstkey) return this.push(null);
        n1 ++;
        this.push(row.value);
        next();
    }
};

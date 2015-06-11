var ring = require('./ring.js');
var randomBytes = require('crypto').randomBytes;
var defined = require('defined');

module.exports = function (db, opts) {
    if (!opts) opts = {};
    var rhex = randomBytes(32).toString('hex');
    return ring(db, {
        first: 'addr!',
        gte: 'addr!' + rhex,
        limit: defined(opts.limit, 10)
    });
};

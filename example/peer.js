var level = require('level-browserify');
var db = level('./peer.db', { valueEncoding: 'binary' });
var wsock = require('websocket-stream');

var peernet = require('../');
var pn = peernet(db, {
    transport: require('../transport.js'),
    debug: true
});
pn.save([ 'ws://localhost:39183', 'ws://localhost:33085' ]);

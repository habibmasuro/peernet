var level = require('level-browserify');
var db = level('/tmp/' + Math.random(), { valueEncoding: 'binary' });
var wsock = require('websocket-stream');

var peernet = require('../');
var pn = peernet(db, {
    transport: require('../transport.js')(),
    debug: true
});
pn.save([ 'ws://localhost:5001', 'ws://localhost:5002' ]);

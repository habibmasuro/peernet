var level = require('level-browserify');
var db = level('/tmp/peernet-' + Math.random(), { valueEncoding: 'binary' });
var wsock = require('websocket-stream');

var peernet = require('../');
var pn = peernet(db, {
    transport: require('../transport.js')(),
    debug: true
});

var http = require('http');
var wsock = require('websocket-stream');
var server = http.createServer(function (req, res) { res.end() });
server.listen(Number(process.argv[2]));

wsock.createServer({ server: server }, function (stream) {
    stream.pipe(pn.createStream()).pipe(stream);
});

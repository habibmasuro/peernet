var level = require('level');
var db = level('./peer.db');

var peernet = require('../');
var pn = peernet(db, {
    transport: require('../transport.js'),
    debug: true
});

var http = require('http');
var server = http.createServer(function (req, res) { res.end('...\n') });
server.listen(argv.port, function () {
    console.log('listening on ' + server.address().port);
});

var wsock = require('websocket-stream');
wsock.createServer({ server: server }, function (stream) {
    stream.pipe(pn.createStream()).pipe(stream);
});

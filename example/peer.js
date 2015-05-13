var http = require('http');
var wrtc = require('wrtc');
var wsock = require('websocket-stream');
var minimist = require('minimist');

var argv = minimist(process.argv.slice(2), {
    alias: { p: 'port', b: 'bootstrap', d: 'debug' },
    default: { port: 0 }
});
var level = require('level');
var db = level(argv.db);

var peernet = require('../');
var pn = peernet(db, {
    bootstrap: argv.bootstrap,
    debug: argv.debug,
    transport: require('../lib/transport.js')
});

pn.on('peer', function (peer) {
    console.log('connected', peer.address);
    var iv = setInterval(function () {
        peer.getNodes(10).on('data', function (node) {
            console.log('got node:', node);
        });
    }, 1 * 1000);
    peer.once('disconnect', function () {
        console.log('disconnected', peer.address);
        clearInterval(iv);
    });
});

var server = http.createServer(function (req, res) { res.end('...\n') });
server.listen(argv.port, function () {
    console.log('listening on ' + server.address().port);
});

wsock.createServer({ server: server }, function (stream) {
    var addr = stream.socket.upgradeReq.socket.remoteAddress;
    stream.pipe(pn.createStream(addr)).pipe(stream);
});

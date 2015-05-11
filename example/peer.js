var http = require('http');
var wrtc = require('wrtc');
var wsock = require('websocket-stream');
var minimist = require('minimist');

var argv = minimist(process.argv.slice(2), {
    alias: { p: 'port', b: 'bootstrap', d: 'debug' },
    default: { port: 0 }
});

var peernet = require('../');
var pn = peernet(null, {
    bootstrap: argv.bootstrap,
    debug: argv.debug,
    transport: require('../lib/transport.js')
});

pn.on('connect', function (addr, c) {
    var iv = setInterval(function () {
        pn.getNodes(addr, 10).on('node', function (node) {
            console.log('got node:', node);
        });
    }, 1 * 1000);
    c.once('disconnect', function () { clearInterval(iv) });
});

var server = http.createServer(function (req, res) { res.end('...\n') });
server.listen(argv.port, function () {
    console.log('listening on ' + server.address().port);
    pn.advertise('ws://0.0.0.0:' + server.address().port);
});

wsock.createServer({ server: server }, function (stream) {
    stream.pipe(pn.createStream()).pipe(stream);
});

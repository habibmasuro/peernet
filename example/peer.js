var http = require('http');
var wrtc = require('wrtc');
var wsock = require('websocket-stream');
var minimist = require('minimist');

var argv = minimist(process.argv.slice(2), {
    alias: { p: 'port', b: 'bootstrap', d: 'debug' },
    default: { port: 0 }
});

var peernet = require('../');
var pn = peernet({
    bootstrap: argv.bootstrap,
    debug: argv.debug,
    transport: require('./transport.js')
});

var server = http.createServer(function (req, res) { res.end('...\n') });
server.listen(argv.port, function () {
    console.log('listening on ' + server.address().port);
    pn.advertise('ws://0.0.0.0:' + server.address().port);
});

wsock.createServer({ server: server }, function (stream) {
    stream.pipe(pn.createStream()).pipe(stream);
});

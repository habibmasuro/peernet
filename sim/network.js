var peernet = require('../');
var wsock = require('websocket-stream');
var transport = require('../lib/transport.js');
var http = require('http');

var nodes = {};
var pending = 10;

for (var i = 0; i < 10; i++) (function () {
    var node = peernet({
        debug: true,
        transport: transport
    });
    
    var server = http.createServer(function (req, res) { res.end('...\n') });
    server.listen(0, function () {
        var href = 'ws://127.0.0.1:' + server.address().port;
        nodes[href] = node;
        if (--pending === 0) ready();
    });
    wsock.createServer({ server: server }, function (stream) {
        var href = 'ws://'
            + stream.socket._socket.remoteAddress.split(':').slice(-1)[0]
            + ':' + stream.socket._socket.remotePort
        ;
        stream.pipe(node.createStream(href)).pipe(stream);
    });
})();

function ready () {
    var hrefs = Object.keys(nodes);
    var bootstrap = [
        //'ws://1.0.0.0:5000', // invalid
        //'ws://1.0.0.1:1234', // invalid
        hrefs[0],
        //'ws://1.0.0.2:6006', // invalid
        hrefs[3],
        //'ws://1.0.0.3:7809', // invalid
        hrefs[6],
        hrefs[7]
    ];
    hrefs.forEach(function (href) {
        bootstrap.forEach(function (b) {
            if (href !== b) nodes[href].connect(b);
        });
    });
    setInterval(monitor, 1000);
}

function monitor () {
    var visited = {};
    (function visit (href) {
        if (visited[href]) return;
        if (!nodes[href]) return;
        visited[href] = true;
        var node = nodes[href];
        node.connections().forEach(visit);
    })(Object.keys(nodes)[0]);
console.log(visited); 
    
    if (Object.keys(visited).length !== Object.keys(nodes).length) {
        console.log('SPLIT');
    }
    else console.log('CONNECTED');
}

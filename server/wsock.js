var onend = require('end-of-stream');
var http = require('http');
var wsock = require('websocket-stream');

module.exports = function (pn) {
    var server = http.createServer(function (req, res) { res.end() });
    wsock.createServer({ server: server }, function (stream) {
        var addr = stream.socket.upgradeReq.socket.remoteAddress;
        var port = stream.socket.upgradeReq.socket.remotePort;
        pn._connections[addr + ':' + port] = stream;
        stream.pipe(pn.createStream()).pipe(stream);
        
        onend(stream, function () {
            pn.disconnect(addr + ':' + port);
        });
    });
    return server;
};

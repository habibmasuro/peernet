var onend = require('end-of-stream');

module.exports = function (pn) {
    var server = http.createServer(function (req, res) { res.end() });
    server.listen(opts.port, function () {
        var addr = server.address();
        pn._debug('listening on %s:%d', addr.address, addr.port);
    });
    
    wsock.createServer({ server: server }, function (stream) {
        var addr = stream.socket.upgradeReq.socket.remoteAddress;
        var port = stream.socket.upgradeReq.socket.remotePort;
        pn._connections[addr + ':' + port] = stream;
        stream.pipe(pn.createStream(addr)).pipe(stream);
        
        onend(stream, function () {
            pn.disconnect(addr + ':' + port);
        });
    });
    return server;
};

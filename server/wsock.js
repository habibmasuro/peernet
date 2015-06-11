var http = require('http');
var wsock = require('websocket-stream');
var onend = require('end-of-stream');

module.exports = function (pn) {
    var server = http.createServer(function (req, res) { res.end() });
    wsock.createServer({ server: server }, function (stream) {
        stream.pipe(pn.createStream()).pipe(stream);
        onend(stream, function () { stream.destroy() });
    });
    return server;
};

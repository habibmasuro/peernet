var tstream = require('transport-stream');
var wsock = require('websocket-stream');
var net = require('net');
var url = require('url');

module.exports =  tstream({
    protocols: {
        tcp: function (h) {
            var u = url.parse(h);
            return net.connect(u.hostname, Number(u.port));
        },
        ws: wsock,
        wss: wsock
    }
});

var test = require('tape');
var mkdirp = require('mkdirp');
var level = require('level');
var path = require('path');

var peernet = require('../');
var transport = require('../transport.js');
var wsock = require('../server/wsock.js');

var tmpdir = path.join(__dirname, 'peernet-test-' + Math.random());
mkdirp.sync(tmpdir);

test('network', function (t) {
    var peers = [];
    var servers = [];
    var pending = 0;
    
    for (var i = 0; i < 20; i++) {
        var db = level(path.join(tmpdir, ''+Math.random()));
        var peer = peernet(db, { transport: transport });
        var server = wsock(peer);
        pending ++;
        server.listen(function () {
            var addr = 'ws://localhost:' + server.address().port;
            peer.save(addr, function (err) {
                t.ifError(err);
                if (-- pending === 0) ready();
            });
        });
        peers.push(peer);
    }
    
    function ready () {
        console.log('ready!');
    }
});

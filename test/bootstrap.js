var test = require('tape');
var mkdirp = require('mkdirp');
var level = require('level');
var path = require('path');
var through = require('through2');
var shuf = require('shuffle-array');

var peernet = require('../');
var transport = require('../transport.js');
var wsock = require('../server/wsock.js');

var os = require('os');
var tmpdir = path.join(os.tmpdir(), 'peernet-test-' + Math.random());
mkdirp.sync(tmpdir);

var addrs = [];
var peers = [];
var servers = [];

test('bootstrap setup', function (t) {
    t.plan(5*2 + 25);
    var pending = 0;
    
    // 5 websocket servers
    for (var i = 0; i < 5; i++) (function () {
        pending ++;
        var db = level(path.join(tmpdir, ''+Math.random()));
        var peer = peernet(db, {
            transport: transport
        });
        var server = wsock(peer);
        server.listen(function () {
            var addr = 'ws://localhost:' + server.address().port;
            addrs.push(addr);
            peer.save(addr, function (err) {
                t.ifError(err, 'saved node ' + addr);
                if (-- pending === 0) ready();
            });
        });
        peers.push(peer);
    })();
    
    // 25 peers without servers, like browsers
    for (var i = 0; i < 25; i++) (function () {
        var db = level(path.join(tmpdir, ''+Math.random()));
        var peer = peernet(db, {
            transport: transport
        });
        peers.push(peer);
    })();
    
    function ready () {
        pending = peers.length;
        peers.forEach(function (peer) {
            var nodes = shuf(addrs.slice()).slice(0,Math.random()*4+1)
            peer.save(nodes, function (err) {
                t.ifError(err);
            });
        });
    }
});

test('bootstrap teardown', function (t) {
    servers.forEach(function (server) { server.close() });
    peers.forEach(function (peer) { peer.close() });
    t.end();
});

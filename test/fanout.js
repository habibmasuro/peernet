var test = require('tape');
var mkdirp = require('mkdirp');
var level = require('level');
var path = require('path');
var through = require('through2');

var peernet = require('../');
var transport = require('../transport.js');
var wsock = require('../server/wsock.js');

var os = require('os');
var tmpdir = path.join(os.tmpdir(), 'peernet-test-' + Math.random());
mkdirp.sync(tmpdir);

test('fanout', function (t) {
    var peers = [];
    var addrs = [];
    var servers = [];
    var pending = 0;
    var n = 15;
    t.plan(n * 2);
    t.on('end', function () {
        peers.forEach(function (peer) {
            peer.close();
        });
        servers.forEach(function (server) {
            server.close();
        });
    });
    
    for (var i = 0; i < n; i++) (function () {
        var db = level(path.join(tmpdir, ''+Math.random()));
        var peer = peernet(db, {
            transport: transport,
            interval: 50,
            debug: true
        });
        var server = wsock(peer);
        pending ++;
        server.listen(function () {
            var addr = 'ws://localhost:' + server.address().port;
            addrs.push(addr);
            peer.save(addr, function (err) {
                t.ifError(err, 'saved node ' + addr);
                if (-- pending === 0) ready();
            });
        });
        servers.push(server);
        peers.push(peer);
    })();
    
    function ready () {
        var pending = 0;
        for (var i = 1; i < peers.length; i++) {
            pending += 2;
            peers[i].once('hello-reply', function (hello) {
                if (-- pending === 0) connected();
            });
            peers[i].connect(addrs[i-1], function (err) {
                t.ifError(err);
                if (-- pending === 0) connected();
            });
        }
    }
    
    function connected () {
        setTimeout(function () {
            peers[3].disconnect(addrs[2]);
            peers[8].disconnect(addrs[7], ready);
            peers[11].disconnect(addrs[10], ready);
            
            peers[0].join('whatever', function () {
                setTimeout(search, 5000);
            });
        }, 5000);
    }
    
    function search () {
        var s = peers[peers.length-1].search('whatever');
        var expected = [ { address: addrs[0] } ];
        s.pipe(through.obj(function (row, enc, next) {
            var ex = expected.shift();
            t.equal(row.address+'', ex.address+'', 'search result');
        }));
    }
});

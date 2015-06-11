var test = require('tape');
var mkdirp = require('mkdirp');
var level = require('level');
var path = require('path');
var through = require('through2');

var peernet = require('../');
var transport = require('../transport.js')();
var wsock = require('../server/wsock.js');

var os = require('os');
var tmpdir = path.join(os.tmpdir(), 'peernet-test-' + Math.random());
mkdirp.sync(tmpdir);

test('fanout', function (t) {
    var peers = [];
    var addrs = [];
    var servers = [];
    var pending = 0;
    var n = 20;
    t.plan((n-1) * 4 + 1);
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
            interval: 100
            //debug: true
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
            pending ++;
            peers[i].once('hello-reply', function (hello) {
                if (-- pending === 0) connected();
            });
            for (var j = 0; j < 3; j++) {
                pending ++;
                do { var a = Math.floor(Math.random() * peers.length) }
                while (i === a);
                
                peers[i].connect(addrs[j], function (err) {
                    t.ifError(err);
                    if (-- pending === 0) connected();
                });
            }
        }
    }
    
    function connected () {
        setTimeout(function () {
            peers[0].on('search', function (hash, hops, fn) {
                t.equal(hash.toString(), 'whatever');
                fn(addrs[0]);
            });
            var iv = setInterval(function () { search(iv) }, 1000);
        }, 2000);
        
        var iv = setInterval(function () {
            // connection chaos
            var i = Math.floor((peers.length-2) * Math.random() + 1);
            peers[i].disconnect(addrs[i-1]);
        }, 500);
        
        t.once('end', function () {
            clearInterval(iv);
        });
    }
    
    function search (iv) {
        var s = peers[peers.length-1].search('whatever');
        var expected = [ { address: addrs[0] } ];
        s.pipe(through.obj(function (row, enc, next) {
            var ex = expected.shift();
            t.equal(row.address+'', ex.address+'', 'search result');
            clearInterval(iv);
        }));
    }
});

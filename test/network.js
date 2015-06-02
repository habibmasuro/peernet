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
    var addrs = [];
    var pending = 0;
    var n = 20;
    t.plan(n * 2);
    
    for (var i = 0; i < n; i++) (function () {
        var db = level(path.join(tmpdir, ''+Math.random()));
        var peer = peernet(db, {
            transport: transport,
            interval: 100,
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
        peers.push(peer);
    })();
    
    function ready () {
        var pending = 0;
        for (var i = 0; i < peers.length - 1; i++) {
            pending += 2;
            peers[i].once('hello-reply', function (hello) {
                if (-- pending === 0) connected();
            });
            peers[i].connect(addrs[i+1], function (err) {
                t.ifError(err);
                if (-- pending === 0) connected();
            });
        }
    }
    
    function connected () {
        setTimeout(function () {
            //peers[3].disconnect(addrs[4]);
            //peers[4].disconnect(addrs[5]);
            //peers[13].disconnect(addrs[14]);
            
            peers[0].join('whatever', function () {
                setTimeout(search, 1000);
            });
        }, 6000);
    }
    
    function search () {
console.log('SEARCH'); 
        var s = peers[peers.length-1].search('whatever');
        s.on('data', function (res) {
            console.log('RES=', res);
        });
    }
});

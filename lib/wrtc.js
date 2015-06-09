var Peer = require('simple-peer');
//var sdpmin = require('sdp-minimizer');
var sdpmin = {
    reduce: function (sdp) {
        return Buffer(JSON.stringify(sdp)).toString('base64');
    },
    expand: function (buf) {
        return Buffer(buf, 'base64').toString();
    }
};
var through = require('through2');
var EventEmitter = require('events').EventEmitter;

module.exports = function (pn, wrtc, cb) {
    var connected = false, cancelled = false;
    var bus = new EventEmitter;
    pn.once('search', onsearch);
    bus.once('clear', function () {
        pn.removeListener('search', onsearch);
    });
    var to = setTimeout(function () {
        cancelled = true;
        bus.emit('clear');
        cb(new Error('timeout'));
    }, 15000);
    
    (function () {
        var peer = new Peer({
            initiator: true,
            trickle: false,
            wrtc: wrtc
        });
        var addrs = {};
        peer.once('signal', onsignal);
        peer.once('connect', onconnect);
        bus.once('clear', function () {
            peer.removeListener('signal', onsignal);
            peer.removeListener('connect', onconnect);
        });
        
        function onconnect () {
            clear(peer, addrs);
        }
        
        function onsignal (sdp) {
            if (connected || cancelled) return;
            
            var addr = 'wrtc:' + sdpmin.reduce(sdp);
            addrs.local = addr;
            pn.search(addr).pipe(through.obj(function (row, enc, next) {
                if (connected || cancelled) return;
                addrs.remote = row.address;
                var compact = row.address.toString().replace(/^wrtc:/,'');
                peer.signal(sdpmin.expand(compact));
                next();
            }));
        }
    })();
    
    function onsearch (hash, hops, fn) {
        if (!/wrtc:/.test(hash)) return;
        var compact = hash.toString().replace(/^wrtc:/,'');
        var peer = new Peer({
            trickle: false,
            wrtc: wrtc
        });
        var addrs = {};
        addrs.remote = hash;
        
        peer.once('signal', function (sdp) {
            addrs.local = 'wrtc:' + sdpmin.reduce(sdp);
            fn({
                address: addrs.local,
                hash: Buffer(0),
                hops: 0
            });
        });
        peer.once('connect', function () {
            clear(peer, addrs);
        });
        peer.signal(sdpmin.expand(compact));
    }
    
    function clear (peer, addrs) {
        if (connected || cancelled) return;
        clearTimeout(to);
        connected = true;
        bus.emit('clear');
        cb(null, peer, addrs);
    }
};

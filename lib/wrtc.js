var Peer = require('simple-peer');
//var sdpmin = require('sdp-minimizer');
var sdpmin = {
    reduce: function (sdp) {
        return Buffer(JSON.stringify(sdp));
    },
    expand: function (buf) {
        return JSON.parse(buf.toString());
    }
};
var through = require('through2');
var EventEmitter = require('events').EventEmitter;

module.exports = function (pn, wrtc, cb) {
    var connected = false, cancelled = false;
    var bus = new EventEmitter;
    pn.once('request:signal.webrtc', onsearch);
    
    bus.once('clear', function () {
        pn.removeListener('request:signal.webrtc', onsearch);
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
            pn._debug('webrtc connection established');
            clear(peer, addrs);
        }
        
        function onsignal (sdp) {
            if (connected || cancelled) return;
            
            var addr = sdpmin.reduce(sdp);
            addrs.local = addr;
            var ann = {
                type: 'signal.webrtc',
                data: addr
            };
            pn.announce(ann).pipe(through.obj(function (row, enc, next) {
                if (connected || cancelled) return;
                addrs.remote = row.data.toString();
                var compact = row.data.toString();
                peer.signal(sdpmin.expand(compact));
                next();
            }));
        }
    })();
    
    function onsearch (req, fn) {
console.log('ONSEARCH!!!!!!!!!!!!!!!!!!!!!!!!!!!', req);
        var peer = new Peer({
            trickle: false,
            wrtc: wrtc
        });
        var addrs = {};
        addrs.remote = hash;
        
        peer.once('signal', function (sdp) {
            addrs.local = sdpmin.reduce(sdp);
            fn({
                data: addrs.local
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

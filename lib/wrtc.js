var wrtc = require('wrtc');
var Peer = require('simple-peer');
var sdpmin = require('sdp-minimizer');
var through = require('through2');

module.exports = function (pn, cb) {
    var connected = false;
    pn.once('search', onsearch);
    
    (function () {
        var peer = new Peer({
            initiator: true,
            trickle: false,
            wrtc: wrtc
        });
        var addrs = {};
        peer.once('signal', onsignal);
        peer.once('connect', clear);
        
        function onsignal (sdp) {
            if (connected) return;
            
            var addr = 'wrtc:' + sdpmin.reduce(sdp);
            addrs.local = addr;
            pn.search(addr).pipe(through.obj(function (row, enc, next) {
                if (connected) return;
                addrs.remote = row.address;
                peer.signal(row.address);
                
                //next();
            }));
        }
    })();
    
    function onsearch (hash, hops, fn) {
        if (!/wrtc:/.test(hash)) return;
        var peer = new Peer({
            trickle: false,
            wrtc: wrtc
        });
        var addrs = {};
        addrs.remote = hash;
        
        peer.once('signal', function (sdp) {
            addrs.local = 'wrtc:' + sdpmin.reduce(sdp);
            fn({
                address: addrs.self,
                hash: Buffer(0),
                hops: 0
            });
        });
        peer.once('connect', function () {
            clear(addrs);
        });
    }
    
    function clear (addrs) {
        if (connected) return;
        connected = true;
        pn.removeListener('search', onsearch);
        cb(null, this, addrs);
    }
};

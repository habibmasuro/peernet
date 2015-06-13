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
        peer.once('signal', onsignal);
        peer.once('connect', onconnect);
        bus.once('clear', function () {
            peer.removeListener('signal', onsignal);
            peer.removeListener('connect', onconnect);
        });
        
        function onconnect () {
            pn._debug('webrtc connection established');
            clear(peer);
        }
        
        function onsignal (sdp) {
            if (connected || cancelled) return;
            
            var addr = sdpmin.reduce(sdp);
            var ann = {
                type: 'signal.webrtc',
                data: addr
            };
console.log('announce...'); 
            pn.announce(ann).pipe(through.obj(function (row, enc, next) {
console.log('RECV ANNOUNCE!!!!!!!!!!!!!!!!!!!!!!!!!!', row); 
                if (connected || cancelled) return;
                var compact = row.data.toString();
                peer.signal(sdpmin.expand(compact));
                next();
            }));
        }
    })();
    
    function onsearch (req) {
        var peer = new Peer({
            trickle: false,
            wrtc: wrtc
        });
        peer.once('signal', function (sdp) {
            req.reply({ data: sdpmin.reduce(sdp) });
        });
        peer.once('connect', function () {
            pn._debug('webrtc onnection established');
            clear(peer);
        });
        peer.signal(sdpmin.expand(req.data));
    }
    
    function clear (peer) {
        if (connected || cancelled) return;
        clearTimeout(to);
        connected = true;
        bus.emit('clear');
        cb(null, peer);
    }
};

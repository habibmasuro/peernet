#!/usr/bin/env node

var http = require('http');
var wrtc = require('wrtc');
var wsock = require('websocket-stream');
var minimist = require('minimist');
var isarray = require('isarray');
var concatMap = require('concat-map');
var through = require('through2');

var argv = minimist(process.argv.slice(2), {
    alias: {
        a: [ 'addr', 'address' ],
        b: 'bootstrap',
        c: 'connect',
        d: 'datadir',
        n: 'nodes',
        p: 'port',
        s: [ 'subnet', 'subnets' ],
        v: 'verbose'
    },
    default: { port: 0, nodes: 5 }
});
var peernet = require('../');

if (argv._[0] === 'daemon') {
}

var subnets = argv.subnet || [];
if (!isarray(subnets)) subnets = [ subnets ];
subnets = concatMap(subnets, function (s) { return s.split(',') });

var pn = getPeernet();
if (argv.port) wsockServer(pn);

function wsockServer (pn) {
    var server = http.createServer(function (req, res) { res.end('...\n') });
    server.listen(argv.port, function () {
        console.log('listening on ' + server.address().port);
    });
    wsock.createServer({ server: server }, function (stream) {
        var addr = stream.socket.upgradeReq.socket.remoteAddress;
        stream.pipe(pn.createStream(addr)).pipe(stream);
    });
}

function getPeernet () {
    var level = require('level');
    var db = level(argv.datadir);
    var pn = peernet(db, {
        bootstrap: argv.bootstrap,
        debug: argv.debug,
        nodes: argv.nodes,
        transport: require('../lib/transport.js')
    });
    
    var cons = argv.connect || [];
    if (!isarray(cons)) cons = [ cons ];
    cons.forEach(function (c) { pn.connect(c) });
    
    var saveCons = cons.map(function (c) {
        return {
            address: c,
            subnets: subnets
        };
    });
    
    var addrs = argv.address || [];
    if (!isarray(addrs)) addrs = [ addrs ];
    
    var saveAddrs = addrs.map(function (a) {
        return {
            address: a,
            subnets: subnets
        };
    });
    pn.save(saveAddrs.concat(saveCons));
    return pn;
}

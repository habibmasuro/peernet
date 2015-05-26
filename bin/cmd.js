#!/usr/bin/env node

var path = require('path');
var defined = require('defined');
var HOME = defined(process.env.HOME, process.env.USERDIR);

var minimist = require('minimist');
var argv = minimist(process.argv.slice(2), {
    alias: {
    },
    default: {
        sockfile: path.join(HOME, '.config/peernet/sock')
    }
});
var autod = require('auto-daemon');
var mkdirp = require('mkdir');
var rpc = require('./lib/rpc.js');

if (argv._[0] === 'server') {
}
else if (argv._[0] === 'daemon') {
}
else if (argv._[0] === 'log') {
}
else if (argv._[0] === 'join') {
}
else if (argv._[0] === 'part') {
}
else if (argv._[0] === 'add') {
    auto(function (r, c) {
        r.add(argv._.slice(1), function (err) {
            if (err) error(err)
            else c.destroy()
        });
    });
}
else if (argv._[0] === 'rm') {
    auto(function (r, c) {
        r.remove(argv._.slice(1), function (err) {
            if (err) error(err)
            else c.destroy()
        });
    });
}
else if (argv._[0] === 'search') {
}
else if (argv._[0] === 'ls') {
}
else if (argv._[0] === 'connections') {
}
else if (argv._[0] === 'connect') {
}
else if (argv._[0] === 'disconnect') {
}

function auto (cb) {
    var opts = {
        rpcfile: path.join(__dirname, 'lib/rpc.js'),
        sockfile: argv.sockfile,
        methods: rpc.methods
    };
    mkdirp(path.dirname(opts.sockfile), function (err) {
        autod(opts, function (err, r, c) {
            if (err) return error(err);
            else cb(r, c)
        });
    });
}

function error (msg) {
    console.error(msg + '');
    process.exit(1);
}

/*
var http = require('http');
var wrtc = require('wrtc');
var wsock = require('websocket-stream');
var isarray = require('isarray');
var concatMap = require('concat-map');
var through = require('through2');

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
*/

#!/usr/bin/env node

var path = require('path');
var fs = require('fs');
var defined = require('defined');
var HOME = defined(process.env.HOME, process.env.USERDIR);
var DIR = defined(
    process.env.PEERNET_PATH,
    path.join(HOME, '.config/peernet')
);

var minimist = require('minimist');
var argv = minimist(process.argv.slice(2), {
    alias: {
        p: 'port',
        d: 'datadir'
    },
    default: {
        sockfile: path.join(DIR, 'sock'),
        datadir: path.join(DIR, 'db')
    }
});
var autod = require('auto-daemon');
var createServer = require('auto-daemon/server');
var mkdirp = require('mkdirp');
var rpc = require('../lib/rpc.js');

if (argv._[0] === 'log') {
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
else if (argv._[0] === 'known') {
    auto(function (r, c) {
        var s = r.known(argv);
        s.pipe(process.stdout);
        s.once('end', function () { c.destroy() });
    });
}
else if (argv._[0] === 'connections') {
    auto(function (r, c) {
        r.connections(function (err, cons) {
            if (err) return error(err);
            cons.forEach(function (con) {
                console.log(con);
            });
            c.destroy()
        });
    });
}
else if (argv._[0] === 'servers') {
    auto(function (r, c) {
        r.servers(function (err, servers) {
            if (err) return error(err);
            servers.forEach(function (s) {
                console.log(s.address + ':' + s.port);
            });
            c.destroy()
        });
    });
}
else if (argv._[0] === 'connect') {
    auto(function (r, c) {
        r.connect(argv._[1], function (err) {
            if (err) error(err)
            else c.destroy()
        });
    });
}
else if (argv._[0] === 'disconnect') {
    auto(function (r, c) {
        r.disconnect(argv._[1], function (err) {
            if (err) error(err)
            else c.destroy()
        });
    });
}
else if (argv._[0] === 'listen') {
    auto(function (r, c) {
        var opts = {
            proto: argv._[1] || 'ws',
            port: argv.port
        };
        r.listen(opts, function (err, service) {
            if (err) return error(err);
            console.log(service.address + ':' + service.port);
            c.destroy();
        });
    });
}
else if (argv._[0] === 'daemon') {
    auto({ autoclose: false }, function (err, r, c) {
        if (err) error(err)
        else c.destroy()
    });
}
else if (argv._[0] === 'server') {
    fs.unlink(argv.sockfile, listen);
}
else if (argv._[0] === 'close') {
    auto(function (r, c) {
        r.close(function () { c.destroy() });
        c.on('error', function () {});
    });
}

function listen () {
    var opts = {
        _: [ '-d', argv.datadir ],
        autoclose: false
    };
    mkdirp(path.dirname(argv.sockfile), function () {
        var server = createServer(rpc, opts);
        server.listen(argv.sockfile);
    });
}

function auto (opts_, cb) {
    if (typeof opts_ === 'function') {
        cb = opts_;
        opts_ = {};
    }
    var opts = {
        rpcfile: path.join(__dirname, '../lib/rpc.js'),
        sockfile: argv.sockfile,
        methods: rpc.methods,
        debug: argv.debug,
        args: [ '-d', argv.datadir ],
        autoclose: opts_.autoclose
    };
    var pending = 2;
    mkdirp(path.dirname(opts.sockfile),ready);
    mkdirp(argv.datadir, ready);
    
    function ready (err) {
        if (-- pending !== 0) return;
        autod(opts, function (err, r, c) {
            if (err) return error(err);
            else cb(r, c)
            c.on('error', function () {});
        });
    }
}

function error (msg) {
    console.error(msg + '');
    process.exit(1);
}

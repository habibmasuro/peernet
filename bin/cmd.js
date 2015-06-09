#!/usr/bin/env node

var path = require('path');
var fs = require('fs');
var defined = require('defined');
var through = require('through2');
var split = require('split2');

var HOME = defined(process.env.HOME, process.env.USERDIR);
var DIR = defined(
    process.env.PEERNET_PATH,
    path.join(HOME, '.config/peernet')
);

var minimist = require('minimist');
var argv = minimist(process.argv.slice(2), {
    alias: {
        p: 'port',
        d: 'datadir',
        h: 'help'
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
var onend = require('end-of-stream');

if (argv._[0] === 'help' || argv.help) {
    fs.createReadStream(path.join(__dirname, 'usage.txt'))
        .pipe(process.stdout)
    ;
}
else if (argv._[0] === 'log') {
    auto(function (r, c) {
        var log = r.log();
        log.pipe(process.stdout);
        onend(log, function () { c.destroy() });
    });
}
else if (argv._[0] === 'add') {
    auto(function (r, c) {
        r.add({ address: argv._.slice(1) }, function (err) {
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
        r.known().pipe(split(JSON.parse)).pipe(through.obj(write, end));
        
        function write (row, enc, next) {
            var addr = Buffer(row.address, 'base64').toString();
            console.log(addr, row.subnets.join(','));
            next();
        }
        
        function end () { c.destroy() }
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
    var addr = argv._[1];
    var nodes = [ { address: addr } ];
    
    auto(function (r, c) {
        r.connect(addr, function (err) {
            if (err) return error(err);
            r.add(nodes, function (err) {
                if (err) error(err)
                else c.destroy()
            });
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
else if (argv._[0] === 'join') {
    auto(function (r, c) {
        r.join(argv._[1], function (err) {
            if (err) error(err)
            else c.destroy()
        });
    });
}
else if (argv._[0] === 'part') {
    auto(function (r, c) {
        r.part(argv._[1], function (err) {
            if (err) error(err)
            else c.destroy()
        });
    });
}
else if (argv._[0] === 'subnets') {
    auto(function (r, c) {
        var s = r.subnets(argv._[1]);
        s.pipe(split(JSON.parse))
            .pipe(through.obj(function (row, enc, next) {
                this.push(row.key + '\n');
                next();
            }))
            .on('end', function () { c.destroy() })
            .pipe(process.stdout)
        ;
    });
}

else if (argv._[0] === 'search') {
    auto(function (r, c) {
        var s = r.search(argv._[1]);
        s.pipe(split(JSON.parse))
            .pipe(through.obj(function (row, enc, next) {
                this.push(Buffer(row.address, 'base64').toString() + '\n');
                next();
            }))
            .on('end', function () { c.destroy() })
            .pipe(process.stdout)
        ;
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
        _: [ __filename, '-d', argv.datadir ],
        autoclose: false
    };
    mkdirp(path.dirname(argv.sockfile), function () {
        var server = createServer(rpc, opts);
        server.listen(argv.sockfile, function () {
            auto(function (r, c) { c.destroy() });
        });
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

# peernet

peer to peer gossip network based on
[randomized algorithms](https://www.youtube.com/watch?v=RV4f5vHFavs)

The purpose of this tool is to sustain a gossip network for creating
application-specific subnets. For example, a subnet might host a DHT or a p2p
chat protocol. Each p2p protocol first needs a list of peers to make
connections, which can be obtained from peernet.

# project status

This project is very early mad science still heavily under research and
development.

# example

``` js
var level = require('level');
var db = level('./peer.db');

var peernet = require('peernet');
var pn = peernet(db, {
    transport: require('peernet/transport'),
    debug: true
});

var http = require('http');
var server = http.createServer(function (req, res) { res.end('...\n') });
server.listen(argv.port, function () {
    console.log('listening on ' + server.address().port);
});

var wsock = require('websocket-stream');
wsock.createServer({ server: server }, function (stream) {
    stream.pipe(pn.createStream()).pipe(stream);
});
```

You'll also need to bootstrap the network the first time you initialize the
database. Call `.save()` on the peernet instance with an array of nodes you'll
connect to:

```
pn.save([ 'ws://10.1.2.3:4000', 'ws://substack.net:2020' ]);
```

Peernet will attempt to connect to peers automatically from its database.

# methods

``` js
var peernet = require('peernet')
```

## var pn = peernet(db, opts)

Create a new peernet instance `pn` from a leveldb database handle `db`.

The required options are:

* `opts.transport` - a
[transport-stream](https://npmjs.org/package/transport-stream) interface for
resolving protocols to duplex transport streams. If you want something easy, use
`require('peernet/transport')` here.
* `opts.debug` - when `true`, print helpful diagnostic info with
`console.error()`.
* `opts.bootstrap` - when `true`, automatically connect to peers from the
database. Default: `true`.
* `opts.interval` - time in milliseconds to wait between requesting new nodes
from peers. Default: 5000.
* `opts.purge` - time in milliseconds to wait between purging dead nodes.
Default: `60*1000`.
* `opts.connections` - number of peer connections to bootstrap and maintain.
Default: 5
* `opts.wrtc` - webrtc implementation (interface like the
[wrtc](https://npmjs.com/package/wrtc) package)

## pn.save(nodes, cb)

Save `nodes` an array of peer address strings, to storage.

The protocol of the addresses will be interpreted by `opts.transport` provided
to the peernet constructor.

## pn.remove(nodes, cb)

Remove `nodes`, an array of peer address strings, from storage.

## var r = pn.known()

Return a readable object stream `r` with all the known peers.

Each row has an `address` key with the string address for its value.

## pn.getStats(addr, cb)

Query connection statistics for `addr` in `cb(err, stats)`.

The `stats` object has these properties:

* `stats.connections.ok` - number of successful connections
* `stats.connections.fail` - number of failed connections
* `stats.nodes.rx` - number of peer addresses received from this node
* `stats.nodes.tx` - number of peer addresses sent to this node

## pn.connect(addr, cb)

Connect to `addr`, a string address to be interpreted by `opts.transport`.

`cb(err)` fires with an error or upon a successful connection.

## pn.disconnect(addr)

Disconnect from `addr`, a string address.

## var stream = pn.createStream()

Create a duplex `stream` to wire up to a remote transport. This method is useful
for hooking up a connection from inside a server.

## var cons = pn.connections()

Return `cons`, an array of the currently connected addresses or IDs.

## var r = pn.announce(msg)

Broadcast a message `msg` to peers who will gossip the announcement to *their*
peers.

* `msg.id` - optional id buffer or string. Should be globally unique. Random
data works best because of caching used to bust routing loops. At most 64 bytes.
* `msg.type` - optional type buffer or string to identify the kind of message.
At most 64 bytes.
* `msg.data` - optional data payload buffer or string. At most 1024 bytes.
* `msg.limit` - optional maximum number of hops 
* `msg.hops` - starting hop count. Default 0.

Returns a readable object stream `r` of search rows:

* `row.id` - response unique id
* `row.type` - optional type of message
* `row.data` - optional buffer payload data
* `row.limit` - optional maximum number of hops
* `row.hops` - number of hops from the originating response

Other nodes will forward the search query along or respond themselves if they
have relevant content.

## pn.close()

Shut down all intervals and disconnect from all peers.

# events

## pn.on('request', req)

When a peer sends a request to be forwarded, this event fires.

Use `req.reply(msg)` to send a reply.

`msg` should be an object with message properties (`id`, `type`, `data`,
`limit`, and `hops`) that default to the originating request properties, but
with the hop count set to `0`.

If `msg` is a `Buffer` or `string`, it will be used as the `data` property. 

# license

MIT

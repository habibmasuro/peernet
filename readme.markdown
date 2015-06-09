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

# example usage

On one machine, start a websocket service:

```
$ peernet listen ws
:::48832
```

Then from another machine (or set $PEERNET_PATH on the same machine),
connect to the websocket service:

```
$ peernet connect ws://192.168.1.172:48832
```

Now the peers are connected!

You can connect to more peers or create more services.

The next time you start peernet, the network will bootstrap connections to known
peers.

# example code

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

## var stream = pn.createStream(addr)

Create a duplex `stream` to wire up to a remote transport. This method is useful
for hooking up a connection from inside a server.

If you know the public address of the remote peer, you can give it as `addr`.

## var cons = pn.connections()

Return `cons`, an array of the currently connected addresses or IDs.

## pn.join(subnet, cb)

Join `subnet`, a string or array of string subnet names.

When an incoming search for the subnet appears, peernet will respond to the
search query.

Subnet membership persists to the database.

## pn.part(subnet, cb)

Part `subnet`, a string or array of string subnet names.

Stop responding to search queries for the subnet.

Subnet membership persists to the database.

## var r = pn.search(query)

Perform a search for `query`, a Buffer payload.

Returns a readable object stream `r` of search rows:

* `row.hash` - response subnet name
* `row.address` - responding address
* `row.hops` - number of hops to the responding address

Other nodes will forward the search query along or respond themselves if they
have relevant content.

## var r = pn.subnets()

Return a readable object stream `r` with all the joined subnets.

Each row has a `key` property with the subnet string name as the value.

## pn.close()

Shut down all intervals and disconnect from all peers.

# usage

```
peernet server

  Start the server in the foreground.
 
peernet daemon

  Start the server in the background.

peernet log

  Print detailed lifecycle events as they arrive.

peernet known

  Show all known nodes.

peernet own

  Show the addresses of own services.

peernet connections

  Show the active connections.

peernet connect ADDR

  Connect to ADDR.

peernet disconnect ADDR.

  Disconnect from ADDR.

peernet add ADDR

  Add ADDR to the address tables without connecting.

peernet rm ADDR

  Remove ADDR from the address tables.

peernet join SUBNET

  Join SUBNET: respond to searches for SUBNET peers.

peernet part SUBNET

  Part SUBNET: stop responding to searches for SUBNET peers.

peernet subnets

  Print subnet membership, one per line.

peernet search SUBNET

  Search for peers that belong to SUBNET, printing addresses per line.

peernet listen PROTOCOL

  Create a service for PROTOCOL, optionally on a `--port`.

peernet servers

  Show all local services.

```

# license

MIT

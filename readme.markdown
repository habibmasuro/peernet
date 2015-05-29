# peernet

peer to peer gossip network based on randomized algorithms

https://www.youtube.com/watch?v=RV4f5vHFavs

The purpose of this tool is to sustain a gossip network for creating
application-specific subnets. For example, a subnet might host a DHT or a p2p
chat protocol. Each p2p protocol first needs a list of peers to make
connections, which can be obtained from peernet.

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

# status

Don't use this project for anything important until the simulations are more
fleshed out. Subnets are currently in progress.

# license

MIT

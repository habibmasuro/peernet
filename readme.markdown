# peernet

peer to peer gossip network based on randomized algorithms

https://www.youtube.com/watch?v=RV4f5vHFavs

# status

Don't use this project until the simulations are more fleshed out.

# objective

This library isn't meant to do very much except for:

* keep track of peer addresses
* forward peer announcements
* prevent spam with aggressive throttling
* allow peers to find each other to create subnets

Once a peer has a list of the other peers interested in the same subnet, it can
form an application-specific network with that information and create new
connections.

The application subnet could be anything: a p2p chat relay, live stream, DHT, or
another peernet.

# goals

* Build a [2-layer gossip network](https://github.com/ssbc/scuttlebot/issues/172#issuecomment-100410637)
for webrtc peer introductions.
* Detect networking scenarios and log accordingly for local network, offline
situations


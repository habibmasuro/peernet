var wsock = require('websocket-stream');

module.exports = function (opts) {
    return function (href) {
        if (/^wss?:/.test(href)) {
            return wsock(href);
        }
        throw new Error('Unsupported protocol')
    };
};

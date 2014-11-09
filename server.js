'use strict';

var express = require('express'),
    bodyParser = require('body-parser'),
    app = express(),
    fs = require('fs'),
    server = require('http').createServer(app),
    io = module.exports = require('socket.io').listen(server), //export our socket.io instance so modules may use it by requiring this file
    config = require('./lib/config'),
    log = require('./lib/logger'),
    bundles = require('./lib/bundles'),
    path = require('path');

/**
 * Express app setup
 */
log.trace("[server.js] Setting up Express");
app.use(express.static(__dirname + '/public'));
app.use('/components', express.static(__dirname + '/bower_components'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

app.engine('jade', require('jade').__express);
app.engine('html', require('ejs').renderFile);
app.engine('ejs', require('ejs').renderFile);

app.all('*', function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

if (config.login.enabled) {
    log.info('[server.js] Login security enabled');
    var login = require('./lib/login');
    app.use(login);
}

log.trace("[server.js] Starting dashboard lib");
var dashboard = require('./lib/dashboard');
app.use(dashboard);

log.trace("[server.js] Starting bundle views lib");
var bundleViews = require('./lib/bundle_views');
app.use(bundleViews);

// Mount the NodeCG extension entrypoint from each bundle, if any
bundles.on('allLoaded', function(allbundles) {
    log.trace("[server.js] Starting extension mounting");
    allbundles.forEach(function(bundle) {
        if (!bundle.extension)
            return;

        log.debug("[server.js] Bundle %s has extension", bundle.name, bundle.extension);

        var mainPath = path.join(__dirname, bundle.dir, bundle.extension.path);
        if (fs.existsSync(mainPath)) {
            if (bundle.extension.express) {
                app.use(require(mainPath));
                log.info("[server.js] Mounted %s extension as an express app", bundle.name);
            } else {
                require(mainPath);
                log.info("[server.js] Mounted %s extension as a generic extension", bundle.name);
            }
        } else {
            log.error("[server.js] Couldn't load extension %s for %s. Skipping", bundle.extension.path, bundle.name);
        }
    });
});

io.set('log level', 1); // reduce logging

io.sockets.on('connection', function (socket) {
    log.trace("[server.js] New socket connection: ID %s with IP %s", socket.id,
        socket.manager.handshaken[socket.id].address.address); // wot tha fuck pete

    socket.on('message', function (data) {
        log.debug("[server.js] Socket %s sent a message:", socket.id, data);
        io.sockets.json.send(data);
    });
});

log.trace("[server.js] Attempting to listen on port %s", config.port);
server.listen(config.port);
log.info("[server.js] NodeCG running on %s:%s", config.host, config.port);

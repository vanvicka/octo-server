var express = require('express');
var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server)

io.on('connection', function (client) {

  
  console.log(client.id, 'joined');
  client.on('/test', function (msg) {
      console.log(msg);
  });

  client.on('typing', function name(data) {
    console.log(data);
    io.emit('typing', data)
  })

  client.on('message', function name(data) {
    console.log(data);
    io.sockets.emit('message', data)
  })

  client.on('request', function name(data) {
    console.log(data);
    io.sockets.emit('request', data)
  })

  client.on('location', function name(data) {
    console.log(data);
    io.emit('location', data);
  })

  client.on('connect', function () {
  })

  client.on('disconnect', function () {
    console.log('client disconnect...', client.id)
    // handleDisconnect()
  })

  client.on('error', function (err) {
    console.log('received error from client:', client.id)
    console.log(err)
  })
})

var server_port = process.env.PORT || 8080;
server.listen(server_port, function (err) {
  if (err) throw err
  console.log('Listening on port %d', server_port);
});
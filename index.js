var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server)

app.post("verify_webhook", function(req, res) {
  // Retrieve the request's body
  const event = req.body;
  console.log(event);
  // Do something with event
  res.send(200);
});

var server_port = process.env.PORT || 8080;
server.listen(server_port, function (err) {
  if (err) throw err
  console.log('Listening on port %d', server_port);
});
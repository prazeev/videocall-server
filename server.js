var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var OpenTok = require('opentok');
var apiKey = '46289812';
var apiSecret = '72135dca7c071a29c6e38097ea0f1605a6018a06';
var opentok = new OpenTok(apiKey,apiSecret);
var busyUsers = [];
const port = process.env.PORT || 3000;



io.on('connection', function(socket){
  console.log(socket.id);
  socket.on('initiate-call',function(data){
      // busyUsers.push(msg.from);
      // if(busyUsers.indexOf(msg.to)!=-1){
      //   busyUsers.push(msg.to);
      // }
      // if(busyUsers.indexOf(msg.to) != -1 ){
      //   socket.emit(`c-userBusy-${msg.id}`);
      //   delete busyUsers[busyUsers.indexOf(msg.to)];
      //   delete busyUsers[busyUsers.indexOf(msg.from)];
      //   return false;
      // }
      opentok.createSession(function(err, session) {
        if (err) socket.emit( 'error' , "Cannot generate token" );
        sessionId = session.sessionId;

        var callerData = {
          apiKey: apiKey,
          sessionId: sessionId,
          token: opentok.generateToken(sessionId),
          from: data.from,
          to: data.to
        }

        io.emit(`s-token-${data.from.id}`,callerData);

        caleeToken = opentok.generateToken(sessionId);

        var receiverData = {
          'from':data.from,
          'to':data.to,
          'apiKey':apiKey,
          'sessionId':sessionId,
          'token':caleeToken
        };

        io.emit(`s-userCalling-${data.to}`,receiverData)

      });
  })

  socket.on('endCall',(data)=>{
    delete busyUsers[busyUsers.indexOf(data.to)];
    delete busyUsers[busyUsers.indexOf(data.to)];
    io.emit(`s-endCall-${data.to}`);
    io.emit(`s-endCall-${data.from}`);
  })
  socket.on('disconnect',function(){
      console.log('user disconnected');
  })

  socket.on('r-callAccepted',(data)=>{
    busyUsers.push(data.to);
    busyUsers.push(data.from);
    io.emit(`s-callAccepted-${data.id}`);
  })

  socket.on('c-cancelCall',(data)=>{
    delete busyUsers[busyUsers.indexOf(data.to)];
    delete busyUsers[busyUsers.indexOf(data.from)];
    io.emit(`s-callCancel-${data.to}`,data);
  })

  socket.on('r-callRejected',(data)=>{
    delete busyUsers[busyUsers.indexOf(data.to)];
    delete busyUsers[busyUsers.indexOf(data.from)];
    io.emit(`s-callRejected-${data.id}`,data);
  })

});

app.get('/',function(req,res){
  res.send('hello world');
})
http.listen(port, function(){
  console.log(`Listening on ${port}`);
});

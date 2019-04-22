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
  socket.on('initiate-call',function(msg){
    console.log(msg);
      // busyUsers.push(msg.from.email);
      // if(busyUsers.indexOf(msg.to.email)!=-1){
      //   busyUsers.push(msg.to.email);
      // }
      // if(busyUsers.indexOf(msg.to.email)!= -1 ){
      //   socket.emit(`c-userBusy-${msg.from.id}`);
      //   delete busyUsers[busyUsers.indexOf(msg.to.email)];
      //   delete busyUsers[busyUsers.indexOf(msg.from.email)];
      //   return false;
      // }
      opentok.createSession(async function(err, session) {
        if (err) socket.emit('error',"Cannot generate token");
        sessionId = session.sessionId;
        var callerData = {
          apiKey: apiKey,
          sessionId: sessionId,
          token: opentok.generateToken(sessionId),
          from: msg.from,
          to: msg.to
        }
        io.emit(`s-token-${msg.from.id}`,callerData);
        caleeToken = opentok.generateToken(sessionId);
        var receiverData = {
          'from':msg.from,
          'to':msg.to,
          'apiKey':apiKey,
          'sessionId':sessionId,
          'token':caleeToken
        };
        io.emit(`s-userCalling-${msg.to}`,receiverData)
      });
  })

  socket.on('endCall',(data)=>{
    delete busyUsers[busyUsers.indexOf(data.to.email)];
    delete busyUsers[busyUsers.indexOf(data.from.email)];
    io.emit(`s-endCall-${data.to.id}`);
    io.emit(`s-endCall-${data.from.id}`);
  })
  socket.on('disconnect',function(){
      console.log('user disconnected');
  })

  socket.on('r-callAccepted',(data)=>{
    busyUsers.push(data.to.email);
    busyUsers.push(data.from.email);
    io.emit(`s-callAccepted-${data.from.id}`);
  })

  socket.on('c-cancelCall',(data)=>{
    delete busyUsers[busyUsers.indexOf(data.to.email)];
    delete busyUsers[busyUsers.indexOf(data.from.email)];
    io.emit(`s-callCancel-${data.to.id}`,data);
  })

  socket.on('r-callRejected',(data)=>{
    delete busyUsers[busyUsers.indexOf(data.to.email)];
    delete busyUsers[busyUsers.indexOf(data.from.email)];
    io.emit(`s-callRejected-${data.from.id}`,data);
  })

});

app.get('/',function(req,res){
  res.send('hello world');
})
http.listen(port, function(){
  console.log(`Listening on ${port}`);
});

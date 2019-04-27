/* eslint-disable eqeqeq */

var app = require('express')()
var http = require('http').Server(app)
var io = require('socket.io')(http)
var OpenTok = require('opentok')
var apiKey = '46289812'
var apiSecret = '72135dca7c071a29c6e38097ea0f1605a6018a06'
var opentok = new OpenTok(apiKey, apiSecret)
var users = {}
var busyUsers = []

// [
//   socketId:user
// ]

const port = process.env.PORT || 3000

// Fetchs all socket ids of user (A user may be connected in multiple sockets). Returns an array of SocketIds
function getSocketIdsFromSocketId (socketId, message) {
  let socketIds = []
  if (users[socketId] && users[socketId].id) {
    let userId = users[socketId].id
    Object.entries(users).map((user) => {
      if (userId == user[1].id) {
        socketIds.push(user[0])
      }
    })
  }
  return socketIds
}
function checkUserAndUpdate(userId) {

}
function getSocketIdsFromUserId (userId) {
  let socketIds = []
  Object.entries(users).map((user) => {
    if (user[1].id == userId) {
      socketIds.push(user[0])
    }
  })
  return socketIds
}

function removeSocket (socketId) {
  delete users[socketId]
}
function markAsBusy (userId) {
  if (busyUsers.indexOf(userId) != -1) {
    busyUsers.push(userId)
  }
}

function removeFromBusy (userId) {
  busyUsers.splice(busyUsers.indexOf(userId), 1)
}

function isBusy (userId) {
  return busyUsers.indexOf(userId) >= 0
}

function isOnline (userId) {
  let isOnline = Object.values(users).filter((user) => {
    return user.id == userId
  }).length
  return isOnline > 0
}

function emitEvent (io, socketIds, eventName, eventData = null) {
  socketIds.forEach((socketId) => {
    io.to(`${socketId}`).emit(`${eventName}`, eventData)
  })
}

function getUserMessages(from,to) {
  return messages.filter(message => {
    return message.from == from || message.to == to
  })
}

function sendNotification(from, to, message) {

}

function saveData(from, to, message) {

}
var messages = [];

io.on('connection', function (socket) {
  socket.on('user connected', (data) => {
    users[socket.id] = { id: data }
  })
  socket.on('initiate-call', async function (data) {
    let fromId = data.from
    let toId = data.to
    let callerSocketIds = getSocketIdsFromUserId(fromId)
    markAsBusy(fromId)
    if (isBusy(toId)) {
      removeFromBusy(fromId)
      emitEvent(io, callerSocketIds, 'user busy')
      return false
    }
    // eslint-disable-next-line eqeqeq
    if (!isOnline(toId)) {
      removeFromBusy(fromId)
      emitEvent(io, callerSocketIds, 'user offline')
      return false
    }
    let receiverSocketIds = getSocketIdsFromUserId(data.to)
    // create a room

    // put Caller and Receiver on the same room
    opentok.createSession(function (err, session) {
      if (err) socket.emit('error', 'Cannot generate token')
      let sessionId = session.sessionId

      var callerData = {
        apiKey: apiKey,
        sessionId: sessionId,
        token: opentok.generateToken(sessionId)
      }
      emitEvent(io, callerSocketIds, 's-apiTokens', callerData)

      let receiverToken = opentok.generateToken(sessionId)
      var receiverData = {
        'apiKey': apiKey,
        'sessionId': sessionId,
        'token': receiverToken,
        'callFrom': socket.id
      }
      // emitEvent(io, receiverSocketIds, 's-apiTokens', receiverData)
      emitEvent(io, receiverSocketIds, 's-userCalling', receiverData)
    })
  })

  socket.on('disconnect', function () {
    if (users[socket.id]) {
      removeFromBusy(users[socket.id].id)
      removeSocket(socket.id)
    }
  })
  socket.on('r-userInactive', (data) => {
    if (data.socketId) {
      let socketIds = getSocketIdsFromSocketId(data.socketId)
      emitEvent(io, socketIds, 's-userInactive', data)
    }
  })
  socket.on('r-callAccepted', (data) => {
    markAsBusy(users[data])
    markAsBusy(users[socket.id].id)
    let socketIds = getSocketIdsFromSocketId(data)
    emitEvent(io, socketIds, 's-callAccepted')
  })

  socket.on('c-cancelCall', (data) => {
    let socketIds = getSocketIdsFromUserId(data.to)
    emitEvent(io, socketIds, 's-callCancel')
    removeFromBusy(data.from)
    removeFromBusy(data.to)
  })

  socket.on('r-callRejected', (data) => {
    let socketIds = getSocketIdsFromSocketId(data)
    emitEvent(io, socketIds, 's-callRejected')
  })

  socket.on('endCall', (data) => {
    removeFromBusy(users[socket.id].id)
    let socketIds = getSocketIdsFromSocketId(data)
    emitEvent(io, socketIds, 'endCall')
  })




  //Razeev
  socket.on('sendChat', (data) => {
    let userTo = data.to;
    let userFrom = users[socket.id].id;
    let message = data.text.trim();
    let messageTime = new Date().getTime();
    if(message.length > 0) {
      if(isOnline(userTo)) {
        let receiverUsers = getSocketIdsFromUserId(userTo);
        let emitingData = {
          from: userFrom,
          to: userTo,
          message: message,
          messageTime: messageTime,
        }
        messages.push(emitingData);
        emitEvent(io, receiverUsers,"receiveChat",emitingData)
        saveData(userFrom,userTo,message)
      } else {
        let notificationData = {
          from: userFrom,
          to: userTo,
          message: message,
          messageTime: messageTime,
        }
        messages.push(notificationData);
        sendNotification(userFrom, userTo, message)
      }
    }
  });
})
socket.on('getChat', (data) => {
  let chatData = getUserMessages(data.from, data.to);
  emitEvent(io, [socket.id], "getChat", chatData);
})

app.get('/', function (req, res) {
  res.send('hello world')
})

http.listen(port, function () {
  console.log(`Listening on ${port}`)
})



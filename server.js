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
var messages = []

// [
//   socketId:user
// ]

const port = process.env.PORT || 3001

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

function socketExists (socketId) {
  let user = Object.keys(users).map(function (sId) {
    return sId == socketId
  })
  if (user.length > 0) {
    return true
  }
  return false
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
  console.log('mark as busy' + userId)
  if (busyUsers.indexOf(userId) == -1) {
    busyUsers.push(userId)
  }
}

function removeFromBusy (userId) {
  console.log('remove from busy' + userId)
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

function isOnlineList(userList) {
  var onlineList = []
  userList.forEach(function(user) {
    if(isOnline(user)) {
      onlineList.push(1)
    } else {
      onlineList.push(0)
    }
  })
  return onlineList
}

function emitEvent (io, socketIds, eventName, eventData = null) {
  console.log(eventName)
  console.log(socketIds)
  socketIds.forEach((socketId) => {
    io.to(`${socketId}`).emit(`${eventName}`, eventData)
  })
}

function getUserMessages (from, to) {
  var data = messages.filter((message) => {
    return (message.from == from && message.to == to) || (message.from == to && message.to == from)
  })
  if (data.length > 0) {
    data.sort(function (a, b) {
      return a.messageTime > b.messageTime
    })
    return data
  } else {
    return []
  }
}

function sendNotification (from, to, message) {

}

function saveData (from, to, message) {

}

function getOnlineUsers () {
  let onlineUsers = []
  Object.values(users).forEach((user) => onlineUsers.push(user.id))
  return onlineUsers
}

io.on('connection', function (socket) {
  socket.on('user connected', (data) => {
    users[socket.id] = { id: data.id, name: data.name }
    socket.broadcast.emit('s-userOnline', { 'id': users[socket.id].id })
    io.to(socket.id).emit('s-userList', getOnlineUsers())
  })
  socket.on('r-userStatus', (data) => {
    emitEvent(io, [socket.id], 's-userStatus', isOnline(data))
  })
  socket.on("r-userOnlineList", (data) => {
    var onlineList = isOnlineList(data)
    emitEvent(io, [socket.id], 's-userOnlineList', onlineList)
  })
  socket.on('initiate-call', async function (data) {
    let fromId = data.from
    let toId = data.to
    if (isBusy(fromId)) {
      emitEvent(io, [socket.id], 's-currentBusy')
      return false
    }
    markAsBusy(fromId)
    if (isBusy(toId)) {
      removeFromBusy(fromId)
      emitEvent(io, [socket.id], 'user busy')
      return false
    }
    // eslint-disable-next-line eqeqeq
    if (!isOnline(toId)) {
      removeFromBusy(fromId)
      emitEvent(io, [socket.id], 'user offline')
      return false
    }
    let receiverSocketIds = getSocketIdsFromUserId(data.to)

    opentok.createSession(function (err, session) {
      if (err) {
        removeFromBusy(fromId)
        io.to(socket.id).emit('error', 'Cannot generate token')
        return false
      }
      let sessionId = session.sessionId
      let token = opentok.generateToken(sessionId)
      var callerData = {
        apiKey: apiKey,
        sessionId: sessionId,
        token: token,
        socketId: socket.id
      }
      emitEvent(io, [socket.id], 's-apiTokens', callerData)
      var receiverData = {
        'apiKey': apiKey,
        'sessionId': sessionId,
        'token': token,
        'callFrom': socket.id,
        'name': data.name
      }
      // emitEvent(io, receiverSocketIds, 's-apiTokens', receiverData)
      emitEvent(io, receiverSocketIds, 's-userCalling', receiverData)
      markAsBusy(toId)
    })
  })

  socket.on('disconnect', function () {
    if (users[socket.id]) {
      socket.broadcast.emit('s-userOffline', users[socket.id].id)
      removeFromBusy(users[socket.id].id)
      removeSocket(socket.id)
    }
  })
  socket.on('r-userInactive', (socketId) => {
    console.log(socketId)
    if (socketId) {
      if (socketExists(socketId) && users[socketId]) {
        removeFromBusy(users[socketId].id)
      }
      removeFromBusy(users[socket.id].id)
      emitEvent(io, [socketId], 's-userInactive', { userId: users[socket.id].id })
    }
  })
  socket.on('r-callAccepted', (data) => {
    markAsBusy(users[data])
    markAsBusy(users[socket.id].id)
    let socketIds = getSocketIdsFromSocketId(socket.id)
    socketIds.forEach((socketId) => {
      if (socketId != socket.id) {
        emitEvent(io, [socketId], 's-anotherDeviceReceivedCall')
      }
    })
    emitEvent(io, [data], 's-callAccepted')
  })

  socket.on('c-cancelCall', (data) => {
    let socketIds = getSocketIdsFromUserId(data.to)
    emitEvent(io, socketIds, 's-callCancel')
    removeFromBusy(data.from)
    removeFromBusy(data.to)
  })

  socket.on('r-callRejected', (socketId) => {
    let callerSocketIds = getSocketIdsFromSocketId(socket.id)
    callerSocketIds.forEach((socketId) => {
      if (socketId != socket.id) {
        emitEvent(io, [socketId], 's-anotherCallerRejectedCall')
      }
    })
    emitEvent(io, [socketId], 's-callRejected')
    if (users[socketId]) {
      removeFromBusy(users[socketId].id)
      removeFromBusy(users[socket.id].id)
    }
  })

  socket.on('endCall', (data) => {
    console.log('from inside endcall, received from ender' + data)
    console.log('from inside endcall, socket id of user who ended' + users[socket.id].id)
    removeFromBusy(users[socket.id].id)
    if (data) {
      removeFromBusy(users[data].id)
    }
    let socketIds = getSocketIdsFromSocketId(data)
    emitEvent(io, socketIds, 'endCall')
  })

  // Razeev
  socket.on('sendChat', (data) => {
    var userTo = data.to
    var userFrom = data.from
    var message = data.text.trim()
    var messageTime = new Date().getTime()
    var messageType = data.messageType == 3 ? 3 : 0
    if (message.length > 0) {
      if (isOnline(userTo)) {
        var receiverUsers = getSocketIdsFromUserId(userTo)
        var emitingData = {
          from: userFrom,
          to: userTo,
          message: message,
          messageTime: messageTime,
          messageType: messageType
        }
        messages.push(emitingData)
        emitEvent(io, receiverUsers, 'receiveChat', emitingData)
        saveData(userFrom, userTo, emitingData)
      } else {
        var notificationData = {
          from: userFrom,
          to: userTo,
          message: message,
          messageTime: messageTime,
          messageType: messageType
        }
        messages.push(notificationData)
        sendNotification(userFrom, userTo, message)
      }
    }
  })
  socket.on('requestGetChat', (data) => {
    console.log(data)
    var chatData = getUserMessages(data.from, data.to)
    emitEvent(io, [socket.id], 'responseGetChat', chatData)
  })
  socket.on('typingIndicatorSend', (data) => {
    data = getSocketIdsFromUserId(data)
    emitEvent(io, data, 'typingIndicatorGet', 'Typing..')
  })
})

app.get('/', function (req, res) {
  res.send('hello world')
})

http.listen(port, function () {
  console.log(`Listening on ${port}`)
})

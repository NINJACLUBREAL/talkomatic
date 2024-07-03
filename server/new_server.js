const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const {parse} = require("cookie")
const compression = require('compression');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const session = require('express-session')
const OFFENSIVE_WORDS = require('../js/offensiveWords.js');
const dotenv = require("dotenv")
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(bodyParser.json());

const rooms = new Map();
const activeUsers = new Map();
const roomDeletionTimeouts = new Map();
const bannedUsers = new Map();

app.use(express.static(path.join(__dirname)));
app.use(cookieParser());
app.use(compression());
const sessionMiddleware = session({
    secret: "changeit",
    resave: true,
    saveUninitialized: true,
  });
  
app.use(sessionMiddleware);
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'","'unsafe-inline'"],
            scriptSrc: ["'self'", "https://ajax.googleapis.com/", "https://cdnjs.cloudflare.com/","https://unpkg.com", "'unsafe-inline'"],
            scriptSrcAttr:["'self'","'unsafe-inline'"],
            styleSrc: ["'self'", "https://cdnjs.cloudflare.com/","https://cdn.jsdelivr.net/", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https://cdnjs.cloudflare.com/"],
            connectSrc: ["'self'", "ws://localhost:3000"],
            frameSrc: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    crossOriginEmbedderPolicy: false,
}));
// app.use(rateLimit({
//     windowMs: 15 * 60 * 1000,
//     max: 100
// }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../html/index.html'));
});
app.get("*.html", (req,res) => {
    res.sendFile(path.join(__dirname, `../html${req.params[0]}.html`));
})
app.get("*.css", (req,res) => {
    res.sendFile(path.join(__dirname, `../css${req.params[0]}.css`));
})

app.get("*.js", (req,res) => {
    res.sendFile(path.join(__dirname, `../js${req.params[0]}.js`));
})




app.get("/images/*", (req,res) => {
    res.sendFile(path.join(__dirname, `../images/${req.params[0]}`));
})
app.get("*.png", (req,res) => {
    res.sendFile(path.join(__dirname, `../images${req.params[0]}.png`));
})

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../html/index.html'));
});
app.get('/offensive-words', (req, res) => {
    res.json(OFFENSIVE_WORDS);
});

app.get("/manifest.json",(req,res)=>{
    res.sendFile(path.join(__dirname, '../manifest.json'));
})
app.get('/removed', (req, res) => {
    res.sendFile(path.join(__dirname, '../html/removed.html'));
});
app.get('/*.wav', (req, res) => {
    res.sendFile(path.join(__dirname, `../audio/${req.params[0]}.wav`));
});

app.get("*.jpg", (req,res) => {
    res.sendFile(path.join(__dirname, `../images/${req.params[0]}.jpg`));
})


app.post('/verify-mod-code', (req, res) => {
    const { code, userId } = req.body;
    const correctCode = '786215'; // Your actual mod code

    if (code === correctCode && allowedMods.includes(userId)) {
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});



const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

function filterObject(obj, callback) {
    return Object.fromEntries(Object.entries(obj).
      filter(([key, val]) => callback(val, key)));
}
function generateRoomId() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

io.engine.use(sessionMiddleware);
io.setMaxListeners(0);
io.on('connection', (socket) => {
    socket.on('userConnected', () => {

        socket.request.session.reload((err) => {
            if (err) {
              return socket.disconnect();
            }
            activeUsers[socket.request.session.id] = parse(socket.handshake.headers.cookie);
            socket.request.session.save();
          });
    });

    socket.on('userDisconnected', () => {
        if (activeUsers[socket.request.session.id]){

            activeUsers.delete(socket.request.session.id);
        }
    });

    socket.on('searchRoom',(data)=>{
        const room = rooms.get(data.roomId);
        socket.emit("searchResult",room && room.type !== 'secret' ? room : null);
    })

    socket.on('getExistingRooms',()=>{
        socket.emit('existingRooms', [...rooms.values()].filter(room => {return room.type == 'public'}))
    })

    socket.on("createRoom",(data)=>{
        const {name,type} = data;

        if (!name  || !["secret","private","public"].includes(type)) {
            return socket.emit('error', 'Invalid input');
        }

        const roomId = generateRoomId() 
        rooms.set(roomId, {name,type,id:roomId,users:[],ownerId:activeUsers[socket.request.session.id].userId,votes:{}})
        if (type == 'public') {
            io.emit('roomCreated', rooms.get(roomId));
        }
        else {
            socket.emit('roomCreated', rooms.get(roomId))
        }
        
    })
    socket.on("joinRoom",(data)=>{
        if (!activeUsers[socket.request.session.id]) {return;}

        const {location,username,userId,userAvatar,userColor} = activeUsers[socket.request.session.id];
        const room = rooms.get(data.roomId);

        if(!room) {
            return socket.emit("roomNotFound");
        }

        if(room.users.length > 5) {
            return socket.emit("roomFull");
        }
        if(room.users.filter((user)=>{return user.userId == userId}).length) {
            socket.emit("duplicateUser",{ message: 'You are already in this room.', redirectUrl: '../index.html' });
            socket.disconnect()
            return;
        }

        const user = {color:userColor,location,username,avatar:userAvatar,userId};

        room.users.push(user);

        if(room.type=="public") {
            io.emit('roomUpdated', room);
        }
        socket.join(room.id)
        socket.emit("initializeUsers",room.users);
        socket.to(room.id).emit("userJoined",user);
    })

    socket.on("disconnected",(reason)=>{
        rooms.forEach((room)=>{
            let user =  room.users.filter((user)=>{return user.userId == activeUsers[socket.request.session.id].userId });
            if (user) {
                delete room.users[room.users.indexOf(user)];
                socket.to(room).emit("userLeft", user)
            }
            })
    })

    socket.on("leaveRoom",(data)=> {
        const {roomId} = data;
        const room = rooms.get(roomId)
        if (!room) {
            return socket.emit("roomNotFound");
        } 
        const user = room.users.find((user)=>{return user.userId == activeUsers[socket.request.session.id].userId })
        if (user == undefined) {
            return socket.emit("notInRoom");
        }
        socket.to(room.id).emit("userLeft", user)
        room.users = room.users.filter((room_user)=>{return room_user.userId != user.userId })
        if(room.type=="public") {
            io.emit('roomUpdated', room);
        }
    })

    socket.on('typing',(data)=>{
        const {roomId,message} = data;
        const {userColor,userId} = activeUsers[socket.request.session.id]
        socket.to(roomId).emit("typing",{roomId,message,color:userColor,userId})

    })



    socket.onAny((event,...args) => {
        console.log(`client: ${event} {${args}}`)

    })
})
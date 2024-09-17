// todo = implement the session class
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
const {Sessions} = require("./sessions.js")
const {Rooms} = require("./rooms.js")
require("dotenv").config()

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(bodyParser.json());



app.use(express.static(path.join(__dirname)));
app.use(cookieParser());
app.use(compression());
const sessionMiddleware = session({
    secret: process.env.SECRET,
    // resave: true,
    // saveUninitialized: true,
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
//     windowMs: 150 * 60 * 1000,
//     max: 1000
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

const port = process.env.PORT || 3000;

function filterObject(obj, callback) {
    return Object.fromEntries(Object.entries(obj).
      filter(([key, val]) => callback(val, key)));
}
function generateRoomId() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
}

const rooms = new Rooms;
const activeUsers = new Map();
const roomDeletionTimeouts = new Map();
const bannedUsers = new Map();

const sessions = new Sessions
function updateCounts() {
    io.emit("updateCounts",{roomsCount: [...rooms.rooms.values()].filter((room)=>{return room.type == "public"}).length, usersCount: sessions.sessions.size})
}

sessions.on("newSession",updateCounts)
sessions.on("sessionDelete",updateCounts)

rooms.on("roomUpdated",(room)=>{

    if(room.type == "public") {   
        io.emit("roomUpdated",room)
    } 
})
rooms.on("roomDeleted",(data)=>{
    const [key,room] = Object.entries(data)[1];
    if(room.type == "public") {
        io.emit("roomRemoved",room.id)
    } 
})


io.engine.use(sessionMiddleware);
io.setMaxListeners(0);
io.on('connection', (socket) => {
    let session_id = socket.request.session.id;


    socket.on('userConnected', () => {
        updateCounts() 
        if(sessions.get(session_id)) {
            return socket.emit("alreadyConnected")
        }
        sessions.set(session_id,filterObject(parse(socket.handshake.headers.cookie),(value,key)=>{return ["userId","userColor","userAvatar","username","location"].includes(key)}));

        sessions.update(session_id,{modMode:false})

    });

    socket.on('userDisconnected', (data) => {
        if (sessions.get(session_id) && !data.saveSession){
            sessions.delete(session_id)
        }
    });

    socket.on("verifyModCode",(data)=>{
        if(sessions.get(session_id).modMode){
            return socket.emit("modVerification",{success:true});
        }
        const {code} = data;
        sessions.get(session_id).modMode = code === process.env.MOD_CODE;
        socket.emit("modVerification",{success:code===process.env.MOD_CODE})
    })
    socket.on('searchRoom',(data)=>{
        const room = rooms.get(data.roomId);
        socket.emit("searchResult",room && room.type !== 'secret' ? room : null);
    })

    socket.on('getExistingRooms',()=>{
        socket.emit('existingRooms', [...rooms.rooms.values()].filter(room => {return room.type == 'public'}))
    })

    socket.on("createRoom",(data)=>{
        const {name,type} = data;

        if (!name  || !["secret","private","public"].includes(type)) {
            return socket.emit('error', 'Invalid input');
        }
        const roomId = generateRoomId() 
        rooms.set(roomId, {name,type,id:roomId,users:[],ownerId:sessions.get(session_id).userId,votes:{}})
        if (type == 'public') {
            io.emit('roomCreated', rooms.get(roomId));
        }
        else {
            socket.emit('roomCreated', rooms.get(roomId))
        }
        
    })
    socket.on("joinRoom",(data)=>{
        if(!sessions.get(session_id)) {return}
        const {location,username,userId,userAvatar,userColor,modMode} = sessions.get(session_id);
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

        const user = {color:userColor,location,username,avatar:userAvatar,userId,modMode};

        rooms.addUser(data.roomId,user);
        socket.join(room.id)
        socket.emit("initializeUsers",room.users);
        socket.to(room.id).emit("userJoined",user);
    })

    socket.on("disconnected",(reason)=>{
        
        rooms.forEach((room)=>{
            let user =  room.users.filter((user)=>{return user.userId == sessions.get(session_id).userId });
            if (user) {
                delete room.users[room.users.indexOf(user)];
                socket.to(room).emit("userLeft", user)
            }
            })
            sessions.delete(session_id)
    })

    socket.on("leaveRoom",(data)=> {
        const {roomId} = data;
        if(!sessions.get(session_id)) {
            return socket.emit("notConnected")
        }
        const room = rooms.get(roomId)
        if (!room) {
            return socket.emit("roomNotFound");
        } 
        const user = room.users.find((user)=>{return user.userId == sessions.get(session_id).userId })
        if (user == undefined) {
            return socket.emit("notInRoom");
        }
        socket.to(room.id).emit("userLeft", user)
        rooms.deleteUser(room.id,user);
    })

    socket.on('typing',(data)=>{
        const {roomId,message} = data;
        const {userColor,userId} = sessions.get(session_id)
        socket.to(roomId).emit("typing",{roomId,message,color:userColor,userId})

    })




    socket.onAny((event,...args) => {
        console.log(`client: ${event} {${args}}`)

    })
})

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const OFFENSIVE_WORDS = require('../js/offensiveWords.js');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(bodyParser.json());

const rooms = new Map();
const activeUsers = new Set();
const roomDeletionTimeouts = new Map();
const bannedUsers = new Map();

app.use(express.static(path.join(__dirname)));
app.use(cookieParser());
app.use(compression());
// app.use(helmet());
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


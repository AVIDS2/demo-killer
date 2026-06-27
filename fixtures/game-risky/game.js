const Phaser = require("phaser");
const io = require("socket.io")(3000);
function preload() { this.load.image("player", "https://cdn.example.com/player.png"); }
function update() { player.x += 5; }
let score = 0;
function collectStar() { score += 10; }
io.on("connection", (socket) => { socket.on("move", (data) => {}); });

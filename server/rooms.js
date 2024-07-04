const EventEmitter = require("node-cache")

exports.Rooms = class Rooms {
    constructor() {
        this.__rooms = new Map()
        this.__emitter = new EventEmitter()
        this.__roomTimeouts = new Map()
        this.__emitter.on("newUser",(data)=>{
            const [[key,id]] = Object.entries(data);
            this.__emitter.emit("roomUpdated",id)
             // if amount of users is 1, while someone joined, this means that previously it was 0
            this.__rooms.get(id).users.length == 1 && this.clearTimeout(id)
        })
        this.__emitter.on("userDeleted",(data)=>{
            const [[key,id]] = Object.entries(data);
            this.__emitter.emit("roomUpdated",id)
            !this.__rooms.get(id).users.length && this.newTimeout(id,10000,(id)=>{this.delete(id)})
        })
    };
    set(id,room) {
        this.__rooms.set(id,room);
        this.__emitter.emit("newRoom",{id,room})
    };
    newTimeout(id,time,callback) {
        if (!this.rooms.get(id) || this.__roomTimeouts.get(id)) {return;}
        this.__roomTimeouts.set(id,new setTimeout(callback,time,id))
    }
    clearTimeout(id) {
        if (!this.rooms.get(id) || !this.__roomTimeouts.get(id)) {return;}
        this.__roomTimeouts.get(id).clearTimeout()
        this.__roomTimeouts.delete(id)
    }
    get(id) {
        return this.__rooms.get(id);
    }
    get rooms() {
        return this.__rooms
    }
    addUser(id,user) {
        if (!this.__rooms.get(id) || this.__rooms.get(id).users.filter((_user)=>{return _user.userId == user.userId}).length) {return}
        this.__rooms.get(id).users.push(user)
        this.__emitter.emit("newUser",{id,user})
    }
    deleteUser(id,user) {
        if (!this.__rooms.get(id) || !this.__rooms.get(id).users.filter((_user)=>{return _user.userId == user.userId}).length) {return}
        this.__rooms.get(id).users =  this.__rooms.get(id).users.filter((_user)=>{return _user.userId != user.userId})
        this.__emitter.emit("userDeleted",{id,user})
    }
    
    delete(id) {
        this.__emitter.emit("roomDeleted",{id,room:this.__rooms.get(id)})
        this.__rooms.delete(id)
        this.clearTimeout(id)
        

    }
    on(event,callback) {
        this.__emitter.on(event,callback);
    }
    off(event,callback) {
        this.__emitter.off(event,callback)
    }

}
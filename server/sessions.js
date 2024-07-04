const EventEmitter = require("node-cache")

exports.Sessions = class Sessions {
    constructor() {
        this.__sessions = new Map()
        this.__emitter = new EventEmitter()
    };
    set(id,content) {
        this.__sessions.set(id,content);
        this.__emitter.emit("newSession",{id:content})
    };
    get(id) {
        return this.__sessions.get(id);
    }
    get sessions() {
        return this.__sessions
    }
    update(id,content) {
        this.__sessions.set(id,Object.assign(this.__sessions.get(id),content))
    }
    delete(id) {
        this.__sessions.delete(id)
        this.__emitter.emit("sessionDeleted",{id:this.__sessions.get(id)})
    }
    on(event,callback) {
        this.__emitter.on(event,callback);
    }
    off(event,callback) {
        this.__emitter.off(event,callback)
    }

}
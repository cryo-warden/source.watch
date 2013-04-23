(function (global) {
    'use strict';
    function eachInObject(obj, fn) {
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                fn(obj[key], key, obj);
            }
        }
    }

    function allSetInObject(obj) {
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (obj[key] === null || obj[key] === void 0) { // obj[key] == null is good enough
                    return false;
                }
            }
        }
        
        return true;
    }

    function objectMerge(target, obj) {
        eachInObject(obj, function (v, k) {
            target[k] = v;
        });
    }

    function callFn(fn) {
        if (fn) { fn(); }
    }
    
    var setTimeout = global.setTimeout;
    function nextTick(fn) { setTimeout(fn, 1); }

    function createCounter() {
        var value = 0;
        return function () {
            return value++;
        };
    }

    var addTickEvent = (function () {
        var cbMap = {};
        var pendingTickEvent = false;

        function executeCBs() {
            var tempCBMap = cbMap;
            pendingTickEvent = false;
            cbMap = {};
            eachInObject(tempCBMap, callFn);
        }

        return function addTickEvent(id, cb) {
            cbMap[id] = cb;
            if (pendingTickEvent) { return; }
            nextTick(executeCBs);
            pendingTickEvent = true;
        };
    }());

    function makeClass(methodMap) {
        var construct = methodMap._construct;
        function Class() {
            if (construct) {
                construct.call(this);
            }
        }
        var proto = Class.prototype;
        proto.constructor = Class;
        objectMerge(proto, methodMap);
        return Class;
    }

    var activeWatcher = null;
    var Watcher = (function () {
        var counter = createCounter();
        return makeClass({
            _construct: function () {
                this._id = '_watcher_' + counter();
                this._sourceMap = {};
                this._children = {};
                this._parent = activeWatcher;
                if (activeWatcher) {
                    activeWatcher._children[this._id] = this;
                }
            },
            _execute: function () {
                var watcher = this;
                addTickEvent(this._id, function () {
                    if (!watcher._code) { return; }
                    var prevWatcher = activeWatcher;
                    activeWatcher = watcher;
                    try {
                        watcher._code();
                    } finally {
                        activeWatcher = prevWatcher;
                    }
                });
            },
            _cleanup: function () {
                var watcher = this;
                eachInObject(this._sourceMap, function (source) {
                    source._removeWatcher(watcher);
                });
                this._sourceMap = {};
                eachInObject(this._children, function (child) {
                    child.dispose();
                });
                this._children = {};
            },
            dispose: function () {
                this._code = null;
                this._cleanup();
            }, // TODO add onDispose ?
            watch: function (code) {
                this._code = code;
                this.invalidate();
            },
            invalidate: function () {
                this._cleanup();
                this._execute();
            }
        });
    }());
    
    function unwatch(code) {
        var prevWatcher = activeWatcher;
        activeWatcher = null;
        try {
            code();
        } finally {
            activeWatcher = prevWatcher;
        }
    }

    var Waiter = (function () {
        return makeClass({
            _construct: function () {
                this._watcher = new Watcher();
            },
            await: function (buildObject, code) {
                this._watcher.watch(function () {
                    var obj = buildObject();
                    if (allSetInObject(obj)) {
                        code(obj);
                    }
                });
            },
            dispose: function () {
                this._watcher.dispose();
            },
            invalidate: function () {
                this._watcher.invalidate();
            }
        });
    }());
    
    var Source = (function () {
        var counter = createCounter();
        return makeClass({
            _construct: function () {
                this._id = '_source_' + counter();
                this._propertyWatcherMap = {};
            },
            _addWatcher: function (pName, w) {
                if (!w) { return; }
                var pwMap = this._propertyWatcherMap;
                var wMap = pwMap[pName] || (pwMap[pName] = {});
                wMap[w._id] = w;
                w._sourceMap[this._id] = this;
            },
            _removeWatcher: function (w) {
                eachInObject(this._propertyWatcherMap, function (pMap) {
                    delete pMap[w._id];
                });
            },
            pull: function (propertyName) {
                this._addWatcher(propertyName, activeWatcher);
            },
            push: function (propertyName) {
                eachInObject(this._propertyWatcherMap[propertyName], function (watcher) {
                    if (watcher) {
                        watcher.invalidate();
                    }
                });
            }
        });
    }());

    global.sourceWatch = {
        watcher: function () {
            return new Watcher();
        },
        watch: function (code) {
            var watcher = new Watcher();
            watcher.watch(code);
            return watcher;
        },
        unwatch: unwatch,
        waiter: function () {
            return new Waiter();
        },
        await: function (buildObj, code) {
            var waiter = new Waiter();
            waiter.await(buildObj, code);
            return waiter;
        },
        source: function () {
            return new Source();
        }
    };
}(this));
(function (global) {
    'use strict';
    
    var undef = void 0;
    
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
                if (obj[key] == null) {
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
    
    function indexInArray(arr, value) {
        for (var i = 0, il = arr.length; i < il; i++) {
            if (arr[i] === value) {
                return i;
            }
        }
        return -1;
    }

    function removeFromArray(arr, value) {
        var index = indexInArray(arr, value);
        if (index >= 0) {
            arr.splice(index, 1);
        }
    }

    function callFn(fn) { if (fn) { fn(); } }
    
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

    var deriving = false;
    function makeClass(methodMap) {
        var BaseClass = methodMap.BaseClass || Object;
        var construct = methodMap._construct;
        function Class() {
            if (construct && !deriving) {
                construct.apply(this, arguments);
            }
        }
        deriving = true;
        var proto = Class.prototype = new BaseClass();
        deriving = false;
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
                    try {
                        activeWatcher = watcher;
                        watcher._code(watcher);
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
    function watcher() { return new Watcher(); }
    function watch(code) {
        var watcher = new Watcher();
        watcher.watch(code);
        return watcher;
    }
    function unwatch(code) {
        var prevWatcher = activeWatcher;
        var result;
        try {
            activeWatcher = null;
            result = code();
        } finally {
            activeWatcher = prevWatcher;
        }
        return result;
    }

    var Waiter = (function () {
        return makeClass({
            _construct: function () {
                this._watcher = new Watcher();
            },
            await: function (buildObject, code, elseCode) {
                this._watcher.watch(function () {
                    var obj = buildObject();
                    if (allSetInObject(obj)) { // also compare last obj?
                        code(obj);
                    } else if (elseCode) {
                        elseCode(obj);
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
    function waiter() { return new Waiter(); }
    function await(buildObj, code, elseCode) {
        var waiter = new Waiter();
        waiter.await(buildObj, code, elseCode);
        return waiter;
    }

    var Source = (function () {
        var counter = createCounter();
        return makeClass({
            _construct: function () {
                this._id = '_source_' + counter();
                this._propertyWatcherMap = {};
            },
            _removeWatcher: function (w) {
                eachInObject(this._propertyWatcherMap, function (pMap) {
                    delete pMap[w._id];
                });
            },
            pull: function (propertyName) {
                var w = activeWatcher;
                if (!w) { return; }
                var pwMap = this._propertyWatcherMap;
                var wMap = pwMap[propertyName] || (pwMap[propertyName] = {});
                wMap[w._id] = w;
                w._sourceMap[this._id] = this;
            },
            push: function (propertyName) {
                eachInObject(this._propertyWatcherMap[propertyName], function (watcher) {
                    if (watcher) { watcher.invalidate(); }
                });
            }
        });
    }());
    function source() { return new Source(); }

    function makeGetter(key) {
        return function () {
            this._source.pull(key);
            return this[key];
        };
    }
    function makeSetter(key) {
        return function (newValue) {
            var oldValue = this[key];
            if (oldValue !== newValue) {
                this[key] = newValue;
                this._source.push(key);
            }
            return this;
        };
    }
    function makeProperty(key) {
        return function (newValue) {
            if (newValue === undef) {
                this._source.pull(key);
                return this[key];
            }
            var oldValue = this[key];
            if (oldValue !== newValue) {
                this[key] = newValue;
                this._source.push(key);
            }
            return this;
        };
    }

    var List = (function () {
        var ListValue = makeClass({
            _construct: function (index, value) {
                this._source = new Source();
                this._index = index;
                this._value = value;
            },
            index: makeProperty('_index'),
            value: makeProperty('_value')
        });
        return makeClass({
            _construct: function (data) {
                this._source = new Source();
                this._data = [];
                this.append(data);
            },
            data: makeGetter('_data'), // eliminate data() in favor of map()?
            size: function () {
                this._source.pull('_size');
                return this._data.length;
            },
            get: function (index) {
                this._source.pull(index);
                var lv = this._data[index];
                return lv && lv.value();
            },
            set: function (index, newValue) {
                if (index === ~~index && ~index < 0) {
                    throw new Error('Index must be a non-negative integer: ' + index);
                }
                var data = this._data;
                var source = this._source;
                if (index >= data.length) {
                    source.push('_size');
                    data[index] = new ListValue(index, newValue);
                }
                var oldValue = data[index];
                if (oldValue !== newValue) {
                    data[index] = newValue;
                    source.push(index);
                    source.push('_data');
                }
                return this;
            },
            _pushIndices: function (index) {
                var data = this._data;
                var source = this._source;
                for (var i = index, il = data.length; i < il; i++) {
                    data[i].index(i);
                    source.push(i);
                }
            },
            del: function (index) {
                if ((index !== ~~index && index !== '' + ~~index) || ~index < 0) {
                    throw new Error(
                        'Index must be a non-negative integer or a similar string: ' + index
                    );
                }
                var data = this._data;
                if (index < data.length) {
                    var source = this._source;
                    data.splice(index, 1);
                    source.push('_size');
                    this._pushIndices(index);
                    source.push('_data');
                }
                return this;
            },
            splice: function (index, removeSize, inserts) {
                var data = this._data;
                var source = this._source;
                var spliceArgs = [index, removeSize];
                if (inserts) {
                    var insertLength = inserts.length;
                    for (var i = 0; i < insertLength; i++) {
                        spliceArgs[i + 2] = new ListValue(index + i, inserts[i]);
                    }
                    data.splice.apply(data, spliceArgs);
                    if (removeSize !== insertLength) {
                        this._pushIndices(index + insertLength);
                    }
                } else {
                    data.splice.apply(data, spliceArgs);
                    this._pushIndices(index);
                }
                source.push('_data');
                return this;
            },
            push: function (newValue) {
                return this.splice(this._data.length, 0, [newValue]); // TODO minimize impact?
            },
            pop: function () {
                return this.splice(this._data.length, 1); // TODO minimize impact?
            },
            shift: function () {
                return this.splice(0, 1);
            },
            unshift: function (newValue) {
                return this.splice(0, 0, [newValue]);
            },
            append: function (arr) {
                return this.splice(this._data.length, 0, arr);
            },
            remove: function (value) {
                var data = this._data;
                for (var i = 0, il = data.length; i < il; i++) {
                    if (data[i]._value === value) {
                        return this.del(i);
                    }
                }
                return this;
            },
            each: function (fn) {
                var data = this.data();
                for (var i = 0, il = data.length; i < il; i++) {
                    fn(data[i]);
                }
                return this;
            },
            eachWatch: function (fn) {
                return this.each(function (listValue) {
                    watch(function () {
                        fn(listValue);
                    });
                });
            }
        });
    }());
    function list (data) { return new List(data); }
    
    //var HashList; // TODO ?

    var Dictionary = (function () {
        return makeClass({
            _construct: function () {
                this._source = new Source();
                this._data = {};
                this._size = 0;
                this._keys = []; // TODO use reactive list?
            },
            data: makeGetter('_data'),
            size: makeGetter('_size'),
            keys: makeGetter('_keys'),
            get: function (key) {
                this._source.pull(key);
                return this._data[key];
            },
            set: function (key, newValue) {
                if (
                    key === '_size' || key === '_keys' ||
                    key === '_data' || key === 'hasOwnProperty'
                ) {
                    throw new Error('Key is reserved: ' + key);
                }
                var data = this._data;
                var source = this._source;
                if (!data.hasOwnProperty(key)) {
                    this._size += 1;
                    source.push('_size');
                    this._keys.push(key);
                    source.push('_keys');
                }
                var oldValue = data[key];
                if (oldValue !== newValue) {
                    data[key] = newValue;
                    source.push(key);
                    source.push('_data');
                }
                return this;
            },
            del: function (key) {
                var data = this._data;
                if (data.hasOwnProperty(key)) {
                    var source = this._source;
                    this._size -= 1;
                    source.push('_size');
                    removeFromArray(this._keys, key);
                    source.push('_keys');
                    delete data[key];
                    source.push(key);
                    source.push('_data');
                }
                return this;
            },
            each: function (fn) {
                var keys = this.keys();
                var data = this.data();
                for (var i = 0, il = keys.length; i < il; i++) {
                    var key = keys[i];
                    fn(data[key], key);
                }
                return this;
            },
            eachWatch: function (fn) {
                var source = this._source;
                return this.each(function (value, key) {
                    watch(function () {
                        source.pull(key);
                        fn(value, key);
                    });
                });
            },
            extend: function (obj) {
                var dict = this;
                eachInObject(obj, function (value, key) {
                    dict.set(key, value);
                });
                return this;
            }
        });
    }());
    function dictionary () { return new Dictionary(); }

    global.sourceWatch = {
        watcher: watcher,
        source: source,

        watch: watch,
        unwatch: unwatch,
        waiter: waiter,
        await: await,

        makeGetter: makeGetter,
        makeSetter: makeSetter,
        makeProperty: makeProperty,

        list: list,
        dictionary: dictionary
    };
}(this));

var global = window;
jQuery(function ($) {
    'use strict';

    var sw = global.sourceWatch;

    var log = (function () {
        var c = global.console;
        var l = c.log;
        return function () { return l.apply(c, arguments); };
    }());
    
    function makeProp(key, onChange) {
        return function (value) {
            if (value === void 0) {
                this._source.pull(key);
                return this[key];
            }
            this._source.push(key);
            this[key] = value;
            if (onChange) {
                onChange.call(this, value, key);
            }
            return this;
        };
    }
    
    var Pet = (function () {
        function Pet(name, kind) {
            this._source = sw.source();
            this.name(name).kind(kind);
        }
        
        var proto = Pet.prototype;
        
        proto.name = makeProp('_name');
        proto.kind = makeProp('_kind');
        proto.title = function () {
            return this.name() + ' the ' + this.kind();
        };
        
        return Pet;
    }());
    
    var Person = (function () {
        function Person(name) {
            this._source = sw.source();
            this.name(name).describe();
        }
        
        var proto = Person.prototype;
        
        proto.name = makeProp('_name');
        proto.pet = makeProp('_pet', function () {
            var person = this;
            sw.unwatch(function () {
                person.describe();
            });
        });
        proto.describe = function () {
            var pet = this.pet();
            if (pet) {
                log(this.name() + ' has a pet, ' + pet.title() + '.');
            } else {
                log(this.name() + ' has no pet.');
            }
        };
        
        return Person;
    }());
    
    var watchers = [
        sw.watcher(),
        sw.watcher()
    ];
    
    var paula = new Person('Paula');
    var mike = new Person('Mike');
    var alex = new Person('Alex');
    var lyle = new Person('Lyle');
    
    var people = [
        paula,
        mike,
        alex,
        lyle
    ];
    
    var scruffie = new Pet('Scruffie', 'Janitor');
    var mittens = new Pet('Mittens', 'Howling Bat');
    var grrder = new Pet('Grrder', 'Cyber-Puppy');
    
    paula.pet(scruffie);
    mike.pet(mittens);
    alex.pet(grrder);
    
    var waiter = sw.waiter();

    sw.watch(function () {
        var $target = $('.renderTarget').text('');
        $.each(people, function (i, person) {
            var $personTarget = $('<div />').attr('class', person.name());
            $target.append($personTarget);
            sw.watch(function () {
                var pet = person.pet();
                if (pet) {
                    $personTarget.text(person.name() + ' has a pet: ' + pet.title() + '.');
                } else {
                    $personTarget.text(person.name() + ' has no pet.');
                }
            });
        });

        // cancel these re-renders on click
        var watcher = this;
        $target.click(function () {
            watcher.dispose();
        });
    });
    
    waiter.await(function () {
        return [
            paula.pet(),
            mike.pet(),
            alex.pet(),
            lyle.pet()
        ];
    }, function () {
        log('everyone has a pet');
        paula.describe();
        mike.describe();
        alex.describe();
        lyle.describe();
    });
    
    log('coding watchers[0]');
    watchers[0].watch(function () {
        log('executing watchers[0]');
        paula.describe();
        lyle.describe();
    });
    
    log('coding watchers[1]');
    watchers[1].watch(function () {
        log('executing watchers[1]');
        mike.describe();
        log('unwatching Paula');
        sw.unwatch(function () {
            paula.describe();
        });
        alex.describe();
    });

    global.setTimeout(function () {
        log('executing 2000ms timeout');
        paula.pet(grrder);
    }, 2000);

    global.setTimeout(function () {
        log('executing 4000ms timeout');
        paula.pet(mittens);
        mike.pet(grrder);
        log('re-coding watchers[0]');
        watchers[0].watch(function () {
            log('executing watchers[0]');
            mike.describe();
            alex.describe();
        });
    }, 4000);
    
    global.setTimeout(function () {
        log('executing 6000ms timeout');
        alex.pet(scruffie);
        log('disposing watchers[0]');
        watchers[0].dispose();
    }, 6000);
    
    global.paula = paula;
    global.mike = mike;
    global.alex = alex;
    global.lyle = lyle;
    global.scruffie = scruffie;
    global.mittens = mittens;
    global.grrder = grrder;

});
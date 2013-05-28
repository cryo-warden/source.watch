var global = window;
jQuery(function ($) {
    'use strict';

    var sw = global.sourceWatch;

    var log = (function () {
        var c = global.console;
        var l = c.log;
        return function () { return l.apply(c, arguments); };
    }());
    
    function logTime() {
        var args = [].slice.call(arguments);
        args.unshift(+new Date());
        log.apply(null, args);
    }
    
    var list = sw.list('abcdefgh'.split(''));
    
    sw.watch(function () {
        logTime('full render');
        var $target = $('.renderTarget').text('');
        list.each(function (lv) {
            var $subTarget = $('<li />').appendTo($target);
            sw.watch(function () {
                var renderedText = lv.index() + ': ' + lv.value();
                logTime('partial render, ' + renderedText);
                $subTarget.text(renderedText);
            });
        });
    });
    
    global.list = list;
});
var http = require("http");
var path = require("path");

module.exports = function () {
    this.transpond = function (req, res) {
        var port = req.headers.host.split(":")[1] || 80;
        var rootPath = process.argv[process.argv.indexOf('--root') + 1];
        var configFullPath = path.join(rootPath, "transpond-config.js");
        delete require.cache[configFullPath];
        try {
            var transRules = require(configFullPath).TranspondRules;
        } catch(e) {
            res.writeHead("404");
            res.write("Cannot find transpond-config.js!");
            res.end();
            return false;
        }
        
        if (!transRules) {
            res.writeHead("404");
            res.write("transpond-config.js setting error!");
            res.end();
            return false;
        }

        if (transRules && transRules.ajaxOnly && !req.headers.accept.match(/application\/json/)) {
            res.writeHead("404");
            res.write("404");
            res.end();
            console.log("transpond \033[31m%s\033[m canceled, modify the config.js to transpond this.", req.headers.host + req.url);
            return false;
        }
        var transCurrent = transRules;
        if (!transCurrent) {
            console.error('The transponding rules of port"' + port + '" is not defined, please check the transpond-config.js!');
            return false;
        }

        var options = {
            headers: JSON.parse(JSON.stringify(req.headers)),
            host: transCurrent.targetServer.host,
            path: req.url,
            method: req.method,
            port: transCurrent.targetServer.port || 80
        };


        // 添加是否hack Header信息开关
        if (transCurrent.hackHeaders) {
            options.headers.host = options.host + ':' + (transCurrent.targetServer.port || 80);
            options.headers.referer = 'http://'+options.host;
        }

        //匹配regExpPath做特殊转发
        var i;

        for (i in transCurrent.regExpPath) {
            if (req.url.match(i)) {
                options.host = transCurrent.regExpPath[i].host || options.host;
                options.port = transCurrent.regExpPath[i].port || options.port;

                if (transCurrent.hackHeaders) {
                    options.headers.host = options.host + ':' + (transCurrent.targetServer.port || 80);
                    options.headers.referer = 'http://'+options.host;
                }

                options.path = req.url.replace(new RegExp(i), transCurrent.regExpPath[i].path);
                if (transCurrent.regExpPath[i].attachHeaders) {
                    var j;
                    for (j in transCurrent.regExpPath[i].attachHeaders) {
                        options.headers[j] = transCurrent.regExpPath[i].attachHeaders[j];
                    }
                }
                break;
            }
        }

        console.log("transpond \033[31m%s\033[m to \033[35m%s\033[m", req.headers.host + req.url, (options.host||options.hostname) + ":" + options.port + options.path);
        var serverReq = http.request(options, function (serverRes) {
            //console.log(req.url + " " + serverRes.statusCode);
            res.writeHead(serverRes.statusCode, serverRes.headers);
            serverRes.on('data', function (chunk) {
                res.write(chunk);
            });
            serverRes.on('end', function () {
                res.end();
            });
        });

        // 超时处理, 10s超时
        // serverReq.on('socket', function(socket) {
        //     socket.setTimeout(10000);
        //     socket.on('timeout', function() {
        //         serverReq.abort();
        //         res.writeHead("504");
        //         res.write('transpond setTimeout!');
        //         res.end();
        //     });
        // });

        serverReq.on('error', function (e) {
            console.error('problem with request: ' + e.message);
        });

        req.addListener('data', function (chunk) {
            serverReq.write(chunk);
        });

        req.addListener('end', function () {
            serverReq.end();
        });
    };
};
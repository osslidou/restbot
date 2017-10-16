var http = require("http");
var url = require("url");
var path = require('path');
var fs = require("fs");

exports.start = function(port) {

    var app = http.createServer(function(request, response) {

        // Set CORS headers
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Request-Method', '*');
        response.setHeader('Access-Control-Allow-Headers', '*');

        var uri = url.parse(request.url).pathname;
        var filename = path.join(process.cwd(), uri);

        var contentTypesByExtension = {
            '.html': "text/html",
            '.css': "text/css",
            '.js': "text/javascript"
        };

        fs.exists(filename, function(exists) {
            if (!exists) {
                response.writeHead(404, { "Content-Type": "text/plain" });
                response.write("404 Not Found\n");
                response.end();
                return;
            }

            if (fs.statSync(filename).isDirectory())
                filename += '/index.html';

            fs.readFile(filename, "binary", function(err, file) {
                if (err) {
                    response.writeHead(500, { "Content-Type": "text/plain" });
                    response.write(err + "\n");
                    response.end();
                    return;
                }

                var headers = {};
                var contentType = contentTypesByExtension[path.extname(filename)];
                if (contentType) headers["Content-Type"] = contentType;
                response.writeHead(200, headers);
                response.write(file, "binary");
                response.end();
            });
        });
    });

    app.listen(port);
    console.log("Static server running at http://localhost:" + port + "/");
}
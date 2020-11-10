#!/usr/bin/env node

var fs = require('fs-extra');
var https = require('https');
var path = require('path');
var exit = process.exit;
var pkg = require('../package.json');
var version = pkg.version;

var program = require('commander');
var express = require('express');
var mustache = require('mustache');
var strftime = require('strftime');
var underscore = require('underscore');
var AdmZip = require('adm-zip');
var osHomedir = require('os-homedir');
var base64 = require('base64-url');
var qrcode = require('qrcode-terminal');


var os = require('os');
require('shelljs/global');

var listApkIpa = require('./fileutils').listApkIpa

/**
 * Main program.
 */
process.exit = exit

// CLI

before(program, 'outputHelp', function () {
  this.allowUnknownOption();
});

program
  .version(version)
  .usage('[option] [dir]')
  .option('-p, --port <port-number>', 'set port for server (defaults is 1234)')
  .option('-i, --ip <ip-address>', 'set ip address for server (defaults is automatic getting by program)')
  .parse(process.argv);

var ipAddress = program.ip || underscore
  .chain(require('os').networkInterfaces())
  .values()
  .flatten()
  .find(function (iface) {
    return iface.family === 'IPv4' && iface.internal === false;
  })
  .value()
  .address;



var globalCerFolder = osHomedir() + '/.ios-ipa-server/' + ipAddress;
var port = program.port || 1234;
var port2 = port + 1;

if (!exit.exited) {
  main();
}

/**
 * Install a before function; AOP.
 */

function before(obj, method, fn) {
  var old = obj[method];

  obj[method] = function () {
    fn.call(this);
    old.apply(this, arguments);
  };
}

function main() {
  var downloadURL = 'https://' + ipAddress + ':' + port + '/download';
  var cerURL = 'http://' + ipAddress + ':' + port2 + '/cer';
  qrcode.generate(cerURL);
  console.log('Install CA certification on iOS 11 ' + cerURL);
  console.log('\n');
  qrcode.generate(downloadURL);
  console.log('Open download page ' + downloadURL);
  var destinationPath = program.args.shift() || '.';
  var ipasDir = destinationPath;
  var apksDir = destinationPath;
  var apkipasDir = destinationPath;

  var key;
  var cert;

  try {
    key = fs.readFileSync(globalCerFolder + '/mycert1.key', 'utf8');
    cert = fs.readFileSync(globalCerFolder + '/mycert1.cer', 'utf8');
  } catch (e) {
    var result = exec('sh  ' + path.join(__dirname, '..', 'generate-certificate.sh') + ' ' + ipAddress).output;
    key = fs.readFileSync(globalCerFolder + '/mycert1.key', 'utf8');
    cert = fs.readFileSync(globalCerFolder + '/mycert1.cer', 'utf8');
  }

  var options = {
    key: key,
    cert: cert
  };

  var app = express();
  app.use('/public', express.static(path.join(__dirname, '..', 'public')));
  app.use('/cer', express.static(globalCerFolder));

  var cerApp = express();
  cerApp.get('/cer', function (req, res) {
    fs.readFile(globalCerFolder + '/myCA.cer', function (err, data) {
      if (err)
        throw err;
      res.setHeader('Content-disposition', 'attachment; filename=myCA.cer');
      res.setHeader('Content-type', 'application/pkix-cert');
      res.send(data);
    });
  });
  cerApp.listen(port2);

  app.get('/ipa/', function (req, res) {
    var encodedName = req.query.path
    var ipa = base64.decode(encodedName);
    var filename = ipasDir + '/' + ipa;
    var filepath = path.resolve(apkipasDir, filename)
    res.download(filepath)

    // var encodedName = req.params.ipa.replace('.ipa', '');
    // var ipa = base64.decode(encodedName);
    // var filename = ipasDir + '/' + ipa + '.ipa';

    // // This line opens the file as a readable stream
    // var readStream = fs.createReadStream(filename);

    // // This will wait until we know the readable stream is actually valid before piping
    // readStream.on('open', function() {
    //   // This just pipes the read stream to the response object (which goes to the client)
    //   readStream.pipe(res);
    // });

    // // This catches any errors that happen while creating the readable stream (usually invalid names)
    // readStream.on('error', function(err) {
    //   res.end(err);
    // });

  });

  app.get('/apk/', function (req, res) {
    var encodedName = req.query.path
    var apk = base64.decode(encodedName);
    var filename = apksDir + '/' + apk;

    var filepath = path.resolve(apkipasDir, filename)

    res.download(filepath)
    // This line opens the file as a readable stream
    // var readStream = fs.createReadStream(filename);
    // This will wait until we know the readable stream is actually valid before piping
    // readStream.on('open', function () {
    //   // This just pipes the read stream to the response object (which goes to the client)
    //   readStream.pipe(res);
    // });

    // // This catches any errors that happen while creating the readable stream (usually invalid names)
    // readStream.on('error', function (err) {
    //   res.end(err);
    // });
  });

  app.get(['/', '/download'], function (req, res, next) {

    fs.readFile(path.join(__dirname, '..', 'templates') + '/download.html', function (err, data) {
      if (err)
        throw err;
      var template = data.toString();

      var apkipas = apkIpasInLocation(apkipasDir)


      // ipa
      // var ipas0 = ipasInLocation(ipasDir);
      var ipas = apkipas.listIpa

      var ipa_items = [];
      for (var i = ipas.length - 1; i >= 0; i--) {
        ipa_items.push(ipaItemInfoWithName(apkipasDir, ipas[i].name, ipas[i].fileDir));
      }

      ipa_items = ipa_items.sort(function (a, b) {
        var result = b.time.getTime() - a.time.getTime();
        return result;
      });

      // apk
      // var apks = apksInLocation(apksDir);
      var apks = apkipas.listApk

      var apk_items = [];
      for (var i = apks.length - 1; i >= 0; i--) {
        apk_items.push(apkItemInfoWithName(apkipasDir, apks[i].name, apks[i].fileDir));
      }

      apk_items = apk_items.sort(function (a, b) {
        var result = b.time.getTime() - a.time.getTime();
        return result;
      });

      // all
      var info = {};
      info.ip = ipAddress;
      info.port = port;
      info.ipa_items = ipa_items;
      info.apk_items = apk_items;
      var rendered = mustache.render(template, info);
      res.send(rendered);
    })
  });


  app.get('/plist/:file', function (req, res) {

    fs.readFile(path.join(__dirname, '..', 'templates') + '/template.plist', function (err, data) {
      if (err)
        throw err;
      var template = data.toString();

      var encodedName = req.params.file;
      var rpath = base64.decode(encodedName)

      var name = path.basename(rpath)

      var rendered = mustache.render(template, {
        encodedName: base64.encode(rpath),
        name: name.replace('.ipa', ''),
        ip: ipAddress,
        port: port,
        rpath: rpath
      });

      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.send(rendered);
    })
  });

  https.createServer(options, app).listen(port);

}

function ipaItemInfoWithName(apkipasDir, name, ipasDir) {
  var location = ipasDir + '/' + name + '.ipa';
  var stat = fs.statSync(location);
  var time = new Date(stat.mtime);
  var timeString = strftime('%F %H:%M', time);

  // get ipa icon only works on macos
  var iconString = '';
  var exeName = '';
  if (process.platform == 'darwin') {
    exeName = 'pngdefry-osx';
  } else {
    exeName = 'pngdefry-linux';
  }
  var ipa = new AdmZip(location);
  var ipaEntries = ipa.getEntries();
  var tmpIn = ipasDir + '/icon.png';
  var tmpOut = ipasDir + '/icon_tmp.png';
  try {
    ipaEntries.forEach(function (ipaEntry) {
      if (ipaEntry.entryName.indexOf('AppIcon60x60@3x.png') != -1) {
        var buffer = new Buffer(ipaEntry.getData());
        if (buffer.length) {
          fs.writeFileSync(tmpIn, buffer);
          var result = exec(path.join(__dirname, '..', exeName + ' -s _tmp ') + ' ' + tmpIn).output;
          iconString = 'data:image/png;base64,' + base64_encode(tmpOut);
        }
      }
    });
  } catch (e) {
    if (e) {
      var imageBase64 = fs.readFileSync(tmpIn).toString("base64");
      iconString = 'data:image/png;base64,' + imageBase64;
    }
  }
  fs.removeSync(tmpIn);
  fs.removeSync(tmpOut);
  var rpath = path.relative(apkipasDir, location)
  return {
    encodedName: base64.encode(name),
    name: name,
    time: time,
    timeString: timeString,
    iconString: iconString,
    ip: ipAddress,
    port: port,
    rpath: rpath,
    encodeRPath: base64.encode(rpath)
  }
}

function apkItemInfoWithName(apkipasDir, name, apksDir) {
  var location = apksDir + '/' + name + '.apk';
  var stat = fs.statSync(location);
  var time = new Date(stat.mtime);
  var timeString = strftime('%F %H:%M', time);
  var rpath = path.relative(apkipasDir, location)
  return {
    encodedName: base64.encode(name),
    name: name,
    time: time,
    timeString: timeString,
    iconString: androidIconBase64,
    ip: ipAddress,
    port: port,
    rpath: rpath,
    encodeRPath: base64.encode(rpath)
  }
}

function base64_encode(file) {
  // read binary data
  var bitmap = fs.readFileSync(file);
  // convert binary data to base64 encoded string
  return new Buffer(bitmap).toString('base64');
}

// /**
//  *
//  */
// function ipasInLocation(location) {
//   var result = [];
//   var files = fs.readdirSync(location);
//   for (var i in files) {
//     if (path.extname(files[i]) === ".ipa") {
//       result.push(path.basename(files[i], '.ipa'));
//     }
//   }
//   return result;
// }

// /**
//  *
//  */
// function apksInLocation(location) {
//   var apks = listApkIpa(location)
//   console.log(apks)
//   var result = [];
//   var files = fs.readdirSync(location);
//   for (var i in files) {
//     if (path.extname(files[i]) === ".apk") {
//       result.push(path.basename(files[i], '.apk'));
//     }
//   }
//   return result;
// }

function apkIpasInLocation(location) {
  var apkipas = listApkIpa(location)
  console.log(apkipas)
  return apkipas
}


var androidIconBase64 = 'data:image/png;base64,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'
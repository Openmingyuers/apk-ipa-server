var fs = require('fs-extra');
var path = require('path');

var listApk = []
var listIpa = []


function listApkIpa(dir) {
    return listFile(dir, ['.apk'])
}

function listFile(dir, filter) {
    var baseDir = dir
    listApk = []
    listIpa = []
    return listFileFunction(baseDir, dir, filter)
}

function listFileFunction(baseDir, dir, filter) {
    var arr = fs.readdirSync(dir);
    arr.forEach(function (item) {
        var fullpath = path.join(dir, item);
        var stats = fs.statSync(fullpath);
        if (stats.isDirectory()) {
            listFileFunction(baseDir, fullpath, filter);
        } else {
            if (fullpath.indexOf('.apk') != -1) {
                listApk.push(fileDetail(baseDir, fullpath, '.apk'));
            }
            if (fullpath.indexOf('.ipa') != -1) {
                listIpa.push(fileDetail(baseDir, fullpath, '.ipa'));
            }
        }
    });
    return {
        listApk,
        listIpa
    };
}

function fileDetail(dir, fullpath, ext) {
    fullpath = path.resolve(dir, fullpath)
    var detail = {
        fileDir: path.dirname(fullpath),
        name: path.basename(fullpath, ext)
    }
    return detail
}


module.exports = {
    listApkIpa
}
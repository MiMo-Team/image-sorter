var fs = require('fs');
var path = require('path');//解析需要遍历的文件夹
const shell = require('shelljs');
const utils = require('./utils');

var inputPath = path.resolve('./images_input');
var outputPath = path.resolve('./images_output');
var outputSortedPath = path.resolve('./images_output/sorted');
var outputMixedPath = path.resolve('./images_output/mixed');

shell.rm('-rf', outputPath);

fs.mkdirSync(outputPath);
fs.mkdirSync(outputSortedPath);
fs.mkdirSync(outputMixedPath);


//调用文件遍历方法
fileDisplay(inputPath);

//文件遍历方法
function fileDisplay(filePath) {
  //根据文件路径读取文件，返回文件列表
  fs.readdir(filePath, function (err, files) {
    if (err) {
      console.warn(err)
    } else {
      // console.log(files);
      //遍历读取到的文件列表
      files.forEach(function (filename) {
        //获取当前文件的绝对路径
        var filedir = path.join(filePath, filename);

        //根据文件路径获取文件信息，返回一个fs.Stats对象
        fs.stat(filedir, function (eror, stats) {
          if (eror) {
            console.warn('获取文件stats失败');
          } else {
            var isFile = stats.isFile();//是文件
            var isDir = stats.isDirectory();//是文件夹

            //是文件
            if (isFile) {
              if (utils.nameCheck(filename)) {
                var cutIndex = utils.findIndex(filename, '_', 2);//截断位置，第三个_所在的位置
                var classDirName = filename.substring(0, cutIndex).replace(/_/g,".");//文件夹分类名称
                var outputDirPath = `${outputSortedPath}/${classDirName}`;//输出文件夹路径
                var outputFullPath = `${outputDirPath}/${filename}`;//输出文件全路径

                // console.log(filedir);
                // console.log(filename);
                // console.log(classDirName);
                // console.log(outputDirPath);
                // console.log(outputFullPath);
                // console.log('------------------------');

                //是否存在按照日期命名的文件夹 - YYYY-MM-DD
                if (!fs.existsSync(outputDirPath)) {
                  //创建
                  fs.mkdirSync(outputDirPath);
                }

                if (fs.existsSync(outputFullPath)) {
                  console.log('存在');
                  console.log('存在');
                  console.log('存在');
                  console.log('存在');
                  console.log(outputFullPath);
                }

                //把符合名称定义的文件拷贝过去
                shell.cp('-r', filedir, outputDirPath);

              } else {
                console.log(filename)
                //把不符合名称定义的文件拷贝过去
                shell.cp('-r', filedir, outputMixedPath);
              }
            }
            //是文件夹
            if (isDir) {
              fileDisplay(filedir);//递归，如果是文件夹，就继续遍历该文件夹下面的文件
            }
          }
        })
      });
    }
  });
}



var spawn = require('child_process').spawn
// var ls = spawn('ls', ['-lh', '/usr']);
//
// ls.stdout.on('data', function (data) {
//   console.log('stdout: ' + data);
// });
//
// ls.stderr.on('data', function (data) {
//   console.log('stderr: ' + data);
// });
//
// ls.on('close', function (code) {
//   console.log('child process exited with code ' + code);
// });

var ss = spawn('bash', ['./sleep_sort.bash']);

ss.stdout.on('data', function (data) {
  process.stdout.write('stdout: ' + data);
});

ss.stderr.on('data', function (data) {
  process.stdout.write('stderr: ' + data);
});

ss.on('close', function (code) {
  process.stdout.write('child process exited with code ' + code);
});

var co = require('co')
var client = require('cheerio-httpcli')
var google = 'http://www.google.com/search'

global.targets = [google]

client.fetch(global.targets.pop())
.then(function(result){
  console.log(result.$('title').text())
  global.targets.push(google)
  return client.fetch(global.targets.pop())
})
.then(function(result){
  console.log(result.$('title').text())
  global.targets.push(google)
  return client.fetch(global.targets.pop())
})
.then(function(result){
  console.log(result.$('title').text())
  global.targets.push(google)
  return client.fetch(global.targets.pop())
})
.then(function(result){
  console.log(result.$('title').text())
  global.targets.push(google)
  return client.fetch(global.targets.pop())
})

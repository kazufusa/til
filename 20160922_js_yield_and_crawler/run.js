const co = require('co')
const client = require('cheerio-httpcli')

const yahoo = 'http://www.yahoo.co.jp'
const targets = [yahoo]

function scrape(url){
  return client.fetch(url)
  .then(function(result){
    console.log(result.$('title').text())
    targets.push(yahoo)
  })
}

client.fetch(yahoo)
.then(function(result){console.log('# preprocess')})
.then(function(){
  return co(function *(){
    let n = 0
    while (targets.length > 0 && n < 10) {
      yield scrape(targets.pop())
      n ++
    }
  })
})
.then(function(result){console.log('# postprocess')})

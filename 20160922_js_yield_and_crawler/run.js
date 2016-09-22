const co = require('co')
const client = require('cheerio-httpcli')

const folders = ['https://github.com/ktty1220/cheerio-httpcli']
const files = []
const parallel = 1

function scrapeFolder(url){
  return client.fetch(url)
  .then(function(result){
    const $ = result.$
    $('.file-wrap .js-navigation-open').each(function(){
      if ($(this).url().indexOf('tree') >= 0 && $(this).text() !== '..'){
        folders.push($(this).url())
        console.log($(this).url())
      } else if ($(this).url().indexOf('blob') >= 0){
        files.push($(this).url())
      }
    })
  })
}

function scrapeFile(url){
  return client.fetch(url)
  .then(function(result){
    console.log(result.$.documentInfo().url)
    // do something
  })
}

(function(){
  return new Promise(function(resolve){
    console.log('# crawl folder tree')
    resolve()
  })
})()
.then(function(){
  return Promise.all(Array(parallel, null).map(function(){
    return co(function *(){
      while (folders.length > 0) {
        yield scrapeFolder(folders.pop())
      }
    })
  }))
})
.then(function(result){console.log('# scrape files')})
.then(function(){
  return Promise.all(Array(parallel, null).map(function(){
    return co(function *(){
      while (files.length > 0) {
        yield scrapeFile(files.pop())
      }
    })
  }))
})
.then(function(result){console.log('# process end')})

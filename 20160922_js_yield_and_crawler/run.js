const co = require('co')
const client = require('cheerio-httpcli')
const fs = require('fs')

const folders = ['https://github.com/ktty1220/cheerio-httpcli']
const files = []
const parallel = 1

global.files = []

scrapeFolder = (url) =>{
  return client.fetch(url)
  .then((result) => {
    const $ = result.$
    $('.file-wrap .js-navigation-open').each((_, item) => {
      if ($(item).url().indexOf('tree') >= 0 && $(item).text() !== '..'){
        folders.push($(item).url())
        console.log($(item).url())
      } else if ($(item).url().indexOf('blob') >= 0){
        files.push($(item).url())
      }
    })
  })
}

scrapeFile = (url) => {
  return client.fetch(url)
  .then((result) => {
    console.log(result.$.documentInfo().url)
    // do something
    global.files.push({url: result.$.documentInfo().url})
  })
}

(() => {
  return new Promise((resolve) => {
    console.log('# crawl folder tree')
    resolve()
  })
})()
.then(() => {
  return Promise.all(Array(parallel, null).map(() => {
    return co(function *(){
      while (folders.length > 0) {
        yield scrapeFolder(folders.pop())
      }
    })
  }))
})
.then((result) => {console.log('# scrape files')})
.then(() => {
  return Promise.all(Array(parallel, null).map(() => {
    return co(function *(){
      while (files.length > 0) {
        yield scrapeFile(files.pop())
      }
    })
  }))
})
.then((result) => {console.log('# process end')})
.then((result) => {
  fs.writeFileSync("public/index.json", JSON.stringify(global.files))
})

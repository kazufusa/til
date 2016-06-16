import ejs from 'ejs'
let fn = ejs.compile('Hello! <%= a %>')
let html = fn({a:"World."});
console.log(html)

import pug from 'pug'
fn = pug.compile('="Hello! "+a')
html = fn({a:"World."});
console.log(html)

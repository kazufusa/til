console.log("Hello, Template!")

const fs = require('fs');
const ejs = require('ejs');
const templateString = fs.readFileSync('src/template.ejs', 'utf-8');
html = ejs.render(templateString, {people: ['geddy', 'neil', 'alex']});
console.log(html)

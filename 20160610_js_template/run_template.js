const ejs = require('ejs')
people = ['geddy', 'neil', 'alex']
html = ejs.render('<%= people.join(", "); %>', {people: people});
console.log(html)

const fs = require('fs');
const templateString = fs.readFileSync('template.ejs', 'utf-8');
html = ejs.render(templateString, {people: people, a: "AAA"});
console.log(html)

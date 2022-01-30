// https://qiita.com/turmericN/items/a5dbe3faff0bdc99f4d5

const data = `pineapple,160
apple,80
watermelon,160
grape,160
melon,80
mango,170
banana,80
strawberry,170
peach,160
orange,170
kiwi,80
`

// printSortedDataに処理を記載して、shoud　print以下の内容が表示されるようにする
// 要件はdataの金額でソートする。同一金額はdataの記載順で表示する。
// dataは改行区切りの文字列である
const printSortedData = (items) => {
  let ret = items.split("\n").filter(v=>v.length>0).map((v, i)=> {
    const vv = v.split(',')
    return [('000000'+vv[1]).substring(vv[1].length), ('0'+i).substring(i/10), vv[0]]
  }).sort()
    .forEach((v)=>{
    console.log(`${v[2]},${parseInt(v[0])}`);
  });
}

printSortedData(data)

// should print
// apple,80
// melon,80
// banana,80
// kiwi,80
// pineapple,160
// watermelon,160
// grape,160
// peach,160
// mango,170
// strawberry,170
// orange,170

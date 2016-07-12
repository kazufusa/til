var Board = require('../lib').Board

var board = new Board([[0, 0, 0, 0],[0, 0, 0, 0],[0, 0, 0, 0],[0, 0, 0, 0]])
while (!board.isOvered && !board.isCleared) {
  console.log(board.print())
  console.log()
  board.move(board.predict())
  console.log(board.print())
  console.log()
  board.add()
}

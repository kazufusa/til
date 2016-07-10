import * as assert from 'assert'
import { Board, LEFT, RIGHT, UP, DOWN } from '../src/board.js'

describe('board', () => {
  // 0 2 2
  // 2 2 4
  // 4 4 4
  const initial = [[0, 2, 2], [2, 2, 4], [4, 4, 4]]

  // 4 0 0
  // 4 4 0
  // 8 4 0
  const left = [[4, 0, 0], [4, 4, 0], [8, 4, 0]]

  // 0 0 4
  // 0 4 4
  // 0 4 8
  const right = [[0, 0, 4], [0, 4, 4], [0, 4, 8]]

  // 2 4 2
  // 4 4 8
  // 0 0 0
  const up = [[2, 4, 2], [4, 4, 8], [0, 0, 0]]

  // 0 0 0
  // 2 4 2
  // 4 4 8
  const down = [[0, 0, 0], [2, 4, 2], [4, 4, 8]]

  const setup = () => new Board(initial)

  const anotherInitial = [[2, 2, 2], [2, 0, 4], [4, 4, 4]]
  const anotherSetup = () => new Board(anotherInitial)

  describe('.array', () => {
    it('should be equal to the input board condition', () => {
      const board = setup()
      assert.deepStrictEqual(board.array, initial)
    })
  })

  describe('#add', () => {
    it('should change one of zero cells to 2/4 cell', () => {
      let board = setup()
      assert.deepStrictEqual(board.array[0][0], 0)
      board.add()
      assert.notDeepStrictEqual(board.array[0][0], 0)

      board = anotherSetup()
      assert.deepStrictEqual(board.array[1][1], 0)
      board.add()
      assert.notDeepStrictEqual(board.array[1][1], 0)
    })

    it('should be overed when there are no zero cells', () => {
      const board = new Board([[0, 0, 0], [0, 0, 0], [0, 0, 0]])
      for (let i = 0; i < 9; i++) board.add()
      assert.deepStrictEqual(board.isOvered, false)
      board.add()
      assert.deepStrictEqual(board.isOvered, true)
    })
  })

  describe('#move', () => {
    it('should be enable to left move', () => {
      const board = setup()
      board.move(LEFT)
      assert.deepStrictEqual(board.array, left)
    })

    it('should be enable to right move', () => {
      const board = setup()
      board.move(RIGHT)
      assert.deepStrictEqual(board.array, right)
    })

    it('should be enable to up move', () => {
      const board = setup()
      board.move(UP)
      assert.deepStrictEqual(board.array, up)
    })

    it('should be enable to down move', () => {
      const board = setup()
      board.move(DOWN)
      assert.deepStrictEqual(board.array, down)
    })
  })

  describe('#predict', () => {
    it('returns best move', () => {
      const board = new Board([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
      board.add()
      for (let i = 0; i < 2000; i++) {
        console.log(board.print())
        console.log()
        board.move(board.predict())
        console.log(board.print())
        console.log()
        if (board.isCleared) break
        if (board.isOvered) break
        board.add()
      }
      console.log(board.print())
      console.log(board.sum(), board.isOvered, board.isCleared)
      console.log(board.predict())
    })
  })
})

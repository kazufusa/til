import * as assert from 'assert'
import { Board, LEFT, RIGHT, UP, DOWN } from '../lib/index.js'

describe('Board', () => {
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
    it('should change the value of one of the zero cells to 2 or 4', () => {
      let board = setup()
      assert.deepStrictEqual(board.array[0][0], 0)
      board.add()
      assert.notDeepStrictEqual(board.array[0][0], 0)

      board = anotherSetup()
      assert.deepStrictEqual(board.array[1][1], 0)
      board.add()
      assert.notDeepStrictEqual(board.array[1][1], 0)
    })

    it('should set board is overed when there are no zero cells', () => {
      const board = new Board([[0, 0, 0], [0, 0, 0], [0, 0, 0]])
      assert.deepStrictEqual(board.isOvered, false)
      for (let i = 0; i < 9; i++) board.add()
      assert.deepStrictEqual(board.isOvered, false)
      board.add()
      assert.deepStrictEqual(board.isOvered, true)
    })
  })

  describe('#move', () => {
    it('should take a move to left', () => {
      const board = setup()
      board.move(LEFT)
      assert.deepStrictEqual(board.array, left)
    })

    it('should take a move to right', () => {
      const board = setup()
      board.move(RIGHT)
      assert.deepStrictEqual(board.array, right)
    })

    it('should take a move to up', () => {
      const board = setup()
      board.move(UP)
      assert.deepStrictEqual(board.array, up)
    })

    it('should take a move to down', () => {
      const board = setup()
      board.move(DOWN)
      assert.deepStrictEqual(board.array, down)
    })
  })

  describe('#predict', () => {
    it('should return a direction(0 to 3)', () => {
      const board = new Board([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
      board.add()
      assert.ok([0, 1, 2, 3].includes(board.predict()))
    })
  })
})

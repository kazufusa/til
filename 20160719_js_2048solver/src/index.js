export const LEFT = 0
export const UP = 1
export const RIGHT = 2
export const DOWN = 3
const DIRECTIONS = [LEFT, UP, RIGHT, DOWN]

const flatten = (array2d) => Array.prototype.concat.apply([], array2d)
const transposition = (array2d) => array2d.map((v, i) => v.map((_, j) => array2d[j][i]))
const innerReverse = (array2d) => array2d.map((v) => v.reverse())

export class Board {
  constructor(init, config = {}) {
    this.array = JSON.parse(JSON.stringify(init))
    this.size = init.length * init[0].length

    this.depth = config.depth || 10
    this.sampling = config.sampling || 500
    this.target = config.target || 2048

    this.checkIsOvered()
    this.checkIsCleared()
  }

  print() {
    return this.array.map((v) => v.map((vv) => `0000${vv}`.slice(-4)))
  }

  sum() {
    return flatten(this.array).reduce((p, c) => p + c)
  }

  copy() {
    return new Board(this.array)
  }

  checkIsCleared() {
    this.isCleared = flatten(this.array).includes(this.target)
    return this.isCleared
  }

  checkIsOvered() {
    this.isOvered = flatten(this.array).filter((v) => v === 0).length === 0
    return this.isOvered
  }

  move(direction) {
    this.preprocess(direction)
    this.array = this.array.map((v) => this.update(v))
    this.postprocess(direction)
  }

  preprocess(direction) {
    switch (direction) {
      case RIGHT:
        this.array = innerReverse(this.array)
        break
      case UP:
        this.array = transposition(this.array)
        break
      case DOWN:
        this.array = innerReverse(transposition(this.array))
        break
      default:
        break
    }
  }

  postprocess(direction) {
    switch (direction) {
      case RIGHT:
        this.array = innerReverse(this.array)
        break
      case UP:
        this.array = transposition(this.array)
        break
      case DOWN:
        this.array = transposition(innerReverse(this.array))
        break
      default:
        break
    }
  }

  update(_array) {
    const size = _array.length
    const array = _array.filter((v) => v > 0)
    for (let i = 0; i < array.length - 1; ++i) {
      if (array[i] === array[i + 1]) {
        array[i] = array[i] * 2
        array[i + 1] = 0
      }
    }
    return array.filter((v) => v > 0)
      .concat(Array.from(Array(size), () => 0))
      .slice(0, size)
  }

  countZero() {
    return flatten(this.array).filter((v) => v === 0).length
  }

  add() {
    if (this.isOvered) return this
    if (this.checkIsOvered()) return this

    const valIndexes =
      flatten(
        this.array.map((v, i) => v.map((_, j) => (this.array[i][j] > 0 ? undefined : [i, j])))
      ).filter((v) => v !== undefined)

    const n = Math.floor(Math.random() * (this.countZero()))
    const r = Math.random()
    const val = r < 0.9 ? 2 : 4

    this.array[valIndexes[n][0]][valIndexes[n][1]] = val
    return this
  }

  predict() {
    const zeroCells = [-1, -1, -1, -1]
    let direction
    let directionBoard
    let samplingBoard
    for (let i = 0; i < DIRECTIONS.length; ++i) {
      direction = DIRECTIONS[i]
      directionBoard = this.copy()
      directionBoard.move(direction)
      if (this.array.toString() === directionBoard.array.toString()) continue
      zeroCells[direction] += 1
      directionBoard.add()

      for (let j = 0; j < this.sampling; ++j) {
        samplingBoard = directionBoard.copy()
        for (let k = 0; k < this.depth; ++k) {
          samplingBoard.move(DIRECTIONS[Math.floor(Math.random() * 4)])
          samplingBoard.add()
          if (samplingBoard.isOvered) break
        }
        zeroCells[direction] += samplingBoard.countZero()
      }
    }

    return zeroCells.indexOf(Math.max(...zeroCells))
  }
}

const DEPTH = 10
const TRIAL = 500

export const LEFT = 0
export const UP = 1
export const RIGHT = 2
export const DOWN = 3
export const DIRECTIONS = [LEFT, UP, RIGHT, DOWN]

const flatten = (array2d) => Array.prototype.concat.apply([], array2d)
const transposition = (array2d) => array2d.map((v, i) => v.map((_, j) => array2d[j][i]))
const innerReverse = (array2d) => array2d.map((v) => v.reverse())

export class Board {
  constructor(a) {
    this.array = JSON.parse(JSON.stringify(a))
    this.size = a.length * a[0].length
    this.isOvered = false
    this.isCleared = false
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

  checkCleared() {
    this.isCleared = flatten(this.array).includes(2048)
  }

  move(direction) {
    this.preprocess(direction)
    this.array = this.array.map((v) => this.update(v))
    this.postprocess(direction)
    this.checkCleared()
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

    const valIndexes =
      flatten(
        this.array.map((v, i) => v.map((_, j) => (this.array[i][j] > 0 ? undefined : [i, j])))
      ).filter((v) => v !== undefined)

    if (valIndexes.length === 0) {
      this.isOvered = true
      return this
    }

    const n = Math.floor(Math.random() * (this.countZero()))
    const r = Math.random()
    const val = r < 0.9 ? 2 : 4

    this.array[valIndexes[n][0]][valIndexes[n][1]] = val
    return this
  }

  predict() {
    const zeroCells = [-1, -1, -1, -1]
    let direction
    for (let i = 0; i < DIRECTIONS.length; ++i) {
      direction = DIRECTIONS[i]
      const dummyboard = this.copy()
      dummyboard.move(direction)
      if (this.array.toString() === dummyboard.array.toString()) continue
      zeroCells[direction] += 1
      dummyboard.add()

      for (let j = 0; j < TRIAL; ++j) {
        const trialboard = dummyboard.copy()
        for (let k = 0; k < DEPTH; ++k) {
          trialboard.move(DIRECTIONS[Math.floor(Math.random() * 4)])
          trialboard.add()
          if (trialboard.isOvered) break
        }
        zeroCells[direction] += trialboard.countZero()
      }
    }

    return zeroCells.indexOf(Math.max(...zeroCells))
  }
}

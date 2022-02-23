import { useEffect, useState } from 'react'
import './App.css'

enum Rotate { Right, Left }

enum TetrominoName {
  I, O, S, Z, J, L, T
}

type TetrominoLabel = TetrominoName | -1

const Empty: TetrominoLabel = -1;

type Tetromino = [
  [TetrominoLabel, TetrominoLabel, TetrominoLabel, TetrominoLabel],
  [TetrominoLabel, TetrominoLabel, TetrominoLabel, TetrominoLabel],
  [TetrominoLabel, TetrominoLabel, TetrominoLabel, TetrominoLabel],
  [TetrominoLabel, TetrominoLabel, TetrominoLabel, TetrominoLabel],
];

const RotateTetriminoToRight = (t: Tetromino): Tetromino => {
  return [
    [t[3][0], t[2][0], t[1][0], t[0][0]],
    [t[3][1], t[2][1], t[1][1], t[0][1]],
    [t[3][2], t[2][2], t[1][2], t[0][2]],
    [t[3][3], t[2][3], t[1][3], t[0][3]],
  ]
}

const RotateTetriminoToLeft = (t: Tetromino): Tetromino => {
  return [
    [t[0][3], t[1][3], t[2][3], t[3][3]],
    [t[0][2], t[1][2], t[2][2], t[3][2]],
    [t[0][1], t[1][1], t[2][1], t[3][1]],
    [t[0][0], t[1][0], t[2][0], t[3][0]],
  ]
}

const RotateRight = (t: Tetris): Tetris => (
  { ...t, Tetrimino: RotateTetriminoToRight(t.Tetrimino) }
)

const RotateLeft = (t: Tetris): Tetris => (
  { ...t, Tetrimino: RotateTetriminoToLeft(t.Tetrimino) }
)

const InitialTetromino: Record<TetrominoName, Tetromino> = {
  [TetrominoName.I]: [[-1, -1, -1, -1], [0, 0, 0, 0], [-1, -1, -1, -1], [-1, -1, -1, -1]],
  [TetrominoName.O]: [[-1, -1, -1, -1], [-1, 1, 1, -1], [-1, 1, 1, -1], [-1, -1, -1, -1]],
  [TetrominoName.S]: [[-1, -1, -1, -1], [-1, 2, 2, -1], [2, 2, -1, -1], [-1, -1, -1, -1]],
  [TetrominoName.Z]: [[-1, -1, -1, -1], [3, 3, -1, -1], [-1, 3, 3, -1], [-1, -1, -1, -1]],
  [TetrominoName.J]: [[-1, -1, -1, -1], [4, 4, 4, -1], [-1, -1, 4, -1], [-1, -1, -1, -1]],
  [TetrominoName.L]: [[-1, -1, -1, -1], [5, 5, 5, -1], [5, -1, -1, -1], [-1, -1, -1, -1]],
  [TetrominoName.T]: [[-1, -1, -1, -1], [6, 6, 6, -1], [-1, 6, -1, -1], [-1, -1, -1, -1]],
}

const RandomTetromino = (): TetrominoName => Math.floor(Math.random() * 7);

type Tetris = {
  Board: number[][];
  GameOver: boolean;
  NextTetrimino: TetrominoName;
  Tetrimino: Tetromino;
  TetriminoX: number,
  TetriminoY: number,
};

const TetriminoIndex = (board: Tetris): (x: number, y: number) => [number | undefined, number | undefined] => (x: number, y: number) => {
  const { TetriminoX: tx, TetriminoY: ty } = board;
  if (x < tx || tx + 3 < x || y < ty || ty + 3 < y) {
    return [undefined, undefined]
  }
  return [x - tx, y - ty]
}

const InitialBoard: Tetris = {
  Board: [...Array(20)].map(() => [...Array(10)].map(() => Empty)),
  Tetrimino: InitialTetromino[RandomTetromino()],
  TetriminoX: 3,
  TetriminoY: 1,
  GameOver: false,
  NextTetrimino: RandomTetromino(),
};

const Board: React.FC<Tetris> = (tetris) => {
  const { Board: board, Tetrimino: tetrimino } = tetris;
  const tetriminoIndex = TetriminoIndex(tetris);
  return (
    <table>
      <tbody>
        {
          board.map((row, y) => {
            return (<tr key={y}>
              {row.map((col, x) => {
                const [tx, ty] = tetriminoIndex(x, y);
                return (
                  (tx !== undefined && ty !== undefined) ?
                    <td className={`td-${tetrimino[ty][tx]}`} key={`${y}-${x}`}></td>
                    :
                    <td className={`td-${col}`} key={`${y}-${x}`}></td>
                )
              }
              )}
            </tr>)
          })
        }
      </tbody>
    </table>
  )
};

const App: React.FC = () => {
  const [tetris, setTetris] = useState<Tetris>(InitialBoard);
  useEffect(() => {
    window.addEventListener("keydown", (event) => {
      switch (event.code) {
        case "ArrowRight":
          setTetris(RotateRight)
          break
        case "ArrowLeft":
          setTetris(RotateLeft)
          break
        default:
          break
      }
    })
  }, [])

  return (
    <div className="App">
      <header className="App-header">
        <p>Hello Vite + React!</p>
        <Board {...tetris} />
        <p>
          Edit <code>App.tsx</code> and save to test HMR updates.
        </p>
        <p>
          <a
            className="App-link"
            href="https://reactjs.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn React
          </a>
          {' | '}
          <a
            className="App-link"
            href="https://vitejs.dev/guide/features.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Vite Docs
          </a>
        </p>
      </header>
    </div>
  )
}

export default App

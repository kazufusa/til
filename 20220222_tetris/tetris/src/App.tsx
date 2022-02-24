import { useEffect, useState, useRef } from 'react'
import './App.css'

enum MinoName { I, O, S, Z, J, L, T }

const Empty: MinoLabel = -1;

type MinoLabel = MinoName | -1

type Mino = [
  [MinoLabel, MinoLabel, MinoLabel, MinoLabel],
  [MinoLabel, MinoLabel, MinoLabel, MinoLabel],
  [MinoLabel, MinoLabel, MinoLabel, MinoLabel],
  [MinoLabel, MinoLabel, MinoLabel, MinoLabel],
];

const RotateMino1 = (t: Mino): Mino => {
  return [
    [t[3][0], t[2][0], t[1][0], t[0][0]],
    [t[3][1], t[2][1], t[1][1], t[0][1]],
    [t[3][2], t[2][2], t[1][2], t[0][2]],
    [t[3][3], t[2][3], t[1][3], t[0][3]],
  ]
}

const RotateMino2 = (t: Mino): Mino => {
  return [
    [t[0][3], t[1][3], t[2][3], t[3][3]],
    [t[0][2], t[1][2], t[2][2], t[3][2]],
    [t[0][1], t[1][1], t[2][1], t[3][1]],
    [t[0][0], t[1][0], t[2][0], t[3][0]],
  ]
}

const IsEmpty = (board: number[][], x: number, y: number): boolean => board[y][x] === Empty;

const IsInside = (x: number, y: number): boolean => 0 <= x && x <= 9 && 0 <= y && y <= 19;

const AvailableCell = (board: number[][], x: number, y: number): boolean => {
  return IsInside(x, y) && IsEmpty(board, x, y)
}

const ValidMove = (mino: Mino | null, board: number[][], minoX: number, minoY: number): boolean =>
  mino?.map(
    (row, y) =>
      row.map(
        (col, x) => {
          return col !== Empty && !AvailableCell(board, x + minoX, y + minoY) ? false : true
        }
      )
  ).flat().some(e => !e) ? false : true

const Rotate1 = (t: Tetris): Tetris => {
  const mino = t.Mino ? RotateMino1(t.Mino) : null
  return ValidMove(mino, t.Board, t.MinoX, t.MinoY) ? { ...t, Mino: mino } : { ...t }
}

const Rotate2 = (t: Tetris): Tetris => {
  const mino = t.Mino ? RotateMino2(t.Mino) : null
  return ValidMove(mino, t.Board, t.MinoX, t.MinoY) ? { ...t, Mino: mino } : { ...t }
}

const MoveH = (t: Tetris, d: number): Tetris => {
  const newX: number = t.MinoX + d;
  return ValidMove(t.Mino, t.Board, newX, t.MinoY) ? { ...t, MinoX: newX } : { ...t }
}

const MoveRight = (t: Tetris): Tetris => MoveH(t, 1)

const MoveLeft = (t: Tetris): Tetris => MoveH(t, -1)

const MoveDown = (t: Tetris): Tetris => {
  const newY: number = t.MinoY + 1;
  return ValidMove(t.Mino, t.Board, t.MinoX, newY) ? { ...t, MinoY: newY } : { ...t }
}

const Clean = (t: Tetris): Tetris => {
  let board = t.Board.map(row => [...row])
  board = board.filter((row) => row.some(col => col === Empty));
  const appendix = [...Array(20 - board.length).keys()].map(() => [...Array(10).keys()].map(() => Empty));
  return { ...t, Board: [...appendix, ...board], Tidy: false }
}

const IsFixed = (t: Tetris): boolean => t.Mino === null || !ValidMove(t.Mino, t.Board, t.MinoX, t.MinoY + 1)

const Proceed = (t: Tetris): Tetris => {
  if (t.GameOver) {
    return t
  }
  if (IsFixed(t)) {
    if (t.Tidy) {
      // clear filled rows
      const Board = t.Board.map(row => [...row])
      t.Mino?.forEach((row, y) => row.forEach((col, x) => {
        if (col !== Empty) {
          Board[y + t.MinoY][x + t.MinoX] = col
        }
      }))
      const ret = Clean({ ...t, Board, Mino: null })
      return ret
    } else {
      const MinoX = 3
      const MinoY = -1
      const Mino = InitialMinos[t.NextMino]
      const NextMino = RandomMino()
      const GameOver = !ValidMove(Mino, t.Board, MinoX, MinoY)
      return { Board: t.Board, GameOver, NextMino, Mino, MinoX, MinoY, Tidy: true }
    }
  }
  return MoveDown(t)
}

const InitialMinos: Record<MinoName, Mino> = {
  [MinoName.I]: [[-1, -1, -1, -1], [0, 0, 0, 0], [-1, -1, -1, -1], [-1, -1, -1, -1]],
  [MinoName.O]: [[-1, -1, -1, -1], [-1, 1, 1, -1], [-1, 1, 1, -1], [-1, -1, -1, -1]],
  [MinoName.S]: [[-1, -1, -1, -1], [-1, 2, 2, -1], [2, 2, -1, -1], [-1, -1, -1, -1]],
  [MinoName.Z]: [[-1, -1, -1, -1], [3, 3, -1, -1], [-1, 3, 3, -1], [-1, -1, -1, -1]],
  [MinoName.J]: [[-1, -1, -1, -1], [4, 4, 4, -1], [-1, -1, 4, -1], [-1, -1, -1, -1]],
  [MinoName.L]: [[-1, -1, -1, -1], [5, 5, 5, -1], [5, -1, -1, -1], [-1, -1, -1, -1]],
  [MinoName.T]: [[-1, -1, -1, -1], [6, 6, 6, -1], [-1, 6, -1, -1], [-1, -1, -1, -1]],
}

const RandomMino = (): MinoName => Math.floor(Math.random() * 7);

type Tetris = {
  Board: number[][];
  GameOver: boolean;
  NextMino: MinoName;
  Mino: Mino | null;
  MinoX: number,
  MinoY: number,
  Tidy: boolean;
};

const MinoColor = (tetris: Tetris): (x: number, y: number) => MinoName | undefined => (x: number, y: number) => {
  const { MinoX: tx, MinoY: ty } = tetris;
  if (tetris.Mino === null || x < tx || tx + 3 < x || y < ty || ty + 3 < y || tetris.Mino[y - ty][x - tx] === Empty) {
    return undefined
  }
  return tetris.Mino[y - ty][x - tx]
}

const InitialBoard: Tetris = {
  Board: [...Array(20)].map(() => [...Array(10)].map(() => Empty)),
  Mino: InitialMinos[RandomMino()],
  MinoX: 3,
  MinoY: -1,
  GameOver: false,
  NextMino: RandomMino(),
  Tidy: true,
};

const Board: React.FC<Tetris> = (tetris) => {
  const { Board: board } = tetris;
  const mino = MinoColor(tetris);
  return (
    <table>
      <tbody>
        {
          board.map((row, y) => {
            return (<tr key={y}>
              {row.map((col, x) =>
                <td className={`td-${mino(x, y) ?? col}`} key={`${y}-${x}`}></td>
              )}
            </tr>)
          })
        }
      </tbody>
    </table>
  )
};

const useInterval = (handler: TimerHandler, timeout: number | undefined) => {
  const savedHandler = useRef(handler)
  useEffect(() => {
    const id = setInterval(savedHandler.current, timeout)
    return () => clearInterval(id)
  }, [])
}

const App: React.FC = () => {
  const [tetris, setTetris] = useState<Tetris>(InitialBoard);
  useInterval(() => setTetris(Proceed), 500)

  useEffect(() => {
    window.addEventListener("keydown", (event) => {
      switch (event.code) {
        case "KeyI":
          setTetris(Rotate1)
          break
        case "KeyK":
          setTetris(Rotate2)
          break
        case "KeyL":
          setTetris(MoveRight)
          break
        case "KeyJ":
          setTetris(MoveLeft)
          break
        case "Space":
          setTetris(MoveDown)
          break
        default:
          return
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

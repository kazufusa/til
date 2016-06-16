import expect from 'expect'
import {createStore} from 'redux'
import React from 'react'
import ReactDOM from 'react-dom'
import * as child_process from 'child_process'

import * as fs from 'fs'
import ejs from 'ejs'
let fn = ejs.compile('Hello! <%= a %>')
let html = fn({a:"World."});
console.log(html)

// reducer
const counter = (state={v: 0, text: ""}, action) => {

  switch (action.type) {
    case 'INCREMENT':
      console.log(state)
      return {v:state.v + 1, text: state.text}
    case 'DECREMENT':
      return {v:state.v - 1, text: state.text}
    case 'COMMAND':
      return {v:state.v, text: state.text + action.text}
    default:
      return state
  }
}

const Counter = ({state, onIncrement, onDecrement, onExecute}) => (
  <div>
    <div>
      <h1>{state.v}</h1>
      <p>
        <button onClick={onIncrement}>+</button>
        <button onClick={onDecrement}>-</button>
      </p>
    </div>
    <div>
      <pre><code>{state.text}</code></pre>
      <p><button onClick={onExecute}>Execute</button></p>
    </div>
  </div>
)

const store = createStore(counter)

const render = () => {
  ReactDOM.render(
    <Counter
      state       = {store.getState()}
      onIncrement = {() => store.dispatch({type: 'INCREMENT'})}
      onDecrement = {() => store.dispatch({type: 'DECREMENT'})}
      onExecute   = {() => {
        var ss = child_process.spawn('bash', ['./sleep_sort.bash'])
        ss.stdout.on('data', function (data) {
          store.dispatch({type: 'COMMAND', text: data})
        })
        ss.stderr.on('data', function (data) {
          store.dispatch({type: 'COMMAND', text: data})
        })
        ss.on('close', function (code) {
        })
      }}
    />, 
    document.getElementById("root")
  )
}

store.subscribe(render)
render()

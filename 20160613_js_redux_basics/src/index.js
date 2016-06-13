import React from 'react'
import { render } from 'react-dom'
import { Provider } from 'react-redux'
import { createStore } from 'redux'
import todoApp from './reducers'
import App from './components/App.js'

let store = createStore(todoApp)
// import { addTodo } from './actions'
// store.dispatch(addTodo('Hello React!'))
// store.dispatch(addTodo('Hello Redux!'))
// store.dispatch(toggleTodo(0))

render(
  <Provider store={store}>
    <App />
  </Provider>,
  document.getElementById('root')
)

// store.dispatch(addTodo('Hello World! 1'))
// console.log(store.getState())
// store.dispatch(addTodo('Hello World! 2'))
// console.log(store.getState())
// store.dispatch(addTodo('Hello World! 3'))
// console.log(store.getState())
// store.dispatch(addTodo('Hello World! 4'))
// console.log(store.getState())

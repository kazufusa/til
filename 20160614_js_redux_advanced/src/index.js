import rootReducer from './reducers'
import { createStore, applyMiddleware } from 'redux'
import thunkMiddleware from 'redux-thunk'
import createLogger from 'redux-logger'

const loggerMiddleware = createLogger()

// const store = createStore(rootReducer)
const store = createStore(
  rootReducer,
  applyMiddleware(
    thunkMiddleware, // lets us dispatch() functions
    loggerMiddleware // neat middleware that logs actions
  )
)

import { selectSubreddit, fetchPosts } from './actions'
store.dispatch(selectSubreddit('redux'))
console.log(store.getState())
store.dispatch(selectSubreddit('reactjs'))
store.dispatch(fetchPosts('reactjs')).then(() => {
  console.log("Finished fetch")
  console.log(store.getState())
})

// const d = {
//   data:{
//     children: [{data:"c"}]
//   }
// }
// store.dispatch(recievePosts('redux', d))
// console.log(store.getState())

// import thunkMiddleware from 'redux-thunk'
// import createLogger from 'redux-logger'
// import { createStore, applyMiddleware } from 'redux'
// import { selectSubreddit, fetchPosts } from './actions'
// import rootReducer from './reducers'
//
// const loggerMiddleware = createLogger()
//
// const store = createStore(
//   rootReducer,
//   applyMiddleware(
//     thunkMiddleware, // lets us dispatch() functions
//     loggerMiddleware // neat middleware that logs actions
//   )
// )
//
// store.dispatch(selectSubreddit('reactjs'))
// store.dispatch(fetchPosts('reactjs')).then(() =>
//   console.log(store.getState())
// )

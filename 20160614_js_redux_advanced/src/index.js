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

import { selectSubreddit, fetchPostsIfNeeded } from './actions'
store.dispatch(selectSubreddit('redux'))
console.log(store.getState())
store.dispatch(selectSubreddit('reactjs'))
store.dispatch(fetchPostsIfNeeded('reactjs')).then(() => {
  console.log("Finished Fetch posts")
  console.log(store.getState())
})

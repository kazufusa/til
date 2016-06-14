import rootReducer from './reducers'
import { createStore } from 'redux'

let store = createStore(rootReducer)

import { selectSubreddit, recievePosts } from './actions'
store.dispatch(selectSubreddit('redux'))
console.log(store.getState())
const d = {
  data:{
    children: [{data:"c"}]
  }
}
store.dispatch(recievePosts('redux', d))
console.log(store.getState())


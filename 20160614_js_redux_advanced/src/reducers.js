import { combineReducers } from 'redux'

const selectedSubreddit = (state = 'reactjs', action) => {
  switch (action.type) {
    case 'SELECT_SUBREDDIT':
      return action.subreddit
    default:
      return state
  }
}

const posts = (state = {
  isFetching: false,
  didInvalidate: false,
  items: []
}, action) => {
  switch (action.type) {
    case 'INVALIDATE_SUBREDDIT':
      return Object.assign({}, state, {
        didInvalidate: true
      })
    case 'REQUEST_POSTS':
      return Object.assign({}, state, {
        isFetching: true,
        didInvalidate: false
      })
    case 'RECIEVE_POSTS':
      return Object.assign({}, state, {
        isFetching: false,
        didInvalidate: false,
        items: action.posts,
        lastUpdated: action.recievedAt
      })
    default:
      return state
  }
}

const postsBySubreddit = (state = {}, action) => {
  switch (action.type) {
    case 'INVALIDATE_SUBREDDIT':
    case 'RECIEVE_POSTS':
    case 'REQUEST_POSTS':
      return Object.assign({}, state, {
        [action.subreddit]: posts(state[action.subreddit], action)
      })
    default:
      return state
  }
}

const rootReducer = combineReducers({
  postsBySubreddit,
  selectedSubreddit
})

export default rootReducer

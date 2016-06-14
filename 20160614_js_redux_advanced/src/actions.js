import fetch from 'isomorphic-fetch'

export const selectSubreddit = (subreddit) => {
  return {
    type: 'SELECT_SUBREDDIT',
    subreddit
  }
}

export const invalidateSubreddit = (subreddit) => {
  return {
    type: 'INVALIDATE_SUBREDDIT',
    subreddit
  }
}

export const requestPosts = (subreddit) => {
  return {
    type: 'REQUEST_POSTS',
    subreddit
  }
}

export const receivePosts = (subreddit, json) => {
  return {
    type: 'RECIEVE_POSTS',
    subreddit,
    posts: json.data.children.map(child => child.data),
    recievedAt: Date.now()
  }
}

const fetchPosts = (subreddit) => {
  return (dispatch) => {
    dispatch(requestPosts(subreddit))
    return fetch(`http://www.reddit.com/r/${subreddit}.json`)
      .then(response => response.json())
      .then(json => dispatch(receivePosts(subreddit, json)))
  }
}

const shouldFetchPosts = (state, subreddit) => {
  const posts = state.postsBySubreddit[subreddit]
  if (!posts) {
    return true
  } else if (posts.isFetching) {
    return false
  } else {
    return posts.didInvalidate
  }
}

export const fetchPostsIfNeeded = (subreddit) => {

  return (dispatch, getState) => {
    if (shouldFetchPosts(getState(), subreddit)) {
      // Dispatch a thunk from thunk!
      return dispatch(fetchPosts(subreddit))
    } else {
      // Let the calling code know there's nothing to wait for.
      return Promise.resolve()
    }
  }
}

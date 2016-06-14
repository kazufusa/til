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

export const recievePosts = (subreddit, json) => {
  return {
    type: 'RECIEVE_POSTS',
    subreddit,
    posts: json.data.children.map(child => child.data),
    recievedAt: Date.now()
  }
}

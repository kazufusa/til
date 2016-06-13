let nextTodoId = 0

export const addTodo = (text) => {
  return {
    type: 'ADD_TODO',
    id: nextTodoId++,
    text
  }
}

export const toggleTodo = (index) => {
  return {
    type: 'TOGGLE_TODO',
    index
  }
}

export const setVisibilityFilter = (filter) => {
  return {
    type: 'SET_VISIBILITY_FILTER',
    filter
  }
}

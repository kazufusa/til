import React, { PropTypes } from 'react'
import Todo from './Todo.js'

const TodoList = ({ todos, onTodoClick }) => (
  <ul>
    {todos.map((todo) =>
      <Todo
        key={todo.id}
        {...todo}
        onClick={() => onTodoClick(todo.id)}
      />
    )}
  </ul>
)

TodoList.propTypes = {
  todos: PropTypes.arrayOf(
    PropTypes.shape({
      id:          PropTypes.number.isRequired,
      text:        PropTypes.string.isRequired,
      onTodoClick: PropTypes.func.isRequired
    }).isRequired
  ).isRequired,
}

export default TodoList

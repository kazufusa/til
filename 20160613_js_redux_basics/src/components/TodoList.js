import React, { PropTypes } from 'react'
import Todo from './Todo.js'

const TodoList = ({ todos, onTodoClick }) => (
  <ul>
    {todos.map(todo => 
      <Todo
        key={todo.id}
        {...Todo}
        onClick={() => onTodoClick(todo.id)}
      />
    )}
  </ul>
)

TodoList.propTypes = {
  todos: PropTypes.arrayOf(
    PropTypes.shape({
      id:        PropTypes.number.isRequired,
      completed: PropTypes.bool.isRequired,
      text:      PropTypes.string.isRequired
    }).isRequired
  ).isRequired,
  onTodoClick: PropTypes.func.isRequired
}

export default TodoList

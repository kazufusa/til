// src/app.js
import React from 'react'
import ReactDOM from 'react-dom'
import { Router, Route, Link, hashHistory} from 'react-router'

const users = [
  {name: "alice"}, {name: "bob"}, {name: "charlie"}
];

const App = React.createClass({
  render(){
    return (
      <div>
        <ul>
          <li><Link to="/">Home</Link></li>
          <li><Link to="user">Users</Link></li>
        </ul>
        <h1>Hello, React! 2</h1>
        <p>This is an example site using <em>react-router</em>.</p>
        {this.props.children}
      </div>
    )
  }
});

const Users = React.createClass({
  render() {
    return (
      <div>
        <h2>Users</h2>
        <ul>
          {users.map(user => (
            <li key={user.name}><Link to={`/user/${user.name}`}>{user.name}</Link></li>
          ))}
        </ul>
      </div>
    )
  }
});

const User = React.createClass({
  render() {
    return (
      <div>
        <h2>User: {this.props.params.userName}</h2>
        <p>Welcome to {this.props.params.userName}&apos;s page!</p>
      </div>
    )
  }
});

const NoMatch = React.createClass({
  render(){
    return (
      <div>
        <h2>Oops... something is wrong</h2>
      </div>
    )
  }
});

ReactDOM.render(
  <Router history={hashHistory}>
    <Route path="/" component={App}>
      <Route path="/user" component={Users}/>
      <Route path="/user/:userName" component={User}/>
      <Route path="*" component={NoMatch}/>
    </Route>
  </Router>,
  document.getElementById("content")
)

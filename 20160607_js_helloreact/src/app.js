// src/app.js
import React from "react";
import ReactDOM from "react-dom";

var WordCountBox = React.createClass({
  getInitialState: function() {
    return {text: ""};
  },
  handleTextChange: function(e) {
    this.setState({text: e.target.value});
  },
  render: function() {
    return (
      <div className="wordCountBox">
        <h1>Hello, React!</h1>
        <textarea rows="8" cols="80" placeholder="Type something..." autoFocus="true" onChange={this.handleTextChange}>
          {this.state.text}
        </textarea>
        <p>Count: {this.state.text.length}</p>
      </div>
    );
  }
});

ReactDOM.render(
  <WordCountBox />,
  document.getElementById("content")
);

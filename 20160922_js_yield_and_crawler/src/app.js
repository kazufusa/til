// src/app.js
import React from "react";
import ReactDOM from "react-dom";

var Search = React.createClass({
  getInitialState: () => {
    return {files: []};
  },

  componentDidMount: function() {
    this.serverRequest = $.get("./index.json", function (result) {
      this.setState({ files: result });
    }.bind(this));
  },

  filter: function(e) {
    this.setState({files: this.state.files.map((item) => {
      if (e.target.value && item.url.indexOf(e.target.value) >= 0){
        item.display = true
      } else {
        item.display = false
      }
      return item
    })})
  },

  render: function() {
    return (
      <div>
        <h1>Search file urls</h1>
        <input type="text" onChange={this.filter}></input>
        <ul>
        {this.state.files.map((item, i) => {
          return <li
            key={i}
            style={{display: item.display ? "" : "none"}}
          > {item.url}</li>
        })}
        </ul>
      </div>
    )
  }
});

ReactDOM.render(
  <Search />,
  document.getElementById("content")
);

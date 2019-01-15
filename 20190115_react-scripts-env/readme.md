# react-scripts and environment variables for build mode

Introduce normal build mode and static build mode.
You can change the mode by `RACT_APP_STATIC_MODE` environment variable, refered via `process.env.REACT_APP_STATIC_MODE` in javascript.

`hello-world/src/App.js` is below

```hello-world/src/App.js
import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';

class App extends Component {
  render() {
    let a
    if (process.env.REACT_APP_STATIC_MODE === "true") {
      a = 'REACT_APP_STATIC_MODE is true'
    } else {
      a = 'REACT_APP_STATIC_MODE is not true'
    }
    return (
      <div className="App">
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <p>
            {a}
          </p>
          <p>
            Edit <code>src/App.js</code> and save to reload.
          </p>
          <a
            className="App-link"
            href="https://reactjs.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn React
          </a>
        </header>
      </div>
    );
  }
}

export default App;
```

## 1. Default mode written in .env

```bash
$ cat hello-world/.env
REACT_APP_STATIC_MODE=false
$ cd hello-world
$ yarn build
$ cat build/static/js/main*.js
```

The build result is below. The string of `REACT_APP_STATIC_MODE is true` is removed.

```js
(window.webpackJsonp=window.webpackJsonp||[]).push([[0],{15:function(e,t,n){},17:function(e,t,n){},19:function(e,t,n){"use strict";n.r(t);var a=n(0),o=n.n(a),r=n(2),c=n.n(r),l=(n(15),n(3)),i=n(4),s=n(7),p=n(5),u=n(8),m=n(6),d=n.n(m),h=(n(17),function(e){function t(){return Object(l.a)(this,t),Object(s.a)(this,Object(p.a)(t).apply(this,arguments))}return Object(u.a)(t,e),Object(i.a)(t,[{key:"render",value:function(){var e;return e="REACT_APP_STATIC_MODE is not true",o.a.createElement("div",{className:"App"},o.a.createElement("header",{className:"App-header"},o.a.createElement("img",{src:d.a,className:"App-logo",alt:"logo"}),o.a.createElement("p",null,e),o.a.createElement("p",null,"Edit ",o.a.createElement("code",null,"src/App.js")," and save to reload."),o.a.createElement("a",{className:"App-link",href:"https://reactjs.org",target:"_blank",rel:"noopener noreferrer"},"Learn React")))}}]),t}(a.Component));Boolean("localhost"===window.location.hostname||"[::1]"===window.location.hostname||window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/));c.a.render(o.a.createElement(h,null),document.getElementById("root")),"serviceWorker"in navigator&&navigator.serviceWorker.ready.then(function(e){e.unregister()})},6:function(e,t,n){e.exports=n.p+"static/media/logo.5d5d9eef.svg"},9:function(e,t,n){e.exports=n(19)}},[[9,2,1]]]);
//# sourceMappingURL=main.1f8cc5c3.chunk.js.map
```

## 2. Set static mode via comand-line environment variable

```bash
$ cd hello-world
$ REACT_APP_STATIC_MODE=true yarn build
$ cat build/static/js/main*.js
```

The build result is below. The string of `REACT_APP_STATIC_MODE is not true` is removed.

```js
(window.webpackJsonp=window.webpackJsonp||[]).push([[0],{15:function(e,t,n){},17:function(e,t,n){},19:function(e,t,n){"use strict";n.r(t);var a=n(0),o=n.n(a),r=n(2),c=n.n(r),l=(n(15),n(3)),i=n(4),s=n(7),p=n(5),u=n(8),m=n(6),d=n.n(m),h=(n(17),function(e){function t(){return Object(l.a)(this,t),Object(s.a)(this,Object(p.a)(t).apply(this,arguments))}return Object(u.a)(t,e),Object(i.a)(t,[{key:"render",value:function(){var e;return e="REACT_APP_STATIC_MODE is true",o.a.createElement("div",{className:"App"},o.a.createElement("header",{className:"App-header"},o.a.createElement("img",{src:d.a,className:"App-logo",alt:"logo"}),o.a.createElement("p",null,e),o.a.createElement("p",null,"Edit ",o.a.createElement("code",null,"src/App.js")," and save to reload."),o.a.createElement("a",{className:"App-link",href:"https://reactjs.org",target:"_blank",rel:"noopener noreferrer"},"Learn React")))}}]),t}(a.Component));Boolean("localhost"===window.location.hostname||"[::1]"===window.location.hostname||window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/));c.a.render(o.a.createElement(h,null),document.getElementById("root")),"serviceWorker"in navigator&&navigator.serviceWorker.ready.then(function(e){e.unregister()})},6:function(e,t,n){e.exports=n.p+"static/media/logo.5d5d9eef.svg"},9:function(e,t,n){e.exports=n(19)}},[[9,2,1]]]);
//# sourceMappingURL=main.4f57465a.chunk.js.map
```

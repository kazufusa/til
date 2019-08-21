import React, {useEffect, useState} from 'react';
import './App.css';
import { BrowserRouter as Router, Route, Switch, Link } from 'react-router-dom';
import useReactRouter from 'use-react-router';

function q2c(search:string):number{
  if (search === "") {
    return 0
  } else {
    return parseInt(search.split("=")[1])
  }
}

function Hello() {
  const { history, location } = useReactRouter();
  const [data, setData] = useState("no data")
  const count = q2c(location.search)
  const nextCount = count + 1

  useEffect(() => {
    console.log("in effect")
    if (location.search === ''){
      history.push(location.pathname + "?count=0")
      return
    }
    setData(`data is ${count}`)
  }, [location, history, count]);

  return (
    <div>
      <h1>HelloWorld</h1>
      <p>{`pathname: ${location.pathname}`}</p>
      <p>{`search: ${location.search}`}</p>
      <p>{`count: ${count}`}</p>
      <p>{`data: ${data}`}</p>
      <button onClick={() => history.push(location.pathname + `?count=${nextCount}`)}>Next</button>
      <Link to={location.pathname + `?count=${nextCount}`}>Next</Link>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Switch>
        <Route path="/" component={Hello} exact />
      </Switch>
    </Router>
  );
}

export default App;

import React, { Component } from 'react';
import Slider from 'react-slick';
import './App.scss';

import FaRight from "@fortawesome/fontawesome-free/svgs/solid/angle-double-right.svg"
import FaLeft from "@fortawesome/fontawesome-free/svgs/solid/angle-double-left.svg"

const NextArrow = props => (
  <div>
    <img alt="" src={FaRight} onClick={props.onClick}  className='slick-next' />
  </div>
)

const PrevArrow = props => (
  <div>
    <img alt="" src={FaLeft} onClick={props.onClick}  className='slick-prev' />
  </div>
)

class SliderExample extends Component {
  render() {
    let settings = {
      className: "center",
      centerMode: true,
      centerPadding: "60px",
      dots: false,
      infinite: false,
      speed: 500,
      slidesToShow: 3,
      slidesToScroll: 1,
      nextArrow: <NextArrow />,
      prevArrow: <PrevArrow />,
    };
    return (
      <Slider {...settings}>
        <div>
          <img alt="" src="http://placekitten.com/g/400/200" />
        </div>
        <div>
          <img alt="" src="http://placekitten.com/g/400/200" />
        </div>
        <div>
          <img alt="" src="http://placekitten.com/g/400/200" />
        </div>
        <div>
          <img alt="" src="http://placekitten.com/g/400/200" />
        </div>
        <div>
          <img alt="" src="http://placekitten.com/g/400/200" />
        </div>
      </Slider>
    );
  }
}

export default class App extends React.Component {
  render() {
    return (
      <div id="app">
        <SliderExample />
      </div>
    );
  }
}

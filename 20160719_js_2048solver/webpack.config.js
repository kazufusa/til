var webpack = require('webpack')
var ExternalsPlugin = webpack.ExternalsPlugin

module.exports={
  entry: ["./src/index.js"],
  output: {
    path: __dirname+"/dist",
    filename: "bundle.js"
  },
  target: 'electron-renderer',
  module: {
    loaders: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
        query: {
          presets: ['es2015']
        }
      }
    ]
  }
}

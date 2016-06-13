module.exports={
  entry: ["./src/index.js"],
  output: {
    path: __dirname+"/dist",
    filename: "index.js"
  },
  module: {
    loaders: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
        query: {
          presets: ['react', 'es2015']
        }
      }
    ]
  }
}
